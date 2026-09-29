/** The chromosome header's Mb ruler (src/ui/canvas/ruler.ts): hand-built cases. */
import { describe, expect, it } from 'vitest';

import { formatMb, rulerTicks, tickStep } from '../src/ui/canvas/ruler.ts';

describe('tickStep', () => {
  it('picks the smallest 1-2-5 step that clears the gap', () => {
    expect(tickStep(1_000_000, 1200, 56)).toBe(50_000);
    expect(tickStep(55_000_000, 800, 56)).toBe(5_000_000);
    expect(tickStep(55_000_000, 30, 56)).toBe(200_000_000);
  });

  it('returns null for an empty span, width or gap', () => {
    expect(tickStep(0, 800, 56)).toBeNull();
    expect(tickStep(1e6, 0, 56)).toBeNull();
    expect(tickStep(1e6, 800, 0)).toBeNull();
  });
});

describe('formatMb', () => {
  it('gives as many decimals as the step needs', () => {
    expect(formatMb(10_300_000, 50_000)).toBe('10.30');
    expect(formatMb(5_000_000, 5_000_000)).toBe('5');
    expect(formatMb(200_000, 100_000)).toBe('0.2');
    expect(formatMb(1_500, 1_000)).toBe('0.002');
    expect(formatMb(2_500, 1_000)).toBe('0.003');
  });
});

describe('rulerTicks', () => {
  it('rules a whole 55 Mb chromosome every 5 Mb at 800 px', () => {
    const ticks = rulerTicks(0, 55_000_000, 800, 56);
    expect(ticks).toHaveLength(12);
    expect(ticks[0]).toEqual({ bp: 0, x: 0, label: '0', align: 'start' });
    expect(ticks[11]).toEqual({ bp: 55_000_000, x: 800, label: '55 Mb', align: 'end' });
    expect(ticks[5]?.label).toBe('25');
    expect(ticks[5]?.align).toBe('center');
  });

  it('rules a 500 kb window every 50 kb to two decimals', () => {
    const ticks = rulerTicks(10_250_000, 10_750_000, 600, 56);
    expect(ticks).toHaveLength(11);
    expect(ticks.map((t) => t.label)).toEqual([
      '10.25',
      '10.30',
      '10.35',
      '10.40',
      '10.45',
      '10.50',
      '10.55',
      '10.60',
      '10.65',
      '10.70',
      '10.75 Mb',
    ]);
  });

  it('rules a 1 Mb track every 100 kb to one decimal', () => {
    const ticks = rulerTicks(0, 1_000_000, 800, 56);
    expect(ticks).toHaveLength(11);
    expect(ticks[0]?.label).toBe('0.0');
    expect(ticks[ticks.length - 1]?.label).toBe('1.0 Mb');
  });

  it('shows no tick where fewer than two fit', () => {
    // One tick would fit; none is shown.
    expect(rulerTicks(0, 55_000_000, 30, 56)).toEqual([]);
    expect(rulerTicks(5, 5, 800, 56)).toEqual([]);
  });
});
