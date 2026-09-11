/**
 * Per-pixel-column binning for the graphical genotype canvas (docs/adr/0007).
 *
 * Responsibility: reduce an arbitrary number of markers on one chromosome
 * (or the whole genome, called once per chromosome) to one class per pixel
 * column, so draw cost is proportional to pixels, not markers. Pure
 * function, no DOM, so it is unit-tested in Node.
 *
 * Zoomed in, where markers are sparser than pixels, each marker is extended
 * across the columns nearer to it than to any other marker, so a track reads
 * as contiguous blocks rather than hairlines on an empty background.
 *
 * M2.5 phase 3 adds a second channel, the minority class: the called class
 * with the second-highest count in a column, when at least two called
 * classes land in it. It is computed alongside the majority, from the same
 * per-column counts, but is never passed through fillBetweenMarkers: an
 * empty column that fillBetweenMarkers extends the majority into holds no
 * markers of its own, so it must not appear to carry a minority either --
 * that would assert something about the genome between markers, which is
 * exactly the ADR 0009 open question this milestone leaves open (invariant
 * 5). MISSING and UNINFORMATIVE never compete for the minority, for the same
 * reason they never compete for the majority.
 *
 * Interface:
 *   binClassesWithMinority(positions, classes, markerIndices, startBp, endBp, widthPx) -> BinnedColumns
 *   binMajorityClasses(...same args...) -> Uint8Array (unchanged signature and behaviour; now binClassesWithMinority(...).majority)
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

/** Per-column majority and minority classes; see the module comment. */
export interface BinnedColumns {
  /** As binMajorityClasses returns today, including the fillBetweenMarkers extension. */
  majority: Uint8Array;
  /** Per column: the called class with the second-highest count when at least two called classes are present, else 255. Ties by ascending class code. Never extended across empty columns. */
  minority: Uint8Array;
}

/**
 * Best-scoring class among CALLED_CLASSES in one column's counts, optionally
 * excluding one class code (used to find the second place once the first has
 * been found). Ties resolve to the first class encountered in CALLED_CLASSES
 * order, which is ascending class code. Returns bestClass -1 when every
 * candidate's count is 0.
 */
function pickBest(
  counts: Int32Array,
  base: number,
  exclude: CallClassValue | -1,
): { bestClass: number; bestCount: number } {
  let bestClass = -1;
  let bestCount = 0;
  for (const cls of CALLED_CLASSES) {
    if (cls === exclude) continue;
    const count = counts[base + cls] as number;
    if (count > bestCount) {
      bestCount = count;
      bestClass = cls;
    }
  }
  return { bestClass, bestCount };
}

/**
 * Majority and minority class per pixel column over markers with x in
 * [x0, x1). Majority is 255 where a column has no marker (or only
 * uninformative ones); minority is 255 wherever there is no second called
 * class in that column, and always 255 on a column fillBetweenMarkers only
 * extended into (it holds no markers of its own).
 *
 * Only the four CALLED classes -- RP_HOM (1), DONOR_HOM (2), HET (3),
 * NONPARENTAL (5) -- compete for the per-column majority or minority.
 * UNINFORMATIVE (4) markers never participate. MISSING (0) markers don't
 * compete for the majority either: a column is drawn MISSING only when it
 * holds at least one MISSING marker and no called marker, so a single
 * dropout call cannot outvote a column's real calls the way it could when
 * MISSING was just another class in the count; MISSING and UNINFORMATIVE
 * never appear as a minority. `markerIndices` is the subset (already in
 * position order) to consider, e.g. one chromosome's markers from
 * `sortedMarkerOrder`. The column of a marker is
 * `floor((pos - startBp) / (endBp - startBp) * widthPx)`, clamped to
 * `[0, widthPx - 1]`; markers with `pos` outside `[startBp, endBp]` are
 * skipped. Ties among called classes resolve to the order RP_HOM > DONOR_HOM
 * > HET > NONPARENTAL (ascending class code) -- e.g. RP_HOM beats DONOR_HOM
 * on an equal count -- the conservative reading for a near-isogenic line (a
 * bin is only called donor when donor calls strictly outnumber
 * recurrent-parent calls in it); the same ascending-code order breaks a
 * minority tie.
 *
 * Cost is O(markers + widthPx * 4) via a per-column array of counters, one
 * per called class code (plus one missing-seen flag per column).
 */
export function binClassesWithMinority(
  positions: Float64Array | number[],
  classes: Uint8Array,
  markerIndices: Int32Array | number[],
  startBp: number,
  endBp: number,
  widthPx: number,
): BinnedColumns {
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

  const majorityRaw = new Uint8Array(widthPx).fill(255);
  const minority = new Uint8Array(widthPx).fill(255);
  for (let col = 0; col < widthPx; col++) {
    const base = col * N_CLASSES;
    const first = pickBest(counts, base, -1);
    if (first.bestClass >= 0) {
      majorityRaw[col] = first.bestClass;
      const second = pickBest(counts, base, first.bestClass as CallClassValue);
      if (second.bestCount > 0) minority[col] = second.bestClass;
    } else if (hasMissing[col] === 1) {
      majorityRaw[col] = CallClass.MISSING;
    }
  }
  return { majority: fillBetweenMarkers(majorityRaw), minority };
}

/**
 * Majority class per pixel column; see binClassesWithMinority. Kept as a
 * separate export, unchanged in signature and behaviour, because most
 * callers (and every existing test) only need the majority channel.
 */
export function binMajorityClasses(
  positions: Float64Array | number[],
  classes: Uint8Array,
  markerIndices: Int32Array | number[],
  startBp: number,
  endBp: number,
  widthPx: number,
): Uint8Array {
  return binClassesWithMinority(positions, classes, markerIndices, startBp, endBp, widthPx)
    .majority;
}

/**
 * Extends each occupied column across the empty columns around it, up to the
 * midpoint between it and the next occupied column.
 *
 * Zoomed out, markers are denser than pixels and every column is already
 * occupied, so this changes nothing. Zoomed in they are sparser, and without
 * this each marker would paint a single hairline on an otherwise empty track.
 * Painting the interval a marker represents is the same convention the
 * bp-weighted RPP uses (docs/adr/0006) and is what makes a graphical genotype
 * readable at high zoom. It asserts nothing about the genome between markers:
 * a column shows the class of the nearest marker, and the hover panel names
 * that marker.
 *
 * A row with no marker at all is left untouched, so an empty track stays empty.
 */
function fillBetweenMarkers(bins: Uint8Array): Uint8Array {
  const width = bins.length;
  // Nearest occupied column to the left of, or at, each column.
  const left = new Int32Array(width).fill(-1);
  let last = -1;
  for (let col = 0; col < width; col++) {
    if (bins[col] !== 255) last = col;
    left[col] = last;
  }
  if (last === -1) return bins; // nothing to extend
  const right = new Int32Array(width).fill(-1);
  let next = -1;
  for (let col = width - 1; col >= 0; col--) {
    if (bins[col] !== 255) next = col;
    right[col] = next;
  }
  const out = new Uint8Array(bins);
  for (let col = 0; col < width; col++) {
    if (bins[col] !== 255) continue;
    const l = left[col] as number;
    const r = right[col] as number;
    if (l === -1) out[col] = bins[r] as number;
    else if (r === -1) out[col] = bins[l] as number;
    else out[col] = (col - l <= r - col ? bins[l] : bins[r]) as number;
  }
  return out;
}
