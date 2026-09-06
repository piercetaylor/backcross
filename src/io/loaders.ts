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
 * Interface: detectGenotypeFormat(name, text), parseGenotypesText(text, format, mode?),
 * assembleDataset(parsed, samples, markerMap?) -> { dataset, warnings }.
 */
import { buildChromosomeOrder, compareChromosomes } from '../core/chromosomes.ts';
import type { Dataset, GenotypeMatrix, SampleRecord } from '../core/types.ts';
import type { ParsedGenotypes } from './builder.ts';
import { bytesToText } from './decompress.ts';
import { parseHapMap } from './hapmap.ts';
import { applyMarkerMap } from './markers.ts';
import type { MarkerMap } from './markers.ts';
import { parseVcf } from './vcf.ts';
import { parseWideCsv } from './wide-csv.ts';
import type { WideCsvMode } from './wide-csv.ts';

export type GenotypeFormat = 'vcf' | 'hapmap' | 'wide-csv';

export function detectGenotypeFormat(fileName: string, text: string): GenotypeFormat {
  const name = fileName.toLowerCase().replace(/\.(gz|bgz)$/, '');
  if (name.endsWith('.vcf')) return 'vcf';
  if (name.endsWith('.hmp.txt') || name.endsWith('.hmp') || name.endsWith('.hapmap'))
    return 'hapmap';
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    const head = text.slice(0, 4096);
    if (head.startsWith('##fileformat=VCF') || head.includes('\n#CHROM')) return 'vcf';
    if (/^rs#/i.test(head)) return 'hapmap';
    return 'wide-csv';
  }
  const head = text.slice(0, 4096);
  if (head.startsWith('##fileformat=VCF')) return 'vcf';
  if (/^rs#/i.test(head)) return 'hapmap';
  return 'wide-csv';
}

export function parseGenotypesText(
  text: string,
  format: GenotypeFormat,
  mode: WideCsvMode = 'auto',
): ParsedGenotypes {
  switch (format) {
    case 'vcf':
      return parseVcf(text);
    case 'hapmap':
      return parseHapMap(text);
    case 'wide-csv':
      return parseWideCsv(text, mode);
  }
}

export function parseGenotypesBytes(
  fileName: string,
  bytes: Uint8Array,
  mode: WideCsvMode = 'auto',
): ParsedGenotypes {
  const text = bytesToText(bytes);
  return parseGenotypesText(text, detectGenotypeFormat(fileName, text), mode);
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
    },
    warnings,
  };
}
