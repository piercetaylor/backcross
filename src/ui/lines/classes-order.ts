/**
 * Display order for the worker's class data, applied on the main thread.
 *
 * Responsibility: keep a reorder off the worker. The worker owns the
 * genotype matrix and never sends it back (docs/adr/0001); a 'classes'
 * result is expensive enough that re-requesting it because a column header
 * was clicked would be the wrong trade. So the fetch is memoised on the
 * *set* of ids it covers (`classesRequestKey`, which sorts before joining)
 * and the display order is applied afterwards by `permuteClassesData`,
 * which rebuilds only the `lines` array and shares every typed array it
 * was given. Sorting therefore costs one array permutation, not a round
 * trip and a structured clone.
 *
 * Interface: permuteClassesData(data, order), classesRequestKey(ids).
 * Adds no worker request and changes no result shape.
 */
import type { GenotypeClassesData, GenotypeClassesLine } from '../../workers/protocol.ts';

/**
 * Reorders `data.lines` into `order`. Ids absent from `data` are skipped
 * (a fetch for a newer id set may still be in flight); ids in `data`
 * absent from `order` are dropped. The line objects and their typed
 * arrays are shared, not copied.
 */
export function permuteClassesData(
  data: GenotypeClassesData,
  order: readonly string[],
): GenotypeClassesData {
  const byId = new Map(data.lines.map((l) => [l.sampleId, l]));
  const lines: GenotypeClassesLine[] = [];
  for (const sampleId of order) {
    const line = byId.get(sampleId);
    if (line !== undefined) lines.push(line);
  }
  return { ...data, lines };
}

/** The set key the classes fetch is memoised on: ids sorted and joined with '\n', so a reorder never refetches. */
export function classesRequestKey(ids: readonly string[]): string {
  return [...ids].sort().join('\n');
}
