/**
 * Target-locus check and linkage-drag estimate (algorithm 4). STUB: body not implemented (M1).
 *
 * Responsibility: for each user-specified region and each candidate, report
 * whether the candidate carries donor alleles across the region and how much
 * donor DNA flanks it.
 *
 * Rules:
 *   - Region = {name, chrom, startBp, endBp}; a single marker or position is
 *     expressed as startBp = endBp.
 *   - Informative called markers inside [startBp, endBp] determine status:
 *     'donor' (all DONOR_HOM), 'het' (all HET), 'rp' (all RP_HOM),
 *     'recombinant' (mixture of RP and non-RP), 'no_data' (none called).
 *   - For 'donor', 'het' and 'recombinant', the donor segment (from
 *     callSegments) overlapping the region gives the drag estimate:
 *       dragMinBp = (segment.endBp - segment.startBp) - (endBp - startBp), clipped at 0
 *       dragMaxBp = (segment.rightFlankBp - segment.leftFlankBp) - (endBp - startBp)
 *     dragMaxBp is NaN when a flank is missing (segment reaches a chromosome end).
 *
 * Interface: checkTargets(dataset, classification, segmentsByCandidate, regions) -> TargetCheck[]
 * and parseTargetSpec(text) for the "Gm13:28,500,000-29,100,000" / marker-id syntax.
 */
import type { Classification, Dataset, DonorSegment, TargetCheck, TargetRegion } from './types.ts';

export function checkTargets(
  _dataset: Dataset,
  _cls: Classification,
  _segmentsByCandidate: DonorSegment[][],
  _regions: TargetRegion[],
): TargetCheck[] {
  throw new Error('checkTargets: not implemented (planned for milestone M1)');
}

/** Accepts "Gm13:28500000-29100000", "chr13:28.5Mb-29.1Mb", or a marker_id present in the dataset. */
export function parseTargetSpec(_text: string, _dataset: Dataset): TargetRegion {
  throw new Error('parseTargetSpec: not implemented (planned for milestone M1)');
}
