/**
 * Donor segment CSV export. STUB pending callSegments (M1).
 *
 * Responsibility: serialize DonorSegment[] to the segment table in
 * docs/data-formats.md ("Outputs"): sample_id, chrom, start_bp, end_bp,
 * left_flank_bp, right_flank_bp, n_markers, n_donor_hom, n_het, class,
 * start_cm, end_cm, length_bp, length_cm.
 *
 * Interface: segmentsCsv(segments) -> string.
 */
import type { DonorSegment } from '../core/types.ts';

export function segmentsCsv(_segments: DonorSegment[]): string {
  throw new Error('segmentsCsv: not implemented (planned for milestone M1)');
}
