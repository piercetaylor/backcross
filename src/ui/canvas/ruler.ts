/**
 * Ruler ticks for a chromosome header track (docs/adr/0009, amended
 * 2026-09-29).
 *
 * Responsibility: choose a 1-2-5 step in base pairs whose spacing on a track
 * clears a minimum pixel gap, and place labelled ticks at its multiples. Pure,
 * no DOM, so tests/ruler.test.ts runs it in Node. The screen reads the gap
 * from --ruler-tick-min-gap (read-theme.ts) and the track geometry from
 * GraphicalGenotypeRenderer.trackLayouts(), so this file holds no dimension.
 *
 * Interface:
 *   tickStep(spanBp, widthPx, minGapPx) -> step in bp, or null when no step
 *     from 1 kb to 500 Mb fits
 *   formatMb(bp, stepBp) -> the position in Mb with as many decimals as the
 *     step needs: 0 at 1 Mb and above, 1 at 100 to 500 kb, 2 at 10 to 50 kb,
 *     3 at 1 to 5 kb
 *   rulerTicks(startBp, endBp, widthPx, minGapPx) -> RulerTick[]; the last
 *     tick's label carries the unit; a track that fits fewer than two ticks
 *     gets none, since a lone "0 Mb" on a 30 px whole-genome track says
 *     nothing. `align` keeps a label inside its track: 'start' within half a
 *     gap of the left edge, 'end' within half a gap of the right edge.
 */
export interface RulerTick {
  bp: number;
  /** CSS pixels from the track's left edge. */
  x: number;
  label: string;
  align: 'start' | 'center' | 'end';
}

const MANTISSAS = [1, 2, 5];
const MIN_EXPONENT = 3;
const MAX_EXPONENT = 8;

export function tickStep(spanBp: number, widthPx: number, minGapPx: number): number | null {
  if (!(spanBp > 0) || !(widthPx > 0) || !(minGapPx > 0)) return null;
  for (let exponent = MIN_EXPONENT; exponent <= MAX_EXPONENT; exponent++) {
    for (const mantissa of MANTISSAS) {
      const step = mantissa * 10 ** exponent;
      if ((widthPx * step) / spanBp >= minGapPx) return step;
    }
  }
  return null;
}

export function formatMb(bp: number, stepBp: number): string {
  const decimals = Math.max(0, 6 - Math.floor(Math.log10(stepBp)));
  return (bp / 1e6).toFixed(decimals);
}

export function rulerTicks(
  startBp: number,
  endBp: number,
  widthPx: number,
  minGapPx: number,
): RulerTick[] {
  const span = endBp - startBp;
  const step = tickStep(span, widthPx, minGapPx);
  if (step === null) return [];
  const ticks: RulerTick[] = [];
  const first = Math.ceil(startBp / step) * step;
  for (let bp = first; bp <= endBp; bp += step) {
    const x = ((bp - startBp) / span) * widthPx;
    const align = x < minGapPx / 2 ? 'start' : x > widthPx - minGapPx / 2 ? 'end' : 'center';
    ticks.push({ bp, x, label: formatMb(bp, step), align });
  }
  if (ticks.length < 2) return [];
  const last = ticks[ticks.length - 1];
  if (last !== undefined) last.label = `${last.label} Mb`;
  return ticks;
}
