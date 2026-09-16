/**
 * Wide genotype CSV/TSV parser (contract/data-contract.md, "Wide CSV").
 *
 * Responsibility: read a matrix with columns marker_id, chrom, pos_bp and one
 * column per sample. Two cell vocabularies are supported:
 *   - nucleotide (calls.ts): "A" (homozygous), "A/T", "A|T" or "AT"
 *     (heterozygous), "AA", one IUPAC code R Y S W K M (its two
 *     nucleotides); missing = "", "N", "NN", "NA", "-", "--", ".", "./.",
 *     ".|."; any other cell ("?", "B", "H", "X", "XX", "0", "+", "A?") is an
 *     error naming the cell.
 *   - coded: A = recurrent-parent allele, B = donor allele, H = heterozygous;
 *     missing = "", "N", "NA" only, any other cell is an error. Allele 0 is A and
 *     allele 1 is B at every marker, so origin is defined without parent columns.
 * Mode 'auto' scans every row of the file (no row window) and selects coded when
 * every cell outside the nucleotide missing set is in {A, B, H} and at least one
 * B or H occurs; otherwise nucleotide.
 * Blank and all-empty rows are skipped by csv.ts (contract 1.3.0); in any
 * other row an empty marker_id or an invalid pos_bp (position.ts) is an error naming
 * the line (contract 1.2.0).
 *
 * Interface: parseWideCsv(text, mode = 'auto') -> ParsedGenotypes.
 */
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';
import { NUCLEOTIDE_MISSING, parseNucleotideCell, symbolIndex } from './calls.ts';
import { forEachRow, normalizeHeader, requireColumns, sniffDelimiter } from './csv.ts';
import { parsePosition } from './position.ts';

export type WideCsvMode = 'auto' | 'nucleotide' | 'coded';

/** Coded-mode missing cells; anything else outside A, B, H is an error in coded mode. */
const CODED_MISSING = new Set(['', 'N', 'NA']);
const CODED_SYMBOLS = new Set(['A', 'B', 'H']);

export function detectWideCsvMode(text: string): 'nucleotide' | 'coded' {
  const delimiter = sniffDelimiter(text);
  let sawBorH = false;
  let onlyCoded = true;
  let sawHeader = false;
  forEachRow(
    text,
    delimiter,
    (f) => {
      // The header is the first row forEachRow yields, not necessarily line 1 (contract 1.3.0).
      if (!sawHeader) {
        sawHeader = true;
        return;
      }
      if (!onlyCoded) return;
      for (let i = 3; i < f.length; i++) {
        const cell = (f[i] as string).trim().toUpperCase();
        if (NUCLEOTIDE_MISSING.has(cell)) continue;
        if (!CODED_SYMBOLS.has(cell)) {
          onlyCoded = false;
          return;
        }
        if (cell !== 'A') sawBorH = true;
      }
    },
    'wide genotype CSV',
  );
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

  forEachRow(
    text,
    delimiter,
    (f, lineNumber) => {
      if (builder === null) {
        const header = normalizeHeader(f);
        requireColumns(header, ['marker_id', 'chrom', 'pos_bp'], 'wide genotype CSV');
        idCol = header.indexOf('marker_id');
        chromCol = header.indexOf('chrom');
        posCol = header.indexOf('pos_bp');
        sampleCols = f
          .map((_, i) => i)
          .filter((i) => i !== idCol && i !== chromCol && i !== posCol);
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
      const id = (f[idCol] as string).trim();
      if (id === '') throw new Error(`wide genotype CSV line ${lineNumber}: empty marker_id`);
      const alleles = resolved === 'coded' ? ['A', 'B'] : [];
      const offset = builder.push(
        id,
        f[chromCol] as string,
        parsePosition(f[posCol] as string, `wide genotype CSV line ${lineNumber}`),
        alleles,
      );
      for (let s = 0; s < sampleCols.length; s++) {
        const raw = f[sampleCols[s] as number] as string;
        if (resolved === 'coded') {
          const cell = raw.trim().toUpperCase();
          if (CODED_MISSING.has(cell)) continue;
          if (cell === 'A') builder.setCall(offset, s, 0, 0);
          else if (cell === 'B') builder.setCall(offset, s, 1, 1);
          else if (cell === 'H') builder.setCall(offset, s, 0, 1);
          else
            throw new Error(
              `coded genotype CSV line ${lineNumber}: unexpected cell "${cell}" (expected A, B, H or missing)`,
            );
        } else {
          const pair = parseNucleotideCell(
            raw,
            NUCLEOTIDE_MISSING,
            `wide genotype CSV line ${lineNumber}`,
          );
          if (pair === null) continue;
          builder.setCall(offset, s, symbolIndex(alleles, pair[0]), symbolIndex(alleles, pair[1]));
        }
      }
    },
    'wide genotype CSV',
  );
  if (builder === null) throw new Error('wide genotype CSV: no header row');
  return (builder as GenotypeBuilder).finish();
}
