/**
 * Donor segment calling (algorithm 3). STUB: signature and rules fixed, body not implemented (M1).
 *
 * Responsibility: convert one candidate's per-marker classes into run-length
 * donor/het segments per chromosome.
 *
 * Rules:
 *   - Walk informative markers in position order, skipping MISSING and
 *     NONPARENTAL calls (they neither extend nor break a run, but count toward
 *     `maxMissingSpan`).
 *   - A run is a maximal sequence of consecutive non-RP calls (DONOR_HOM or
 *     HET). A run is split when the bp gap between two consecutive non-RP
 *     calls exceeds `maxGapBp`, or when more than `maxMissingSpan` skipped
 *     informative markers lie between them.
 *   - Runs with fewer than `minMarkers` non-RP calls are dropped unless
 *     `includeShort` is true (the UI uses this to show suspected errors).
 *   - startBp/endBp are the outermost non-RP markers; leftFlankBp/rightFlankBp
 *     are the nearest RP_HOM markers outside the run (NaN when none), so the
 *     true breakpoint lies in (leftFlankBp, startBp] and [endBp, rightFlankBp).
 *   - class = 'donor' if every call is DONOR_HOM, 'het' if every call is HET,
 *     otherwise 'mixed'. startCm/endCm are NaN without a genetic map.
 *
 * Interface: callSegments(dataset, classification, candidateIndex, params, includeShort?)
 * -> DonorSegment[] sorted by chromosome order then startBp.
 */
import type { Classification, Dataset, DonorSegment, SegmentParams } from './types.ts';

export const DEFAULT_SEGMENT_PARAMS: SegmentParams = {
  minMarkers: 2,
  maxGapBp: 2_000_000,
  maxMissingSpan: 3,
};

export function callSegments(
  _dataset: Dataset,
  _cls: Classification,
  _candidateIndex: number,
  _params: SegmentParams = DEFAULT_SEGMENT_PARAMS,
  _includeShort = false,
): DonorSegment[] {
  throw new Error('callSegments: not implemented (planned for milestone M1)');
}
