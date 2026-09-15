/**
 * HapMap (TASSEL-style) parser.
 *
 * Responsibility: read the 11 fixed columns (rs#, alleles, chrom, pos, strand,
 * assembly#, center, protLSID, assayLSID, panelLSID, QCcode) and the taxa
 * columns that follow. Cells go through calls.ts: two characters ("AA",
 * "AT"), a slash or bar pair ("A/T"), one nucleotide, or one IUPAC code
 * (R, Y, S, W, K, M) read as its two nucleotides; missing = "", "N", "NN",
 * "NA", "-", "--", ".", "./.", ".|.", "X", "XX" (contract 1.1.0); any other
 * cell is an error naming the cell. The allele list is seeded from the
 * `alleles` column ("A/T") and extended when a cell carries another
 * nucleotide.
 *
 * Interface: parseHapMap(text) -> ParsedGenotypes.
 */
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';
import { HAPMAP_MISSING, parseNucleotideCell, symbolIndex } from './calls.ts';

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
      const pair = parseNucleotideCell(f[11 + s] as string, HAPMAP_MISSING, `HapMap line ${i + 1}`);
      if (pair === null) continue;
      builder.setCall(offset, s, symbolIndex(alleles, pair[0]), symbolIndex(alleles, pair[1]));
    }
  }
  return builder.finish();
}
