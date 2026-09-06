/**
 * Quality-control flags (algorithm 6). STUB: body not implemented (M1).
 *
 * Responsibility: derive per-line, per-marker and dataset-level QC from the
 * genotype matrix and the classification.
 *
 * Per line: missingRate = missing calls / all markers; hetRate = heterozygous
 * calls / called markers; nonparentalRate = NONPARENTAL / informative called.
 * Flags: 'high_missing', 'high_het', 'nonparental_alleles',
 * 'closer_to_donor' (rppCount < 0.5, possible sample swap or mislabeled parent),
 * 'identical_to_rp' (zero discordant informative markers).
 * Per marker: callRate over all samples; lowCallRate when below threshold.
 * Parents: 'parent_heterozygous' when a parent's hetRate exceeds parentHetMax;
 * 'parents_identical' when parentPolymorphismRate is below 0.01.
 *
 * Interface: computeQc(dataset, classification, lineRpp, thresholds) -> QcReport.
 */
import type { Classification, Dataset, LineRpp, QcReport, QcThresholds } from './types.ts';

export const DEFAULT_QC_THRESHOLDS: QcThresholds = {
  lineMissingMax: 0.1,
  lineHetMax: 0.05,
  markerCallRateMin: 0.8,
  parentHetMax: 0.02,
};

export function computeQc(
  _dataset: Dataset,
  _cls: Classification,
  _lineRpp: LineRpp[],
  _thresholds: QcThresholds = DEFAULT_QC_THRESHOLDS,
): QcReport {
  throw new Error('computeQc: not implemented (planned for milestone M1)');
}
