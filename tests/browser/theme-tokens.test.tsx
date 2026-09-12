/**
 * src/ui/canvas/read-theme.ts against a real cascade.
 *
 * Its header says the fallbacks "cannot be exercised in Node", because there
 * is no getComputedStyle there. Here they are: a colour token removed from
 * the :root rule falls back to DEFAULT_THEME, and a row-height token that is
 * zero or negative falls back to DEFAULT_LAYOUT (the `positive` and the
 * non-negative branches of readPx). The layout cases are asserted from the
 * row pitch of the canvas the genotype screen actually drew, with a control
 * case first so a pitch equal to the default cannot pass by coincidence (the
 * shipped token and the default are both 14 px). The label colour has no
 * pixel on the screen canvas -- the screen draws line names in HTML and gives
 * the renderer labelWidth 0 -- so that case is asserted from the read itself.
 *
 * The screen reads the tokens once, when it mounts, so each case sets its
 * override first and then navigates to the screen.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT, DEFAULT_THEME } from '../../src/ui/canvas/GraphicalGenotypeRenderer.ts';
import { readRendererLayout, readRendererTheme } from '../../src/ui/canvas/read-theme.ts';
import { fixtureFiles, goTo, loadFiles, mountApp, waitFor } from '../support/app-harness.tsx';

const N_LINES = 6;

const restore: (() => void)[] = [];

afterEach(() => {
  while (restore.length > 0) restore.pop()?.();
});

/** Removes a custom property from every :root rule that declares it, restoring it after the test. */
function removeRootToken(name: string): void {
  let removed = 0;
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ':root') continue;
      const value = rule.style.getPropertyValue(name);
      if (value === '') continue;
      rule.style.removeProperty(name);
      restore.push(() => rule.style.setProperty(name, value));
      removed++;
    }
  }
  expect(removed).toBeGreaterThan(0);
}

/** Overrides a token on the root element's inline style, restoring it after the test. */
function setRootToken(name: string, value: string): void {
  const style = document.documentElement.style;
  style.setProperty(name, value);
  restore.push(() => style.removeProperty(name));
}

function host(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.geno-canvas-host');
  if (el === null) throw new Error('the genotype screen is not mounted');
  return el;
}

/** Mounts the genotype screen afresh and returns the drawn canvas's row pitch in CSS px. */
async function drawnRowPitch(): Promise<number> {
  await goTo('3. Lines');
  await waitFor(() => document.querySelector('canvas.geno-canvas') === null);
  await goTo('4. Graphical genotypes');
  const canvas = await waitFor(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas.geno-canvas');
    const drawn = document.querySelectorAll('.geno-strip-track').length > 0;
    return c !== null && drawn ? c : null;
  });
  return Number.parseFloat(canvas.style.height) / N_LINES;
}

describe('canvas theme and layout fallbacks', () => {
  it('falls back to DEFAULT_THEME.labelColor when --color-canvas-label is removed', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('4. Graphical genotypes');
    await waitFor(() => document.querySelector('.geno-canvas-host'));

    // Control: the token resolves, through its var() chain, to something else.
    expect(readRendererTheme(host()).labelColor).not.toBe(DEFAULT_THEME.labelColor);

    removeRootToken('--color-canvas-label');
    expect(readRendererTheme(host()).labelColor).toBe(DEFAULT_THEME.labelColor);
  });

  it('draws at the token pitch, and at DEFAULT_LAYOUT.rowHeight for 0px and -3px', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());

    setRootToken('--canvas-row-height', '20px');
    const gap = readRendererLayout(document.documentElement).rowGap;
    expect(await drawnRowPitch()).toBe(20 + gap);

    for (const value of ['0px', '-3px']) {
      setRootToken('--canvas-row-height', value);
      const pitch = await drawnRowPitch();
      expect(readRendererLayout(host()).rowHeight).toBe(DEFAULT_LAYOUT.rowHeight);
      expect(pitch).toBe(DEFAULT_LAYOUT.rowHeight + gap);
    }
  });
});
