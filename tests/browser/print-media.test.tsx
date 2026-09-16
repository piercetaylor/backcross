/**
 * @media print rules (5.2.4): the Lines table's print layout and the
 * genotype view's canvas, gutter and legend, exercised through Playwright's
 * media emulation (commands.emulateMedia, vite.config.ts). Paper itself
 * stays unverified: this only checks that the emulated media type applies
 * and that the resulting computed styles are what the stylesheet intends.
 */
import { commands, page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';

import { readRendererLayout } from '../../src/ui/canvas/read-theme.ts';
import { fixtureFiles, goTo, loadFiles, mountApp, waitFor } from '../support/app-harness.tsx';
import {
  BENCH_SPEC,
  synthMarkersCsv,
  synthSamplesCsv,
  synthVcfLines,
} from '../support/synth-vcf.ts';

afterEach(async () => {
  // Not null: the installed vitest browser RPC does `typeof arg === 'object'`
  // then `'selector' in arg` on every command argument to detect element
  // locators, and `typeof null === 'object'` makes that throw. 'screen' is
  // in the command's own union and undoes 'print' just as well.
  await commands.emulateMedia('screen');
});

/** Stop rule S5: the print test's design assumes Playwright's media emulation reaches the iframe. */
async function printMedia(): Promise<void> {
  await commands.emulateMedia('print');
  await expect.poll(() => window.matchMedia('print').matches).toBe(true);
}

function display(sel: string): string {
  const el = document.querySelector(sel);
  if (el === null) throw new Error(`nothing matches ${sel}`);
  return getComputedStyle(el).display;
}

describe('print media', () => {
  it('Lines: print hides the chrome and unrolls the table', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();

    await printMedia();

    expect(display('.rail')).toBe('none');
    expect(display('.skip-link')).toBe('none');
    expect(display('.line-action-bar')).toBe('none');

    // One column with the rail hidden, whichever state the rail is in: the
    // collapsed selector is as specific as the print one (shell.css).
    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    const columns = () => getComputedStyle(shell).gridTemplateColumns.split(/\s+/).length;
    expect(columns()).toBe(1);
    shell.setAttribute('data-rail', 'collapsed');
    expect(columns()).toBe(1);

    const viewport = document.querySelector('.lines-table-viewport')!;
    const viewportStyle = getComputedStyle(viewport);
    expect(viewportStyle.maxHeight).toBe('none');
    expect(viewportStyle.overflowY).toBe('visible');

    expect(getComputedStyle(document.querySelector('.lines-table thead th')!).position).toBe(
      'static',
    );

    const rows = [...document.querySelectorAll('tbody [role="row"]')];
    expect(rows.length).toBe(6);
    for (const row of rows) {
      expect(row.getBoundingClientRect().height).toBeGreaterThan(0);
    }
  });

  it('Graphical genotypes: print keeps the canvas, the gutter and a legend the printer will ink', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('4. Graphical genotypes');
    await waitFor(() => document.querySelectorAll('.geno-strip-track').length > 0);
    await waitFor(() => document.querySelectorAll('.geno-gutter li').length === 6);

    const canvas = document.querySelector<HTMLCanvasElement>('canvas.geno-canvas')!;
    const before = canvas.getBoundingClientRect();

    await printMedia();

    expect(display('.rail')).toBe('none');
    expect(display('.line-action-bar')).toBe('none');
    expect(display('.geno-toolbar')).toBe('none');
    expect(display('.marker-detail')).toBe('none');
    expect(display('.keyboard-help')).toBe('none');
    expect(getComputedStyle(document.querySelector('.geno-scroll')!).maxHeight).toBe('none');
    expect(getComputedStyle(document.querySelector('.geno-scroll')!).overflowY).toBe('visible');

    await expect.poll(() => canvas.getBoundingClientRect().height).toBe(before.height);
    await expect.poll(() => canvas.getBoundingClientRect().width >= before.width).toBe(true);

    const gutterItems = [...document.querySelectorAll('.geno-gutter li')];
    expect(gutterItems.length).toBe(6);
    for (const li of gutterItems) {
      expect(li.getBoundingClientRect().height).toBeGreaterThan(0);
    }

    const swatches = [...document.querySelectorAll<HTMLElement>('.class-swatch')];
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      const style = getComputedStyle(swatch);
      const adjust =
        style.getPropertyValue('print-color-adjust') ||
        style.getPropertyValue('-webkit-print-color-adjust');
      expect(adjust).toBe('exact');
    }

    const textured = [...document.querySelectorAll('.legend li')].filter((li) => {
      const bg = getComputedStyle(li.querySelector('.class-swatch')!).backgroundImage;
      return bg.includes('gradient');
    });
    expect(textured.length).toBe(4);
  });

  it('Graphical genotypes: print draws every row when there are more lines than the row window', async () => {
    const spec = { ...BENCH_SPEC, markersPerChrom: 250, nCandidates: 40 };
    await mountApp();
    await loadFiles({
      genotypes: new File([Array.from(synthVcfLines(spec)).join('')], 'synthetic.vcf'),
      samples: new File([synthSamplesCsv(spec)], 'samples.csv'),
      markers: new File([synthMarkersCsv(spec)], 'markers.csv'),
    });
    await goTo('4. Graphical genotypes');
    await waitFor(() => document.querySelectorAll('.geno-strip-track').length > 0);
    const gutter = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.geno-gutter');
      return el !== null && el.dataset.rows === String(spec.nCandidates) ? el : null;
    });
    // On screen the 40 rows exceed the scroll container's bound, so a window is drawn.
    await waitFor(() => {
      const n = document.querySelectorAll('.geno-gutter li').length;
      return n >= 1 && n < spec.nCandidates;
    });

    await printMedia();
    // A real print fires beforeprint just before the snapshot; media emulation
    // does not, and its media-change event may arrive after matchMedia already
    // matches. Dispatching beforeprint and asserting with no await in between
    // checks that every row is committed synchronously.
    window.dispatchEvent(new Event('beforeprint'));

    expect(gutter.querySelectorAll('li').length).toBe(spec.nCandidates);
    expect(gutter.dataset.firstRow).toBe('0');
    const { rowHeight, rowGap } = readRendererLayout(document.querySelector('.geno-canvas-host')!);
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.geno-canvas')!;
    expect(Number.parseFloat(canvas.style.height)).toBe(spec.nCandidates * (rowHeight + rowGap));
  });
});
