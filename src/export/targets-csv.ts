/**
 * Target check CSV export.
 *
 * Responsibility: serialize TargetCheck[] to the target table in
 * docs/data-formats.md ("Outputs"): sample_id, target, chrom, start_bp,
 * end_bp, status, n_informative_in_region, segment_start_bp, segment_end_bp,
 * drag_min_bp, drag_max_bp. One row per (candidate, region) in the order
 * checkTargets produced them; positions are integers and NaN is NA.
 *
 * Interface: targetsCsv(checks) -> string.
 */
import type { TargetCheck } from '../core/types.ts';
import { csvField } from './csv-field.ts';

function int(x: number): string {
  return Number.isNaN(x) ? 'NA' : String(Math.round(x));
}

export const TARGETS_CSV_HEADER = [
  'sample_id',
  'target',
  'chrom',
  'start_bp',
  'end_bp',
  'status',
  'n_informative_in_region',
  'segment_start_bp',
  'segment_end_bp',
  'drag_min_bp',
  'drag_max_bp',
] as const;

export function targetsCsv(checks: TargetCheck[]): string {
  const rows = checks.map((t) =>
    [
      csvField(t.sampleId),
      csvField(t.target),
      csvField(t.region.chrom),
      int(t.region.startBp),
      int(t.region.endBp),
      t.status,
      t.nInformativeInRegion,
      t.segment === null ? 'NA' : int(t.segment.startBp),
      t.segment === null ? 'NA' : int(t.segment.endBp),
      int(t.dragMinBp),
      int(t.dragMaxBp),
    ].join(','),
  );
  return [TARGETS_CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}
