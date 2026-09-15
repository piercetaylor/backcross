/**
 * Position text shared by the VCF, HapMap, wide-CSV and markers.csv parsers
 * (contract/data-contract.md 1.2.0, "Genotype file"). Mirrors
 * progeny-selector src/progeny_selector/io/position.py, so both repositories
 * accept and reject the same cells.
 *
 * Responsibility: read one position cell as a non-negative whole number. The
 * trimmed cell must be decimal digits with an optional sign, fraction and
 * exponent ("1000", "+1000", "1000.0", "1e3", "1.0E3", "1.9E+07"), and the
 * value must be finite, equal to its floor and not negative. Anything else
 * throws naming `where` and the cell: empty, a non-zero fraction ("100.7",
 * "1e-3"), a negative number, NaN, Infinity, hexadecimal, "_" or ","
 * separators. Number() alone would read "" as 0 and "0x10" as 16, which is
 * why the grammar is checked first. Plain digits go through Number() too:
 * posBp is stored as float64, so nothing is gained by an integer path.
 * VCF POS uses the 'digits' grammar.
 *
 * Interface: parsePosition(raw, where, grammar = 'number') -> number; grammar
 * 'digits' (VCF POS) accepts decimal digits only.
 */

const POSITION = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const DIGITS = /^\d+$/;

/** grammar 'number' (HapMap, wide CSV, markers.csv) or 'digits' (VCF POS, declared Integer by the VCF specification). */
export function parsePosition(
  raw: string,
  where: string,
  grammar: 'number' | 'digits' = 'number',
): number {
  const cell = raw.trim();
  const value = (grammar === 'digits' ? DIGITS : POSITION).test(cell) ? Number(cell) : NaN;
  if (!Number.isFinite(value) || Math.floor(value) !== value || value < 0) {
    const expected =
      grammar === 'digits'
        ? 'decimal digits; VCF POS is an Integer'
        : 'a whole number such as 1000, 1000.0 or 1e3';
    throw new Error(`${where}: invalid position "${cell}" (expected ${expected})`);
  }
  // "-0" and "-0.0" are zero, not negative; store +0 as progeny-selector's int() does.
  return value === 0 ? 0 : value;
}
