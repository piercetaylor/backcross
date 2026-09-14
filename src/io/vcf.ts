/**
 * VCF 4.2+ parser, line by line.
 *
 * Responsibility: read the sample list from the #CHROM header line and the
 * GT field of every record into a GenotypeBuilder. Only CHROM, POS, ID, REF,
 * ALT, FORMAT and the GT sub-field are used; INFO, QUAL and FILTER are
 * ignored (filtering belongs upstream, e.g. bcftools). Phasing is ignored
 * (0|1 and 0/1 are the same unordered pair). Haploid calls are treated as
 * homozygous. Multiallelic ALT is supported (allele index = position in
 * REF,ALT list). Records without an ID get `${chrom}_${pos}`.
 *
 * The per-line body lives in VcfLineParser, which never sees more than one
 * line, so the streaming loader (loaders.ts, parseGenotypesSource) can feed
 * it from an inflating byte stream without holding the text. `parseVcf`
 * splits an in-memory text and `parseVcfLines` drains an async iterable of
 * lines; both go through the same class. Callers inflate first
 * (decompress.ts). Lines arrive without their `\n`; a trailing `\r` is
 * stripped here too.
 *
 * Interface: class VcfLineParser { pushLine(line); finish() -> ParsedGenotypes },
 * parseVcf(text) -> ParsedGenotypes,
 * parseVcfLines(lines) -> Promise<{ parsed, peakBuilderBytes }>.
 */
import { MISSING_ALLELE } from '../core/types.ts';
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';

export class VcfLineParser {
  private builder: GenotypeBuilder | null = null;
  private lineNo = 0;
  private sawFileformat = false;

  /** Bytes the builder has accounted at its peak (GenotypeBuilder.peakBytes); 0 before #CHROM. */
  get peakBuilderBytes(): number {
    return this.builder?.peakBytes ?? 0;
  }

  pushLine(raw: string): void {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    this.lineNo++;
    const lineNo = this.lineNo;
    if (line.length === 0) return;
    if (line.startsWith('##')) {
      if (line.startsWith('##fileformat=')) this.sawFileformat = true;
      return;
    }
    if (line.startsWith('#CHROM')) {
      const cols = line.split('\t');
      if (cols.length < 10) throw new Error('VCF header has no sample columns');
      this.builder = new GenotypeBuilder(cols.slice(9));
      return;
    }
    const builder = this.builder;
    if (builder === null) throw new Error(`VCF: data line ${lineNo} before #CHROM header`);

    const f = line.split('\t');
    if (f.length < 10) throw new Error(`VCF line ${lineNo}: expected FORMAT and sample columns`);
    const chrom = f[0] as string;
    const pos = Number(f[1]);
    const id = f[2] === '.' || f[2] === '' ? `${chrom}_${f[1]}` : (f[2] as string);
    const ref = f[3] as string;
    const alt = f[4] as string;
    const alleles = alt === '.' || alt === '' ? [ref] : [ref, ...alt.split(',')];
    const format = (f[8] as string).split(':');
    const gtIdx = format.indexOf('GT');
    if (gtIdx === -1) throw new Error(`VCF line ${lineNo}: FORMAT has no GT field`);

    const offset = builder.push(id, chrom, pos, alleles);
    const nSamples = builder.sampleIds.length;
    if (f.length - 9 !== nSamples) {
      throw new Error(`VCF line ${lineNo}: ${f.length - 9} sample fields, header has ${nSamples}`);
    }
    for (let s = 0; s < nSamples; s++) {
      const field = f[9 + s] as string;
      const gt = gtIdx === 0 ? cutAtColon(field) : (field.split(':')[gtIdx] ?? '.');
      if (gt === '.' || gt === './.' || gt === '.|.' || gt === '') continue;
      const [x, y] = parseGt(gt);
      builder.setCall(offset, s, x, y);
    }
  }

  finish(): ParsedGenotypes {
    if (this.builder === null) throw new Error('VCF: no #CHROM header line found');
    const parsed = this.builder.finish();
    if (!this.sawFileformat) parsed.warnings.push('VCF: no ##fileformat line; parsed as VCF 4.2');
    return parsed;
  }
}

export function parseVcf(text: string): ParsedGenotypes {
  const parser = new VcfLineParser();
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = n;
    parser.pushLine(text.slice(start, end));
    start = end + 1;
  }
  return parser.finish();
}

/** Drains `lines` into a VcfLineParser; returns it finished, with its peak accounting. */
export async function parseVcfLines(
  lines: AsyncIterable<string>,
): Promise<{ parsed: ParsedGenotypes; peakBuilderBytes: number }> {
  const parser = new VcfLineParser();
  for await (const line of lines) parser.pushLine(line);
  const parsed = parser.finish();
  return { parsed, peakBuilderBytes: parser.peakBuilderBytes };
}

function cutAtColon(s: string): string {
  const i = s.indexOf(':');
  return i === -1 ? s : s.slice(0, i);
}

function parseGt(gt: string): [number, number] {
  const sep = gt.indexOf('/') !== -1 ? '/' : '|';
  const parts = gt.split(sep);
  const x = parts[0] === '.' || parts[0] === undefined ? MISSING_ALLELE : Number(parts[0]);
  const y =
    parts.length === 1
      ? x
      : parts[1] === '.' || parts[1] === undefined
        ? MISSING_ALLELE
        : Number(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`invalid GT value: ${gt}`);
  return [x, y];
}
