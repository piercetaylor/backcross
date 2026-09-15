/**
 * @media print rules (5.2.4): the Lines table's print layout and the
 * genotype view's canvas, gutter and legend, exercised through Playwright's
 * media emulation (commands.emulateMedia, vite.config.ts). Paper itself
 * stays unverified: this only checks that the emulated media type applies
 * and that the resulting computed styles are what the stylesheet intends.
 */
import { commands, page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtureFiles, goTo, loadFiles, mountApp, waitFor } from '../support/app-harness.tsx';

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
});
