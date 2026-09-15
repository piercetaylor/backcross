/**
 * Donor segment CSV export.
 *
 * Responsibility: serialize DonorSegment[] to the segment table in
 * docs/data-formats.md ("Outputs"): sample_id, call_set_db_id, sample_db_id
 * (empty for a file-loaded dataset), chrom, start_bp, end_bp, left_flank_bp, right_flank_bp, n_markers, n_donor_hom, n_het, class,
 * start_cm, end_cm, length_bp, length_cm, gap_criterion. Positions are
 * integers, cM values have six decimals, NaN is written as NA. The last
 * column is the dataset-level gap criterion (docs/adr/0008): cm when a map
 * was loaded, in which case steps touching a marker without cM were tested
 * in bp; bp otherwise.
 *
 * Interface: segmentsCsv(segments, gapCriterion, samples) -> string.
 */
import type { GapCriterion } from '../core/segments.ts';
import type { DonorSegment, SampleRecord } from '../core/types.ts';
import { csvField } from './csv-field.ts';
import { externalIdCells } from './sample-ids.ts';

function int(x: number): string {
  return Number.isNaN(x) ? 'NA' : String(Math.round(x));
}

function dec(x: number, digits = 6): string {
  return Number.isNaN(x) ? 'NA' : x.toFixed(digits);
}

export const SEGMENTS_CSV_HEADER = [
  'sample_id',
  'call_set_db_id',
  'sample_db_id',
  'chrom',
  'start_bp',
  'end_bp',
  'left_flank_bp',
  'right_flank_bp',
  'n_markers',
  'n_donor_hom',
  'n_het',
  'class',
  'start_cm',
  'end_cm',
  'length_bp',
  'length_cm',
  'gap_criterion',
] as const;

export function segmentsCsv(
  segments: DonorSegment[],
  gapCriterion: GapCriterion,
  samples: SampleRecord[],
): string {
  const ids = externalIdCells(samples);
  const rows = segments.map((s) =>
    [
      csvField(s.sampleId),
      ...ids(s.sampleId),
      csvField(s.chrom),
      int(s.startBp),
      int(s.endBp),
      int(s.leftFlankBp),
      int(s.rightFlankBp),
      s.nMarkers,
      s.nDonorHom,
      s.nHet,
      s.class,
      dec(s.startCm),
      dec(s.endCm),
      int(s.endBp - s.startBp),
      dec(s.endCm - s.startCm),
      gapCriterion,
    ].join(','),
  );
  return [SEGMENTS_CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}
