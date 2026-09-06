/**
 * Wide genotype CSV/TSV parser (docs/data-formats.md, "Wide genotype CSV").
 *
 * Responsibility: read a matrix with columns marker_id, chrom, pos_bp and one
 * column per sample. Two cell vocabularies are supported:
 *   - nucleotide: "A" (homozygous), "A/T", "A|T" or "AT" (heterozygous),
 *     "AA" (homozygous); missing = "", "N", "NA", "-", "./.".
 *   - coded: A = recurrent-parent allele, B = donor allele, H = heterozygous,
 *     N/NA/"" = missing. Allele 0 is A and allele 1 is B at every marker, so
 *     origin is defined without parent columns.
 * Mode 'auto' selects coded when every non-missing cell is in {A, B, H} and at
 * least one B or H occurs; otherwise nucleotide.
 *
 * Interface: parseWideCsv(text, mode = 'auto') -> ParsedGenotypes.
 */
import { MISSING_ALLELE } from '../core/types.ts';
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';
import { forEachRow, normalizeHeader, requireColumns, sniffDelimiter } from './csv.ts';

export type WideCsvMode = 'auto' | 'nucleotide' | 'coded';

const MISSING_CELLS = new Set(['', 'N', 'NA', '-', '--', './.', '.', 'NN']);
const CODED_SYMBOLS = new Set(['A', 'B', 'H']);

export function detectWideCsvMode(text: string): 'nucleotide' | 'coded' {
  const delimiter = sniffDelimiter(text);
  let sawBorH = false;
  let onlyCoded = true;
  let rows = 0;
  forEachRow(text, delimiter, (f, lineNumber) => {
    if (lineNumber === 1 || rows > 2000 || !onlyCoded) return;
    rows++;
    for (let i = 3; i < f.length; i++) {
      const cell = (f[i] as string).trim().toUpperCase();
      if (MISSING_CELLS.has(cell)) continue;
      if (!CODED_SYMBOLS.has(cell)) {
        onlyCoded = false;
        return;
      }
      if (cell !== 'A') sawBorH = true;
    }
  });
  return onlyCoded && sawBorH ? 'coded' : 'nucleotide';
}

export function parseWideCsv(text: string, mode: WideCsvMode = 'auto'): ParsedGenotypes {
  const resolved = mode === 'auto' ? detectWideCsvMode(text) : mode;
  const delimiter = sniffDelimiter(text);
  let builder: GenotypeBuilder | null = null;
  let idCol = 0;
  let chromCol = 1;
  let posCol = 2;
  let sampleCols: number[] = [];

  forEachRow(text, delimiter, (f, lineNumber) => {
    if (builder === null) {
      const header = normalizeHeader(f);
      requireColumns(header, ['marker_id', 'chrom', 'pos_bp'], 'wide genotype CSV');
      idCol = header.indexOf('marker_id');
      chromCol = header.indexOf('chrom');
      posCol = header.indexOf('pos_bp');
      sampleCols = f.map((_, i) => i).filter((i) => i !== idCol && i !== chromCol && i !== posCol);
      builder = new GenotypeBuilder(
        sampleCols.map((i) => (f[i] as string).trim()),
        resolved === 'coded',
      );
      return;
    }
    if (f.length !== sampleCols.length + 3) {
      throw new Error(
        `wide genotype CSV line ${lineNumber}: expected ${sampleCols.length + 3} fields, got ${f.length}`,
      );
    }
    const alleles = resolved === 'coded' ? ['A', 'B'] : [];
    const offset = builder.push(
      (f[idCol] as string).trim(),
      f[chromCol] as string,
      Number(f[posCol]),
      alleles,
    );
    for (let s = 0; s < sampleCols.length; s++) {
      const cell = (f[sampleCols[s] as number] as string).trim().toUpperCase();
      if (MISSING_CELLS.has(cell)) continue;
      if (resolved === 'coded') {
        if (cell === 'A') builder.setCall(offset, s, 0, 0);
        else if (cell === 'B') builder.setCall(offset, s, 1, 1);
        else if (cell === 'H') builder.setCall(offset, s, 0, 1);
        else
          throw new Error(
            `coded genotype CSV line ${lineNumber}: unexpected cell "${cell}" (expected A, B, H or missing)`,
          );
      } else {
        const [x, y] = nucleotidePair(cell, lineNumber);
        builder.setCall(offset, s, alleleIndex(alleles, x), alleleIndex(alleles, y));
      }
    }
  });
  if (builder === null) throw new Error('wide genotype CSV: no header row');
  return (builder as GenotypeBuilder).finish();
}

function nucleotidePair(cell: string, lineNumber: number): [string, string] {
  if (cell.length === 1) return [cell, cell];
  if (cell.length === 2) return [cell[0] as string, cell[1] as string];
  if (cell.length === 3 && (cell[1] === '/' || cell[1] === '|'))
    return [cell[0] as string, cell[2] as string];
  throw new Error(`wide genotype CSV line ${lineNumber}: cannot interpret genotype cell "${cell}"`);
}

function alleleIndex(alleles: string[], symbol: string): number {
  if (symbol === 'N' || symbol === '-' || symbol === '.') return MISSING_ALLELE;
  let i = alleles.indexOf(symbol);
  if (i === -1) {
    alleles.push(symbol);
    i = alleles.length - 1;
  }
  return i;
}
