/**
 * Per-line summary CSV (export screen, CLI, and Shiny hand-off).
 *
 * Responsibility: serialize LineRpp results into the per-line summary table
 * documented in docs/data-formats.md ("Outputs"). One row per candidate;
 * per-chromosome RPP as wide columns rpp_count_Gm01.. so the file opens
 * directly in R (`readr::read_csv`) without reshaping. Numeric NaN is written
 * as NA. `call_set_db_id` and `sample_db_id` follow `sample_id`
 * (sample-ids.ts); they are empty for a file-loaded dataset. The provenance
 * columns (provenance.ts, `token_profile`) are appended last.
 *
 * Interface: lineSummaryCsv(lineRpp, chromosomeOrder, samples, provenance) -> string.
 */
import type { LineRpp, SampleRecord } from '../core/types.ts';
import { csvField } from './csv-field.ts';
import { externalIdCells } from './sample-ids.ts';
import type { ExportProvenance } from './provenance.ts';
import { provenanceCells, provenanceHeader } from './provenance.ts';

function num(x: number, digits = 6): string {
  return Number.isNaN(x) ? 'NA' : x.toFixed(digits);
}

export function lineSummaryCsv(
  lines: LineRpp[],
  chromosomeOrder: string[],
  samples: SampleRecord[],
  provenance: ExportProvenance,
): string {
  const ids = externalIdCells(samples);
  const header = [
    'sample_id',
    'call_set_db_id',
    'sample_db_id',
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
    ...provenanceHeader(provenance),
  ];
  const rows = lines.map((l) => {
    const o = l.overall;
    const perChrom = chromosomeOrder.map((c) => {
      const row = l.byChromosome.find((r) => r.chrom === c);
      return row === undefined ? 'NA' : num(row.rppCount);
    });
    return [
      csvField(l.sampleId),
      ...ids(l.sampleId),
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
      ...provenanceCells(provenance),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n') + '\n';
}
