/**
 * The overview's line stage (M4 phase 1, docs/adr/0007 amendment 2026-09-16).
 *
 * Responsibility: when there are more lines than the overview canvas has
 * pixel rows, reduce them to one synthetic line per pixel row, so every line
 * is represented rather than an evenly spaced subsample. Each row covers a
 * contiguous run of lines in display order, and at each marker takes the
 * majority of the covered lines' classes by binning.ts's majorityClass, the
 * same rule and tie order the renderer's column stage applies. The result
 * goes through the unchanged renderer, which bins markers into columns: two
 * stages, not a joint majority over the cell. Pure, no DOM
 * (tests/line-binning.test.ts).
 *
 * Interface:
 *   binLinesIntoRows(lines, nRows) -> GenotypeClassesLine[]
 */
import type { GenotypeClassesLine } from '../../workers/protocol.ts';
import { majorityClass, N_CLASSES } from './binning.ts';

/**
 * Bins `lines` (display order) into `nRows` synthetic lines. Row i covers lines
 * [floor(i * n / nRows), floor((i + 1) * n / nRows)); at each marker its class is
 * binning.ts's majorityClass over the counts of the covered lines' classes.
 * Returns `lines` itself when nRows >= lines.length (no copy) and [] when nRows <= 0 or lines is empty.
 * Every returned line's `classes` has the same length as lines[0].classes.
 * sampleId is `rows:${a}-${b}` with a and b the covered indices, inclusive, 0-based.
 */
export function binLinesIntoRows(
  lines: readonly GenotypeClassesLine[],
  nRows: number,
): GenotypeClassesLine[] {
  const n = lines.length;
  if (nRows <= 0 || n === 0) return [];
  if (nRows >= n) return lines as GenotypeClassesLine[];
  const nMarkers = (lines[0] as GenotypeClassesLine).classes.length;
  const counts = new Int32Array(N_CLASSES);
  const out: GenotypeClassesLine[] = [];
  for (let i = 0; i < nRows; i++) {
    const a = Math.floor((i * n) / nRows);
    const b = Math.floor(((i + 1) * n) / nRows);
    const classes = new Uint8Array(nMarkers);
    for (let m = 0; m < nMarkers; m++) {
      counts.fill(0);
      for (let l = a; l < b; l++) {
        const cls = (lines[l] as GenotypeClassesLine).classes[m] as number;
        counts[cls] = (counts[cls] as number) + 1;
      }
      classes[m] = majorityClass(counts);
    }
    out.push({ sampleId: `rows:${a}-${b - 1}`, classes });
  }
  return out;
}
