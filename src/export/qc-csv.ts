/**
 * Per-sample QC CSV, `qc.csv` (export screen and the CLI's `qc` subcommand).
 *
 * Responsibility: serialise the per-sample rows of a QcReport (core/qc.ts)
 * into the table documented in docs/data-formats.md ("QC CSV") and
 * docs/adr/0029. One row per sample in the order given, which for
 * `computeQc(...).lines` is manifest order with the parents included.
 * `call_set_db_id` and `sample_db_id` follow `sample_id` (sample-ids.ts) and
 * are empty for a file-loaded dataset. Rates are written with six decimals,
 * NaN as `NA`; `qc_flags` joins the line's flags with `|` (as
 * progeny-selector's results.csv does) and is an empty cell when there is
 * none. Dataset-level flags are not written here; they stay in the HTML
 * report. The provenance columns (provenance.ts, `token_profile`) are
 * appended last. Needs no genotype matrix, so it runs on the main thread from
 * the QcReport the worker already returned.
 *
 * Interface: QC_CSV_HEADER, qcCsv(lineQc, samples, provenance) -> string.
 */
import type { LineQc, SampleRecord } from '../core/types.ts';
import { csvField } from './csv-field.ts';
import { externalIdCells } from './sample-ids.ts';
import type { ExportProvenance } from './provenance.ts';
import { provenanceCells, provenanceHeader } from './provenance.ts';

/** The fixed columns, before the provenance columns. */
export const QC_CSV_HEADER = [
  'sample_id',
  'call_set_db_id',
  'sample_db_id',
  'role',
  'missing_rate',
  'het_rate',
  'nonparental_rate',
  'qc_flags',
] as const;

function num(x: number): string {
  return Number.isNaN(x) ? 'NA' : x.toFixed(6);
}

export function qcCsv(
  lines: LineQc[],
  samples: SampleRecord[],
  provenance: ExportProvenance,
): string {
  const ids = externalIdCells(samples);
  const header = [...QC_CSV_HEADER, ...provenanceHeader(provenance)];
  const rows = lines.map((l) =>
    [
      csvField(l.sampleId),
      ...ids(l.sampleId),
      csvField(l.role),
      num(l.missingRate),
      num(l.hetRate),
      num(l.nonparentalRate),
      csvField(l.flags.join('|')),
      ...provenanceCells(provenance),
    ].join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}
