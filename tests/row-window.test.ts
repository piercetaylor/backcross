/** The row window of the graphical genotype view (M4 phase 1): hand-built cases. */
import { describe, expect, it } from 'vitest';

import { OVERSCAN_ROWS, visibleRowWindow } from '../src/ui/canvas/row-window.ts';

describe('visibleRowWindow', () => {
  it('overscans four rows', () => {
    expect(OVERSCAN_ROWS).toBe(4);
  });

  it('covers the top of the list', () => {
    expect(visibleRowWindow(0, 500, 18, 200)).toEqual({
      first: 0,
      count: Math.min(200, Math.ceil(500 / 18) + 4),
    });
    expect(visibleRowWindow(0, 500, 18, 200)).toEqual({ first: 0, count: 32 });
  });

  it('covers a scrolled middle, widened by overscan each side', () => {
    // first = floor(1000 / 18) - 4 = 55 - 4; end = ceil(1500 / 18) + 4 = 84 + 4.
    expect(visibleRowWindow(1000, 500, 18, 200)).toEqual({ first: 51, count: 37 });
  });

  it('clamps the end to nRows near the bottom', () => {
    // first = min(floor(3400 / 18) - 4, 200 - ceil(500 / 18)) = min(184, 172);
    // end = min(200, 217 + 4) = 200.
    const w = visibleRowWindow(3400, 500, 18, 200);
    expect(w).toEqual({ first: 172, count: 28 });
    expect(w.first + w.count).toBe(200);
  });

  it('draws the last rows when scrollTop is beyond nRows * rowPeriod', () => {
    // floor(5000 / 18) - 4 = 273 would be past the rows; clamped to 200 - 28.
    const w = visibleRowWindow(5000, 500, 18, 200);
    expect(w).toEqual({ first: 172, count: 28 });
    expect(w.first + w.count).toBeLessThanOrEqual(200);
  });

  it('draws every row when there are fewer rows than the viewport holds', () => {
    expect(visibleRowWindow(0, 500, 18, 10)).toEqual({ first: 0, count: 10 });
    // A stale scroll position after the list shrank.
    expect(visibleRowWindow(1000, 500, 18, 10)).toEqual({ first: 0, count: 10 });
  });

  it('is empty with no rows', () => {
    expect(visibleRowWindow(0, 500, 18, 0)).toEqual({ first: 0, count: 0 });
  });

  it('is every row when the viewport height is not a positive finite number', () => {
    expect(visibleRowWindow(0, 0, 18, 200)).toEqual({ first: 0, count: 200 });
    expect(visibleRowWindow(0, Number.NaN, 18, 200)).toEqual({ first: 0, count: 200 });
    expect(visibleRowWindow(0, Number.POSITIVE_INFINITY, 18, 200)).toEqual({
      first: 0,
      count: 200,
    });
  });

  it('is every row when the row period is 0', () => {
    expect(visibleRowWindow(0, 500, 0, 200)).toEqual({ first: 0, count: 200 });
  });

  it('treats a negative scrollTop as 0', () => {
    expect(visibleRowWindow(-100, 500, 18, 200)).toEqual(visibleRowWindow(0, 500, 18, 200));
  });

  it('gives exact bounds with overscan 0', () => {
    // first = floor(1000 / 18) = 55; end = ceil(1500 / 18) = 84.
    expect(visibleRowWindow(1000, 500, 18, 200, 0)).toEqual({ first: 55, count: 29 });
  });
});
