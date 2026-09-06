/**
 * VCF 4.2+ parser (plain text; callers inflate bgzip first via decompress.ts).
 *
 * Responsibility: read the sample list from the #CHROM header line and the
 * GT field of every record into a GenotypeBuilder. Only CHROM, POS, ID, REF,
 * ALT, FORMAT and the GT sub-field are used; INFO, QUAL and FILTER are
 * ignored (filtering belongs upstream, e.g. bcftools). Phasing is ignored
 * (0|1 and 0/1 are the same unordered pair). Haploid calls are treated as
 * homozygous. Multiallelic ALT is supported (allele index = position in
 * REF,ALT list). Records without an ID get `${chrom}_${pos}`.
 *
 * Interface: parseVcf(text) -> ParsedGenotypes.
 */
import { MISSING_ALLELE } from '../core/types.ts';
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';

export function parseVcf(text: string): ParsedGenotypes {
  let builder: GenotypeBuilder | null = null;
  let start = 0;
  const n = text.length;
  let lineNo = 0;
  let sawFileformat = false;

  while (start < n) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = n;
    let line = text.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    start = end + 1;
    lineNo++;
    if (line.length === 0) continue;
    if (line.startsWith('##')) {
      if (line.startsWith('##fileformat=')) sawFileformat = true;
      continue;
    }
    if (line.startsWith('#CHROM')) {
      const cols = line.split('\t');
      if (cols.length < 10) throw new Error('VCF header has no sample columns');
      builder = new GenotypeBuilder(cols.slice(9));
      continue;
    }
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
  if (builder === null) throw new Error('VCF: no #CHROM header line found');
  const parsed = builder.finish();
  if (!sawFileformat) parsed.warnings.push('VCF: no ##fileformat line; parsed as VCF 4.2');
  return parsed;
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
