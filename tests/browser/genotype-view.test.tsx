/**
 * The graphical genotype screen's geometry in a real layout engine.
 *
 * Three claims M2.5 made from markup and arithmetic, now measured: every
 * gutter label sits beside the canvas row it names; the gutter stays put
 * while the canvas scrolls horizontally; and a click on the overview
 * recentres the window where it landed.
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

import { readRendererLayout } from '../../src/ui/canvas/read-theme.ts';
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

async function loadSynthetic(): Promise<void> {
  await mountApp();
  await loadFiles({
    genotypes: new File([Array.from(synthVcfLines(SPEC)).join('')], 'synthetic.vcf'),
    samples: new File([synthSamplesCsv(SPEC)], 'samples.csv'),
    markers: new File([synthMarkersCsv(SPEC)], 'markers.csv'),
  });
  await goTo('4. Graphical genotypes');
  await waitForDraw();
}

/** Waits until the canvas has been drawn with every line and the strip describes it. */
async function waitForDraw(): Promise<HTMLCanvasElement> {
  return waitFor(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.geno-canvas');
    const host = document.querySelector('.geno-canvas-host');
    if (canvas === null || host === null) return null;
    const { rowHeight, rowGap } = readRendererLayout(host);
    const drawnHeight = Number.parseFloat(canvas.style.height) === N_LINES * (rowHeight + rowGap);
    const gutter = document.querySelectorAll('.geno-gutter li').length === N_LINES;
    const strip = document.querySelectorAll('.geno-strip-track').length > 0;
    return drawnHeight && gutter && strip ? canvas : null;
  });
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
    expect(buttons).toHaveLength(N_LINES);
    buttons.forEach((button, i) => {
      const r = button.getBoundingClientRect();
      const labelCentre = r.top + r.height / 2;
      const rowCentre = canvasTop + i * (rowHeight + rowGap) + rowHeight / 2;
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
    expect(gutter.getBoundingClientRect().left).toBe(before);
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
    await userEvent.click(page.getByRole('button', { name: 'Apply', exact: true }));
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
