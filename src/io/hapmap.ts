/**
 * HapMap (TASSEL-style) parser.
 *
 * Responsibility: read the 11 fixed columns (rs#, alleles, chrom, pos, strand,
 * assembly#, center, protLSID, assayLSID, panelLSID, QCcode) and the taxa
 * columns that follow. Cells go through calls.ts: two characters ("AA",
 * "AT"), a slash or bar pair ("A/T"), one nucleotide, or one IUPAC code
 * (R, Y, S, W, K, M) read as its two nucleotides; missing = "", "N", "NN",
 * "NA", "-", "--", ".", "./.", ".|.", "X", "XX" (contract 1.1.0); any other
 * cell is an error naming the cell. `pos` goes through position.ts (contract 1.2.0). The allele list is seeded from the
 * `alleles` column ("A/T") and extended when a cell carries another
 * nucleotide (upper-cased). Blank and whitespace-only lines are skipped wherever they occur;
 * the header is the first line that is not blank and must start with "rs#";
 * there are no comment lines (contract 1.3.0). Under a token profile
 * (options.profile, contract 1.4.0) cells go through the profile first; a
 * heterozygote token that names no alleles resolves after the row to the
 * marker's two alleles (the `alleles` column plus the symbols the cells show),
 * and any other number of alleles is an error naming the cell. A profile with
 * mode 'coded' is an error.
 *
 * Interface: parseHapMap(text, options?: ParseOptions) -> ParsedGenotypes.
 */
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';
import {
  HAPMAP_MISSING,
  HET_OF_MARKER,
  parseNucleotideCell,
  resolveHetOfMarker,
  symbolIndex,
} from './calls.ts';
import type { ParseOptions } from './loaders.ts';
import { compileProfile } from './profiles.ts';
import { parsePosition } from './position.ts';

/** A line that is empty or holds only spaces and tabs (contract 1.3.0). */
const BLANK_LINE = /^[ \t]*$/;

export function parseHapMap(text: string, options?: ParseOptions): ParsedGenotypes {
  const profileRaw = options?.profile ?? null;
  if (profileRaw !== null && options?.mode === 'coded') {
    throw new Error(
      `token profile "${profileRaw.id}" applies to HapMap and wide CSV nucleotide calls; coded A/B/H mode was requested`,
    );
  }
  const profile = profileRaw === null ? undefined : compileProfile(profileRaw);
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => !BLANK_LINE.test(l));
  if (headerIdx === -1) throw new Error('HapMap: header line starting with "rs#" not found');
  const headerLine = lines[headerIdx] as string;
  if (!headerLine.toLowerCase().startsWith('rs#')) {
    throw new Error(
      `HapMap: header line starting with "rs#" not found (line ${headerIdx + 1} is "${headerLine.slice(0, 40)}")`,
    );
  }
  const header = (lines[headerIdx] as string).split('\t');
  if (header.length < 12) throw new Error('HapMap: fewer than 12 columns (11 fixed + taxa)');
  const builder = new GenotypeBuilder(header.slice(11));
  const nSamples = builder.sampleIds.length;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (BLANK_LINE.test(line)) continue;
    const f = line.split('\t');
    if (f.length !== header.length) {
      throw new Error(`HapMap line ${i + 1}: ${f.length} columns, header has ${header.length}`);
    }
    const id = f[0] as string;
    const alleles = (f[1] as string)
      .split('/')
      .map((a) => a.trim().toUpperCase())
      .filter((a) => a.length > 0 && a !== 'N');
    const chrom = f[2] as string;
    const pos = parsePosition(f[3] as string, `HapMap line ${i + 1}`);
    const offset = builder.push(id, chrom, pos, alleles);
    const where = `HapMap line ${i + 1}`;
    const pending: number[] = [];
    for (let s = 0; s < nSamples; s++) {
      const pair = parseNucleotideCell(f[11 + s] as string, HAPMAP_MISSING, where, profile);
      if (pair === null) continue;
      if (pair === HET_OF_MARKER) {
        pending.push(s);
        continue;
      }
      builder.setCall(offset, s, symbolIndex(alleles, pair[0]), symbolIndex(alleles, pair[1]));
    }
    for (const s of pending) {
      const cell = (f[11 + s] as string).trim().toUpperCase();
      const pair = resolveHetOfMarker(alleles, where, cell);
      builder.setCall(offset, s, symbolIndex(alleles, pair[0]), symbolIndex(alleles, pair[1]));
    }
  }
  return builder.finish();
}
