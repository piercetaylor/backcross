/**
 * Boundary: bytes in, validated Dataset out.
 *
 * Responsibility: detect the genotype format (by file name, then content),
 * decompress if needed, dispatch to the right parser, join with the sample
 * manifest and optional marker map, and validate the cross-file contract:
 * every manifest sample must exist in the genotype file (except parents of a
 * coded matrix), genotype samples absent from the manifest are dropped with
 * a warning, chromosome names are normalized, markers sorted. This is the
 * only place where validation happens; everything downstream trusts Dataset.
 *
 * Two genotype entries. `parseGenotypesBytes` is synchronous: inflate the
 * whole file, decode it, parse the text. `parseGenotypesSource` is the
 * streaming entry the worker and the CLI use: it inflates chunk by chunk
 * (decompress.ts, inflateIfGzip, which verifies every gzip member's CRC32
 * and ISIZE and rejects a truncated stream), counts the inflated bytes,
 * splits lines (stream.ts) and detects the format by calling
 * `detectGenotypeFormat` on a head window: lines are buffered until they
 * reach HEAD_WINDOW_CHARS (4096, the window `detectGenotypeFormat` reads) or
 * the stream ends, and joined with `\n`, so both entries see the same head
 * and agree. Leading blank lines are removed from the head before the
 * content tests (contract 1.3.0). (For a CRLF file the stripped `\r`s let the stream window reach
 * a few characters further than the text window; only a header straddling
 * character 4096 could be detected differently.) A VCF is then parsed line
 * by line, so the inflated text is never held; HapMap and wide CSV are
 * collected to text and parsed as before. The result carries
 * `bytesInflated` and, for VCF, `peakBuilderBytes` (0 for the text formats,
 * whose peak is not accounted).
 *
 * `ParseOptions` carries the wide-CSV mode and the token profile
 * (profiles.ts, contract 1.4.0); a profile with a VCF is an error in both
 * entries, before any record is read. `assembleDataset` records the profile's
 * label (`default`, a built-in id or `custom:<id>`) on the Dataset.
 *
 * Interface: ParseOptions, detectGenotypeFormat(name, text),
 * parseGenotypesText(text, format, options?), parseGenotypesBytes(name, bytes, options?),
 * parseGenotypesSource(name, source, options?) -> Promise<StreamedGenotypes>,
 * assembleDataset(parsed, samples, markerMap?, meta?) -> { dataset, warnings }.
 */
import { buildChromosomeOrder, compareChromosomes } from '../core/chromosomes.ts';
import type { Dataset, GenotypeMatrix, SampleRecord } from '../core/types.ts';
import type { ParsedGenotypes } from './builder.ts';
import { bytesToText, inflateIfGzip } from './decompress.ts';
import { parseHapMap } from './hapmap.ts';
import { DEFAULT_PROFILE_ID } from './profiles.ts';
import type { TokenProfile } from './profiles.ts';
import { applyMarkerMap } from './markers.ts';
import type { MarkerMap } from './markers.ts';
import { countBytes, lines } from './stream.ts';
import type { ByteSource } from './stream.ts';
import { parseVcf, parseVcfLines } from './vcf.ts';
import { parseWideCsv } from './wide-csv.ts';
import type { WideCsvMode } from './wide-csv.ts';

export type GenotypeFormat = 'vcf' | 'hapmap' | 'wide-csv';

export interface ParseOptions {
  mode?: WideCsvMode;
  profile?: TokenProfile | null;
}

function rejectProfileForVcf(options: ParseOptions | undefined): void {
  const profile = options?.profile ?? null;
  if (profile !== null) {
    throw new Error(
      `token profile "${profile.id}" applies to HapMap and wide CSV; the genotype file is VCF`,
    );
  }
}

/** Characters of the decoded text `detectGenotypeFormat` inspects. */
const HEAD_WINDOW_CHARS = 4096;

/** Blank lines before the first content line; detection reads the first non-blank line (contract 1.3.0). */
const LEADING_BLANK_LINES = /^(?:[ \t]*\r?\n)+/;

export function detectGenotypeFormat(fileName: string, text: string): GenotypeFormat {
  const name = fileName.toLowerCase().replace(/\.(gz|bgz)$/, '');
  if (name.endsWith('.vcf')) return 'vcf';
  if (name.endsWith('.hmp.txt') || name.endsWith('.hmp') || name.endsWith('.hapmap'))
    return 'hapmap';
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    const head = text.slice(0, HEAD_WINDOW_CHARS).replace(LEADING_BLANK_LINES, '');
    if (head.startsWith('##fileformat=VCF') || head.includes('\n#CHROM')) return 'vcf';
    if (/^rs#/i.test(head)) return 'hapmap';
    return 'wide-csv';
  }
  const head = text.slice(0, HEAD_WINDOW_CHARS).replace(LEADING_BLANK_LINES, '');
  if (head.startsWith('##fileformat=VCF')) return 'vcf';
  if (/^rs#/i.test(head)) return 'hapmap';
  return 'wide-csv';
}

export function parseGenotypesText(
  text: string,
  format: GenotypeFormat,
  options?: ParseOptions,
): ParsedGenotypes {
  switch (format) {
    case 'vcf':
      rejectProfileForVcf(options);
      return parseVcf(text);
    case 'hapmap':
      return parseHapMap(text, options);
    case 'wide-csv':
      return parseWideCsv(text, options);
  }
}

export function parseGenotypesBytes(
  fileName: string,
  bytes: Uint8Array,
  options?: ParseOptions,
): ParsedGenotypes {
  const text = bytesToText(bytes);
  return parseGenotypesText(text, detectGenotypeFormat(fileName, text), options);
}

export interface StreamedGenotypes extends ParsedGenotypes {
  /** Bytes after inflation (the file size, for uncompressed input). */
  bytesInflated: number;
  /** GenotypeBuilder.peakBytes for a streamed VCF; 0 for HapMap and wide CSV. */
  peakBuilderBytes: number;
}

export async function parseGenotypesSource(
  fileName: string,
  source: ByteSource,
  options?: ParseOptions,
): Promise<StreamedGenotypes> {
  const counter = { bytes: 0 };
  const iterator = lines(countBytes(inflateIfGzip(source), counter))[Symbol.asyncIterator]();
  // Buffer the head window: lines until their joined length reaches the window, or EOF.
  const head: string[] = [];
  let headChars = 0;
  while (headChars < HEAD_WINDOW_CHARS) {
    const next = await iterator.next();
    if (next.done === true) break;
    head.push(next.value);
    headChars += next.value.length + 1;
  }
  const format = detectGenotypeFormat(fileName, head.join('\n'));
  const all: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      yield* head;
      yield* { [Symbol.asyncIterator]: () => iterator };
    },
  };
  if (format === 'vcf') {
    rejectProfileForVcf(options);
    const { parsed, peakBuilderBytes } = await parseVcfLines(all);
    return { ...parsed, bytesInflated: counter.bytes, peakBuilderBytes };
  }
  const collected: string[] = [];
  for await (const line of all) collected.push(line);
  const parsed = parseGenotypesText(collected.join('\n'), format, options);
  return { ...parsed, bytesInflated: counter.bytes, peakBuilderBytes: 0 };
}

/** Keep only the manifest's samples, in manifest order; returns the column subset. */
function subsetColumns(g: GenotypeMatrix, keep: number[]): GenotypeMatrix {
  const n = keep.length;
  const a1 = new Uint8Array(g.nMarkers * n);
  const a2 = new Uint8Array(g.nMarkers * n);
  for (let m = 0; m < g.nMarkers; m++) {
    const src = m * g.nSamples;
    const dst = m * n;
    for (let j = 0; j < n; j++) {
      a1[dst + j] = g.allele1[src + (keep[j] as number)] as number;
      a2[dst + j] = g.allele2[src + (keep[j] as number)] as number;
    }
  }
  return {
    nMarkers: g.nMarkers,
    nSamples: n,
    sampleIds: keep.map((i) => g.sampleIds[i] as string),
    allele1: a1,
    allele2: a2,
  };
}

export function assembleDataset(
  parsed: ParsedGenotypes,
  samples: SampleRecord[],
  markerMap?: MarkerMap,
  meta: { tokenProfile: string } = { tokenProfile: DEFAULT_PROFILE_ID },
): { dataset: Dataset; warnings: string[] } {
  const warnings = [...parsed.warnings];
  const { markers } = parsed;
  if (markerMap !== undefined) warnings.push(...applyMarkerMap(markers, markerMap));

  const colOf = new Map(parsed.genotypes.sampleIds.map((id, i) => [id, i] as const));
  const missingSamples: string[] = [];
  const keep: number[] = [];
  const keptSamples: SampleRecord[] = [];
  for (const s of samples) {
    const col = colOf.get(s.sampleId);
    if (col === undefined) {
      const isParent = s.role === 'recurrent_parent' || s.role === 'donor_parent';
      if (parsed.coded && isParent) {
        keptSamples.push(s); // coded matrices carry origin in the symbols; parent columns are optional
        continue;
      }
      missingSamples.push(s.sampleId);
      continue;
    }
    keep.push(col);
    keptSamples.push(s);
  }
  if (missingSamples.length > 0) {
    throw new Error(
      `samples.csv lists sample(s) absent from the genotype file: ${missingSamples.join(', ')}`,
    );
  }
  const inManifest = new Set(samples.map((s) => s.sampleId));
  const dropped = parsed.genotypes.sampleIds.filter((id) => !inManifest.has(id));
  if (dropped.length > 0) {
    warnings.push(
      `${dropped.length} genotype sample(s) not in samples.csv were ignored: ${dropped.slice(0, 5).join(', ')}${dropped.length > 5 ? ', ...' : ''}`,
    );
  }
  const genotypes = subsetColumns(parsed.genotypes, keep);

  const rp = keptSamples.find((s) => s.role === 'recurrent_parent') as SampleRecord;
  const donor = keptSamples.find((s) => s.role === 'donor_parent') as SampleRecord;
  const recurrentParentCol = genotypes.sampleIds.indexOf(rp.sampleId);
  const donorParentCol = genotypes.sampleIds.indexOf(donor.sampleId);
  if (!parsed.coded && (recurrentParentCol === -1 || donorParentCol === -1)) {
    throw new Error('both parents must have genotype columns unless the matrix is coded A/B/H');
  }

  const chromosomeOrder = buildChromosomeOrder(markers.chrom);
  const chromPos = new Map(chromosomeOrder.map((c, i) => [c, i] as const));
  const chromIndex = Int32Array.from(markers.chrom, (c) => chromPos.get(c) as number);
  const sortedMarkerOrder = Int32Array.from(markers.ids.keys()).sort((a, b) => {
    const ca = markers.chrom[a] as string;
    const cb = markers.chrom[b] as string;
    if (ca !== cb) return compareChromosomes(ca, cb);
    return (markers.posBp[a] as number) - (markers.posBp[b] as number);
  });

  return {
    dataset: {
      markers,
      genotypes,
      samples: keptSamples,
      recurrentParentCol,
      donorParentCol,
      coded: parsed.coded,
      chromosomeOrder,
      chromIndex,
      sortedMarkerOrder,
      tokenProfile: meta.tokenProfile,
    },
    warnings,
  };
}
