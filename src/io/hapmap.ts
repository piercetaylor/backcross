/**
 * HapMap (TASSEL-style) parser.
 *
 * Responsibility: read the 11 fixed columns (rs#, alleles, chrom, pos, strand,
 * assembly#, center, protLSID, assayLSID, panelLSID, QCcode) and the taxa
 * columns that follow. Genotype cells may be two characters ("AA", "AT"), a
 * slash pair ("A/T"), or a single IUPAC code (A,C,G,T; R,Y,S,W,K,M for
 * heterozygotes). "N", "NN", "-", "--", "" are missing. The allele list is
 * seeded from the `alleles` column ("A/T") and extended when a cell carries
 * another nucleotide.
 *
 * Interface: parseHapMap(text) -> ParsedGenotypes.
 */
import { MISSING_ALLELE } from '../core/types.ts';
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';

const IUPAC_HET: Record<string, [string, string]> = {
  R: ['A', 'G'],
  Y: ['C', 'T'],
  S: ['C', 'G'],
  W: ['A', 'T'],
  K: ['G', 'T'],
  M: ['A', 'C'],
};

const MISSING_CELLS = new Set(['', 'N', 'NN', '-', '--', 'NA', './.', '.']);

export function parseHapMap(text: string): ParsedGenotypes {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.toLowerCase().startsWith('rs#'));
  if (headerIdx === -1) throw new Error('HapMap: header line starting with "rs#" not found');
  const header = (lines[headerIdx] as string).split('\t');
  if (header.length < 12) throw new Error('HapMap: fewer than 12 columns (11 fixed + taxa)');
  const builder = new GenotypeBuilder(header.slice(11));
  const nSamples = builder.sampleIds.length;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.length === 0 || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length !== header.length) {
      throw new Error(`HapMap line ${i + 1}: ${f.length} columns, header has ${header.length}`);
    }
    const id = f[0] as string;
    const alleles = (f[1] as string)
      .split('/')
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && a !== 'N');
    const chrom = f[2] as string;
    const pos = Number(f[3]);
    const offset = builder.push(id, chrom, pos, alleles);
    for (let s = 0; s < nSamples; s++) {
      const cell = (f[11 + s] as string).trim().toUpperCase();
      if (MISSING_CELLS.has(cell)) continue;
      const [x, y] = cellToSymbols(cell);
      builder.setCall(offset, s, alleleIndex(alleles, x), alleleIndex(alleles, y));
    }
  }
  return builder.finish();
}

function cellToSymbols(cell: string): [string, string] {
  if (cell.length === 1) {
    const het = IUPAC_HET[cell];
    if (het) return het;
    return [cell, cell];
  }
  if (cell.length === 2) return [cell[0] as string, cell[1] as string];
  if (cell.length === 3 && (cell[1] === '/' || cell[1] === '|'))
    return [cell[0] as string, cell[2] as string];
  throw new Error(`HapMap: cannot interpret genotype cell "${cell}"`);
}

function alleleIndex(alleles: string[], symbol: string): number {
  if (symbol === 'N' || symbol === '-') return MISSING_ALLELE;
  let i = alleles.indexOf(symbol);
  if (i === -1) {
    alleles.push(symbol);
    i = alleles.length - 1;
  }
  return i;
}
