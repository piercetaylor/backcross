/**
 * Per-pixel-column binning for the graphical genotype canvas (docs/adr/0007).
 *
 * Responsibility: reduce an arbitrary number of markers on one chromosome
 * (or the whole genome, called once per chromosome) to one class per pixel
 * column, so draw cost is proportional to pixels, not markers. Pure
 * function, no DOM, so it is unit-tested in Node.
 *
 * Interface: binMajorityClasses(positions, classes, markerIndices, startBp, endBp, widthPx) -> Uint8Array.
 */
import { CallClass } from '../../core/types.ts';
import type { CallClassValue } from '../../core/types.ts';

const N_CLASSES = 6;

// The classes that compete for a column's majority. Order here is also the
// tie-break order (RP_HOM > DONOR_HOM > HET > NONPARENTAL), which happens to
// coincide with ascending class code. MISSING and UNINFORMATIVE are excluded:
// neither is a "call" a majority should be won by.
const CALLED_CLASSES: readonly CallClassValue[] = [
  CallClass.RP_HOM,
  CallClass.DONOR_HOM,
  CallClass.HET,
  CallClass.NONPARENTAL,
];

/**
 * Majority class per pixel column over markers with x in [x0, x1); 255 where
 * a column has no marker (or only uninformative ones).
 *
 * Only the four CALLED classes -- RP_HOM (1), DONOR_HOM (2), HET (3),
 * NONPARENTAL (5) -- compete for the per-column majority. UNINFORMATIVE (4)
 * markers never participate. MISSING (0) markers don't compete for the
 * majority either: a column is drawn MISSING only when it holds at least one
 * MISSING marker and no called marker, so a single dropout call cannot
 * outvote a column's real calls the way it could when MISSING was just
 * another class in the count. `markerIndices` is the subset (already in
 * position order) to consider, e.g. one chromosome's markers from
 * `sortedMarkerOrder`. The column of a marker is
 * `floor((pos - startBp) / (endBp - startBp) * widthPx)`, clamped to
 * `[0, widthPx - 1]`; markers with `pos` outside `[startBp, endBp]` are
 * skipped. Ties among called classes resolve to the order RP_HOM > DONOR_HOM
 * > HET > NONPARENTAL (ascending class code) -- e.g. RP_HOM beats DONOR_HOM
 * on an equal count -- the conservative reading for a near-isogenic line (a
 * bin is only called donor when donor calls strictly outnumber
 * recurrent-parent calls in it).
 *
 * Cost is O(markers + widthPx * 4) via a per-column array of counters, one
 * per called class code (plus one missing-seen flag per column).
 */
export function binMajorityClasses(
  positions: Float64Array | number[],
  classes: Uint8Array,
  markerIndices: Int32Array | number[],
  startBp: number,
  endBp: number,
  widthPx: number,
): Uint8Array {
  const counts = new Int32Array(widthPx * N_CLASSES);
  const hasMissing = new Uint8Array(widthPx);
  const span = endBp - startBp;
  const n = markerIndices.length;
  for (let k = 0; k < n; k++) {
    const m = markerIndices[k] as number;
    const pos = positions[m] as number;
    if (pos < startBp || pos > endBp) continue;
    const cls = classes[m] as number;
    if (cls === CallClass.UNINFORMATIVE) continue;
    let col = span > 0 ? Math.floor(((pos - startBp) / span) * widthPx) : 0;
    if (col < 0) col = 0;
    else if (col > widthPx - 1) col = widthPx - 1;
    if (cls === CallClass.MISSING) {
      hasMissing[col] = 1;
      continue;
    }
    counts[col * N_CLASSES + cls] = (counts[col * N_CLASSES + cls] as number) + 1;
  }

  const result = new Uint8Array(widthPx).fill(255);
  for (let col = 0; col < widthPx; col++) {
    const base = col * N_CLASSES;
    let bestClass = -1;
    let bestCount = 0;
    for (const cls of CALLED_CLASSES) {
      const count = counts[base + cls] as number;
      if (count > bestCount) {
        bestCount = count;
        bestClass = cls;
      }
    }
    if (bestClass >= 0) {
      result[col] = bestClass;
    } else if (hasMissing[col] === 1) {
      result[col] = CallClass.MISSING;
    }
  }
  return result;
}
