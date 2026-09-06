/**
 * Per-line summary CSV (export screen, CLI, and Shiny hand-off).
 *
 * Responsibility: serialize LineRpp results into the per-line summary table
 * documented in docs/data-formats.md ("Outputs"). One row per candidate;
 * per-chromosome RPP as wide columns rpp_count_Gm01.. so the file opens
 * directly in R (`readr::read_csv`) without reshaping. Numeric NaN is written
 * as NA.
 *
 * Interface: lineSummaryCsv(lineRpp, chromosomeOrder) -> string.
 */
import type { LineRpp } from '../core/types.ts';
import { csvField } from './csv-field.ts';

function num(x: number, digits = 6): string {
  return Number.isNaN(x) ? 'NA' : x.toFixed(digits);
}

export function lineSummaryCsv(lines: LineRpp[], chromosomeOrder: string[]): string {
  const header = [
    'sample_id',
    'n_informative',
    'n_called',
    'n_rp_hom',
    'n_donor_hom',
    'n_het',
    'n_missing',
    'n_nonparental',
    'rpp_count',
    'rpp_bp',
    'rpp_cm',
    ...chromosomeOrder.map((c) => `rpp_count_${c}`),
  ];
  const rows = lines.map((l) => {
    const o = l.overall;
    const perChrom = chromosomeOrder.map((c) => {
      const row = l.byChromosome.find((r) => r.chrom === c);
      return row === undefined ? 'NA' : num(row.rppCount);
    });
    return [
      csvField(l.sampleId),
      o.nInformative,
      o.nCalled,
      o.nRpHom,
      o.nDonorHom,
      o.nHet,
      l.nMissing,
      l.nNonparental,
      num(o.rppCount),
      num(o.rppBp),
      num(o.rppCm),
      ...perChrom,
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n') + '\n';
}
