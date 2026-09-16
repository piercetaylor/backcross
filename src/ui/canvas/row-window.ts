/**
 * The row window of the graphical genotype view (M4 phase 1).
 *
 * Responsibility: given a vertical scroll offset, a viewport height and a row
 * period, say which rows the main canvas and its gutter must lay out and
 * draw, so draw cost is proportional to the rows in view rather than to the
 * number of lines. Pure, no DOM, so it is unit-tested in Node
 * (tests/row-window.test.ts).
 *
 * Interface:
 *   RowWindow { first, count }
 *   OVERSCAN_ROWS — rows drawn beyond each edge of the viewport
 *   visibleRowWindow(scrollTop, viewportHeight, rowPeriod, nRows, overscan?) -> RowWindow
 */

export interface RowWindow {
  /** Index of the first drawn row in the data's line order. */
  first: number;
  /** Number of drawn rows; first + count <= nRows. */
  count: number;
}

/** Rows drawn beyond each edge of the viewport, so a wheel tick never shows an undrawn row before the next frame. */
export const OVERSCAN_ROWS = 4;

/**
 * The rows intersecting [scrollTop, scrollTop + viewportHeight) at rowPeriod px per row, widened by
 * `overscan` rows each side and clamped to [0, nRows). A viewportHeight that is not a positive finite
 * number (an element that is not laid out, or print) means every row: { first: 0, count: nRows }.
 * rowPeriod <= 0 also means every row. nRows <= 0 gives { first: 0, count: 0 }. first is clamped to
 * max(0, nRows - ceil(viewportHeight / rowPeriod)), so a scrollTop beyond the rows gives the last rows.
 */
export function visibleRowWindow(
  scrollTop: number,
  viewportHeight: number,
  rowPeriod: number,
  nRows: number,
  overscan = OVERSCAN_ROWS,
): RowWindow {
  if (nRows <= 0) return { first: 0, count: 0 };
  if (!(Number.isFinite(viewportHeight) && viewportHeight > 0) || !(rowPeriod > 0)) {
    return { first: 0, count: nRows };
  }
  const top = scrollTop > 0 ? scrollTop : 0;
  // A scrollTop past the rows (a filter shrank the list under the scroll
  // position) must still draw the last rows, never an empty window: first
  // is clamped so the window ends on the last row with at least a viewport
  // of rows in it, and first + count never exceeds nRows.
  const visibleRows = Math.ceil(viewportHeight / rowPeriod);
  const first = Math.min(
    Math.max(0, Math.floor(top / rowPeriod) - overscan),
    Math.max(0, nRows - visibleRows),
  );
  const end = Math.min(nRows, Math.ceil((top + viewportHeight) / rowPeriod) + overscan);
  return { first, count: Math.max(0, end - first) };
}
