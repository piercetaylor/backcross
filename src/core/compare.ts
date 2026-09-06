/**
 * Pairwise line comparison (algorithm 5). STUB: body not implemented (M2).
 *
 * Responsibility: count and locate discordant markers between two samples
 * (isoline vs isoline, or isoline vs recurrent parent).
 *
 * Modes:
 *   - 'informative' (default): compare parent-of-origin classes at informative
 *     markers where both samples have a parental call; discordant when the
 *     classes differ. The RP itself is RP_HOM everywhere by construction.
 *   - 'all': compare raw unordered allele pairs at every marker where both
 *     samples are called, including uninformative markers. Differences there
 *     indicate residual heterozygosity, mutation, or genotyping error rather
 *     than donor introgression.
 *
 * Interface: compareLines(dataset, classification, sampleA, sampleB, mode) -> PairwiseDiff.
 * Discordant marker indices are returned sorted in genome order for the UI and CSV export.
 */
import type { Classification, Dataset, PairwiseDiff } from './types.ts';

export function compareLines(
  _dataset: Dataset,
  _cls: Classification,
  _sampleA: string,
  _sampleB: string,
  _mode: 'informative' | 'all' = 'informative',
): PairwiseDiff {
  throw new Error('compareLines: not implemented (planned for milestone M2)');
}
