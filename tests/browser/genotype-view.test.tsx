/**
 * The graphical genotype screen's geometry in a real layout engine.
 *
 * Three claims M2.5 made from markup and arithmetic, now measured: every
 * gutter label sits beside the canvas row it names; the gutter stays put
 * while the canvas scrolls horizontally; and a click on the overview
 * recentres the window where it landed. M4 phase 1 adds the row window: only
 * the rows in the scroll container's viewport are laid out and drawn, the
 * window follows a vertical scroll, the hover hit test names the line under
 * the pointer after one, and the overview stays its bounded size when there
 * are more lines than it has pixels.
 *
 * The dataset is 40 lines by 5,000 markers from tests/support/synth-vcf.ts,
 * generated in the page. Two things the test has to arrange, both reported
 * rather than hidden. The canvas host tracks its container's width through a
 * ResizeObserver, so the scroll container never overflows on its own; the
 * test widens the host to give it 400 px to scroll. And the viewport has no
 * DOM readout finer than the strip's 0.1 Mb edge labels, so the window's
 * centre is read back through the hover panel: the nearest hit to the
 * canvas's midpoint names a marker within hit tolerance of the centre.
 */
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';

import { readOverviewHeight, readRendererLayout } from '../../src/ui/canvas/read-theme.ts';
import { visibleRowWindow } from '../../src/ui/canvas/row-window.ts';
import { goTo, loadFiles, mountApp, nextFrame, waitFor } from '../support/app-harness.tsx';
import {
  BENCH_SPEC,
  synthMarkersCsv,
  synthSamplesCsv,
  synthVcfLines,
} from '../support/synth-vcf.ts';

const SPEC = { ...BENCH_SPEC, markersPerChrom: 250, nCandidates: 40 };
const N_LINES = SPEC.nCandidates;
const CHROM = 'Gm01';
const SCROLL_PX = 400;
/** A hover must land within this many px of a marker (GraphicalGenotypeRenderer's HIT_TEST_TOLERANCE_PX). */
const HIT_TOLERANCE_PX = 4;

const restore: (() => void)[] = [];
afterEach(() => {
  while (restore.length > 0) restore.pop()?.();
});

function el<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** Positions of CHROM's markers, in order, from the generated markers.csv. */
function chromPositions(): number[] {
  return synthMarkersCsv(SPEC)
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','))
    .filter((f) => f[1] === CHROM)
    .map((f) => Number(f[2]));
}

async function loadSynthetic(spec: typeof SPEC = SPEC): Promise<void> {
  await mountApp();
  await loadFiles({
    genotypes: new File([Array.from(synthVcfLines(spec)).join('')], 'synthetic.vcf'),
    samples: new File([synthSamplesCsv(spec)], 'samples.csv'),
    markers: new File([synthMarkersCsv(spec)], 'markers.csv'),
  });
  await goTo('4. Graphical genotypes');
  await waitForDraw(spec.nCandidates);
}

/**
 * Waits until the gutter describes every line, the canvas has been drawn
 * with the rows the gutter renders (the row window), and the strip
 * describes it.
 */
async function waitForDraw(nLines: number = N_LINES): Promise<HTMLCanvasElement> {
  return waitFor(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.geno-canvas');
    const host = document.querySelector('.geno-canvas-host');
    const gutter = document.querySelector<HTMLElement>('.geno-gutter');
    if (canvas === null || host === null || gutter === null) return null;
    const { rowHeight, rowGap } = readRendererLayout(host);
    const rows = gutter.dataset.rows === String(nLines);
    const li = document.querySelectorAll('.geno-gutter li').length;
    const windowed = li >= 1 && li <= nLines;
    const drawnHeight = Number.parseFloat(canvas.style.height) === li * (rowHeight + rowGap);
    const strip = document.querySelectorAll('.geno-strip-track').length > 0;
    return rows && windowed && drawnHeight && strip ? canvas : null;
  });
}

/** The candidate sample ids in samples.csv order, which is the default display order. */
function candidateIds(spec: typeof SPEC = SPEC): string[] {
  return synthSamplesCsv(spec)
    .trim()
    .split('\n')
    .slice(1)
    .map((row) => row.split(','))
    .filter((f) => f[2] === 'candidate')
    .map((f) => f[0] as string);
}

/** Scrolls the genotype container to its bottom and waits for the row window to follow. */
async function scrollToBottom(): Promise<void> {
  const scroller = el<HTMLElement>('.geno-scroll');
  const gutter = el<HTMLElement>('.geno-gutter');
  scroller.scrollTop = scroller.scrollHeight;
  await waitFor(() => gutter.dataset.firstRow !== '0');
  await waitForDraw();
  await nextFrame();
}

/**
 * The bp position the hover panel reports for the marker nearest the
 * canvas's horizontal midpoint on the first row, corrected for how far from
 * the midpoint the hit was taken; undefined when no hit is found.
 */
async function centreBpByHover(windowWidthBp: number): Promise<number | undefined> {
  const canvas = el<HTMLCanvasElement>('canvas.geno-canvas');
  const rect = canvas.getBoundingClientRect();
  const { rowHeight } = readRendererLayout(el('.geno-canvas-host'));
  const bpPerPx = windowWidthBp / rect.width;
  const text = el('.marker-detail-text');
  for (let d = 0; d <= 40; d++) {
    for (const dx of d === 0 ? [0] : [d, -d]) {
      const x = rect.width / 2 + dx;
      canvas.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: rect.left + x,
          clientY: rect.top + rowHeight / 2,
        }),
      );
      await nextFrame();
      await nextFrame();
      const match = new RegExp(`${CHROM}:([0-9,]+) bp`).exec(text.textContent ?? '');
      if (match !== null) return Number((match[1] as string).replace(/,/g, '')) - dx * bpPerPx;
    }
  }
  return undefined;
}

describe('graphical genotype view geometry', () => {
  it('centres each gutter label on the canvas row it names', async () => {
    await loadSynthetic();
    const canvasTop = el('canvas.geno-canvas').getBoundingClientRect().top;
    const { rowHeight, rowGap } = readRendererLayout(el('.geno-canvas-host'));
    const buttons = [...document.querySelectorAll('.geno-gutter li button')];
    expect(buttons.length).toBe(document.querySelectorAll('.geno-gutter li').length);
    buttons.forEach((button, j) => {
      const r = button.getBoundingClientRect();
      const labelCentre = r.top + r.height / 2;
      const rowCentre = canvasTop + j * (rowHeight + rowGap) + rowHeight / 2;
      expect(Math.abs(labelCentre - rowCentre)).toBeLessThanOrEqual(1);
    });
  });

  it('keeps the gutter in place while the canvas scrolls 400 px right', async () => {
    await loadSynthetic();
    const scroller = el<HTMLElement>('.geno-scroll');
    const host = el<HTMLElement>('.geno-canvas-host');
    // See the header: widen the host so the container has room to scroll.
    host.style.minWidth = `${scroller.clientWidth + 2 * SCROLL_PX}px`;
    restore.push(() => host.style.removeProperty('min-width'));
    await waitFor(() => scroller.scrollWidth - scroller.clientWidth >= SCROLL_PX);
    // The widened host is redrawn on the next frame of its ResizeObserver;
    // measure only once the canvas has taken the new width.
    const canvas = el<HTMLCanvasElement>('canvas.geno-canvas');
    await waitFor(() => Math.abs(canvas.getBoundingClientRect().width - host.clientWidth) < 1);
    await nextFrame();
    await nextFrame();

    const gutter = el('.geno-gutter');
    const before = gutter.getBoundingClientRect().left;
    const scrollerLeft = scroller.getBoundingClientRect().left;
    scroller.scrollLeft = SCROLL_PX;
    await nextFrame();
    await nextFrame();
    expect(scroller.scrollLeft).toBe(SCROLL_PX);
    expect(scroller.getBoundingClientRect().left).toBe(scrollerLeft);
    // Sub-pixel tolerance: sticky positioning can snap by a fraction of a pixel
    // in Chromium; a gutter that scrolled with the canvas moves 400 px.
    expect(gutter.getBoundingClientRect().left).toBeCloseTo(before, 0);
  });

  it('draws a row window and moves it on scroll', async () => {
    await loadSynthetic();
    const scroller = el<HTMLElement>('.geno-scroll');
    const gutter = el<HTMLElement>('.geno-gutter');
    const { rowHeight, rowGap } = readRendererLayout(el('.geno-canvas-host'));
    const period = rowHeight + rowGap;
    const ids = candidateIds();

    // 40 rows at the row period exceed the 60vh bound of a 720 px viewport.
    expect(scroller.clientHeight).toBeLessThanOrEqual(0.6 * window.innerHeight);
    const liBefore = document.querySelectorAll('.geno-gutter li').length;
    expect(liBefore).toBeLessThan(N_LINES);
    expect(liBefore).toBe(visibleRowWindow(0, scroller.clientHeight, period, N_LINES).count);
    expect(el('.geno-gutter li button').textContent).toBe(ids[0]);
    expect(gutter.getBoundingClientRect().height).toBe(N_LINES * period);

    await scrollToBottom();
    const buttons = [...document.querySelectorAll('.geno-gutter li button')];
    expect(buttons[buttons.length - 1]?.textContent).toBe(ids[N_LINES - 1]);
    expect(Number(gutter.dataset.firstRow)).toBe(
      visibleRowWindow(scroller.scrollTop, scroller.clientHeight, period, N_LINES).first,
    );
    expect(gutter.getBoundingClientRect().height).toBe(N_LINES * period);
  });

  it('clamps the scroll position and draws the rows when a filter shrinks the list below it', async () => {
    await loadSynthetic();
    const scroller = el<HTMLElement>('.geno-scroll');
    const gutter = el<HTMLElement>('.geno-gutter');
    await scrollToBottom();
    expect(scroller.scrollTop).toBeGreaterThan(0);

    // SYN_030..SYN_039: ten rows, fewer than the viewport holds.
    await userEvent.fill(page.getByLabelText('Filter'), 'SYN_03');
    await waitForDraw(10);
    const { rowHeight, rowGap } = readRendererLayout(el('.geno-canvas-host'));
    const maxTop = Math.max(0, 10 * (rowHeight + rowGap) - scroller.clientHeight);
    await waitFor(() => scroller.scrollTop <= maxTop);
    await waitFor(() => document.querySelectorAll('.geno-gutter li').length === 10);
    expect(gutter.dataset.firstRow).toBe('0');
    expect(el('.geno-gutter li button').textContent).toBe('SYN_030');
  });

  it('the hover panel names the line under the pointer after scrolling', async () => {
    await loadSynthetic();
    const ids = candidateIds();
    await scrollToBottom();
    const { rowHeight, rowGap } = readRendererLayout(el('.geno-canvas-host'));
    const period = rowHeight + rowGap;
    const count = document.querySelectorAll('.geno-gutter li').length;
    const canvas = el<HTMLCanvasElement>('canvas.geno-canvas');
    const text = el('.marker-detail-text');
    const expected = ids[N_LINES - 1] as string;
    // Sweep x until the hit test lands within tolerance of a marker; y is the
    // vertical centre of the last rendered row.
    let found = false;
    for (let d = 0; d <= 40 && !found; d++) {
      for (const dx of d === 0 ? [0] : [d, -d]) {
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: rect.left + rect.width / 2 + dx,
            clientY: rect.top + (count - 1) * period + rowHeight / 2,
          }),
        );
        await nextFrame();
        await nextFrame();
        if ((text.textContent ?? '').includes(' bp ')) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
    // Contains rather than starts with: the marker id is prefixed once the
    // debounced detail request resolves.
    expect(text.textContent ?? '').toContain(expected);
  });

  it('the overview draws every line when there are more lines than overview pixels', async () => {
    const spec = { ...SPEC, nCandidates: 60 };
    await loadSynthetic(spec);
    await userEvent.fill(page.getByLabelText('Region'), `${CHROM}:1-2000000`);
    await userEvent.keyboard('{Enter}');
    const overview = await waitFor(() =>
      document.querySelector<HTMLCanvasElement>('canvas.geno-overview'),
    );
    await waitForDraw(spec.nCandidates);
    const overviewHeightPx = readOverviewHeight(el('.geno-canvas-host'));
    await waitFor(() => overview.style.height !== '');
    expect(Number.parseFloat(overview.style.height)).toBe(
      48 * Math.max(1, Math.floor(overviewHeightPx / 48)),
    );
  });

  it('recentres the window at 25 % of the chromosome when the overview is clicked there', async () => {
    await loadSynthetic();
    const positions = chromPositions();
    const lengthBp = positions[positions.length - 1] as number;
    let spacing = 0;
    for (let i = 1; i < positions.length; i++) {
      spacing = Math.max(spacing, (positions[i] as number) - (positions[i - 1] as number));
    }

    // A 1 Mb window away from 25 %, so the click has to move it.
    const windowBp = 1_000_000;
    const start = Math.round(lengthBp * 0.55);
    await userEvent.fill(page.getByLabelText('Region'), `${CHROM}:${start}-${start + windowBp}`);
    // Submitted with Enter from the focused field, the form's own submit path.
    // A pointer click on Apply was lost once in Firefox under load: the
    // field kept focus and the view stayed on the whole genome.
    await userEvent.keyboard('{Enter}');
    const overview = await waitFor(() =>
      document.querySelector<HTMLCanvasElement>('canvas.geno-overview'),
    );
    await waitForDraw();
    const before = await centreBpByHover(windowBp);
    expect(before).toBeDefined();
    expect(Math.abs((before as number) - (start + windowBp / 2))).toBeLessThanOrEqual(spacing);

    const box = overview.getBoundingClientRect();
    await userEvent.click(page.elementLocator(overview), {
      position: { x: box.width * 0.25, y: box.height / 2 },
    });
    await waitFor(() => {
      const edge = document.querySelector('.geno-strip-window span')?.textContent ?? '';
      return edge !== '' && Number.parseFloat(edge) * 1_000_000 < start;
    });
    await waitForDraw();

    const centre = await centreBpByHover(windowBp);
    expect(centre).toBeDefined();
    const bpPerPx = windowBp / el('canvas.geno-canvas').getBoundingClientRect().width;
    const tolerance = spacing + HIT_TOLERANCE_PX * bpPerPx;
    expect(Math.abs((centre as number) - lengthBp * 0.25)).toBeLessThanOrEqual(tolerance);
  });
});
