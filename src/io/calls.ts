/**
 * Per-cell nucleotide vocabulary shared by the HapMap and wide-CSV parsers
 * (contract/data-contract.md 1.1.0, "HapMap" and "Wide CSV"). Mirrors
 * progeny-selector src/progeny_selector/io/calls.py so both repositories
 * accept and reject the same cells. VCF (GT indices) and the BrAPI loader
 * do not use it.
 *
 * Responsibility: read one cell as an unordered pair of allele symbols,
 * null for a missing token, or throw naming the cell:
 *   - trimmed and upper-cased; a token in `missing` (NUCLEOTIDE_MISSING
 *     for wide CSV, HAPMAP_MISSING for HapMap, which adds X and XX) -> null;
 *   - one character: A C G T -> homozygous; R Y S W K M -> the IUPAC
 *     heterozygote; anything else ("?", "B", "H", "X", "0", "+") -> error;
 *   - two characters, or three with "/" or "|" in the middle: each must be
 *     A C G T or one of N - . ; a pair containing N, - or . is read as
 *     missing (half-missing cells such as "AN" are undecided in 1.1.0;
 *     this keeps the pre-1.1.0 wide-CSV reading); any other character
 *     ("A?", "N?", "RR") -> error;
 *   - anything else -> error.
 *
 * Under a token profile (profiles.ts, contract 1.4.0) a cell is resolved in
 * this order: the profile's missing tokens; the format's `missing` when the
 * profile's base is nucleotide; the profile's homozygous tokens; its
 * heterozygous tokens (a `*` token returns HET_OF_MARKER, resolved by the
 * parser once the row's alleles are known); the grammar above when the base
 * is nucleotide; otherwise the unexpected-cell error.
 *
 * Interface: NUCLEOTIDE_MISSING, HAPMAP_MISSING, IUPAC_HET, HET_OF_MARKER,
 * parseNucleotideCell(raw, missing, where, profile?) -> [string, string] | null | typeof HET_OF_MARKER,
 * resolveHetOfMarker(alleles, where, cell) -> [string, string] (throws unless two alleles, neither `-`),
 * symbolIndex(alleles, symbol) -> number (appends an unseen symbol).
 */
import type { CompiledProfile } from './profiles.ts';

/** Returned for a profile heterozygote token that names no alleles (`*`). */
export const HET_OF_MARKER: unique symbol = Symbol('het-of-marker');

export const NUCLEOTIDE_MISSING: ReadonlySet<string> = new Set([
  '',
  'N',
  'NN',
  'NA',
  '-',
  '--',
  '.',
  './.',
  '.|.',
]);

export const HAPMAP_MISSING: ReadonlySet<string> = new Set([...NUCLEOTIDE_MISSING, 'X', 'XX']);

export const IUPAC_HET: Readonly<Record<string, readonly [string, string]>> = {
  R: ['A', 'G'],
  Y: ['C', 'T'],
  S: ['C', 'G'],
  W: ['A', 'T'],
  K: ['G', 'T'],
  M: ['A', 'C'],
};

const NUCLEOTIDES: ReadonlySet<string> = new Set(['A', 'C', 'G', 'T']);
const HALF_MISSING: ReadonlySet<string> = new Set(['N', '-', '.']);

export function parseNucleotideCell(
  raw: string,
  missing: ReadonlySet<string>,
  where: string,
  profile?: CompiledProfile,
): [string, string] | null | typeof HET_OF_MARKER {
  const cell = raw.trim().toUpperCase();
  if (profile !== undefined) {
    if (profile.missing.has(cell)) return null;
    if (profile.base === 'nucleotide' && missing.has(cell)) return null;
    const hom = profile.homozygous.get(cell);
    if (hom !== undefined) return [hom, hom];
    const het = profile.heterozygous.get(cell);
    if (het === '*') return HET_OF_MARKER;
    if (het !== undefined) return [het[0], het[1]];
    if (profile.base === 'none') {
      throw new Error(
        `${where}: unexpected cell "${cell}" (not a token of the "${profile.label}" token profile)`,
      );
    }
  } else if (missing.has(cell)) return null;
  const fail = (): never => {
    throw new Error(
      `${where}: unexpected cell "${cell}" (expected A, C, G, T, an IUPAC code R Y S W K M, a pair such as A/T or AT, or a missing token)`,
    );
  };
  if (cell.length === 1) {
    if (NUCLEOTIDES.has(cell)) return [cell, cell];
    const het = IUPAC_HET[cell];
    return het === undefined ? fail() : [het[0], het[1]];
  }
  let pair: [string, string];
  if (cell.length === 2) pair = [cell[0] as string, cell[1] as string];
  else if (cell.length === 3 && (cell[1] === '/' || cell[1] === '|'))
    pair = [cell[0] as string, cell[2] as string];
  else return fail();
  for (const c of pair) if (!NUCLEOTIDES.has(c) && !HALF_MISSING.has(c)) return fail();
  if (HALF_MISSING.has(pair[0]) || HALF_MISSING.has(pair[1])) return null;
  return pair;
}

export function resolveHetOfMarker(
  alleles: readonly string[],
  where: string,
  cell: string,
): [string, string] {
  if (alleles.length !== 2) {
    throw new Error(
      `${where}: "${cell}" is a heterozygote token but the marker shows ${alleles.length} allele(s) (${alleles.join(', ')}); it needs exactly two`,
    );
  }
  if (alleles.includes('-')) {
    throw new Error(
      `${where}: "${cell}" is a heterozygote token but the marker shows an indel allele (${alleles.join(', ')}); it needs two nucleotides`,
    );
  }
  return [alleles[0] as string, alleles[1] as string];
}

export function symbolIndex(alleles: string[], symbol: string): number {
  let i = alleles.indexOf(symbol);
  if (i === -1) {
    alleles.push(symbol);
    i = alleles.length - 1;
  }
  return i;
}
