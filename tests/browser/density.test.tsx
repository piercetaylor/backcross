/**
 * The density control's visible effect: a Lines row is exactly as tall as
 * the height token the chosen density selects.
 *
 * The expected heights are read from src/ui/tokens.css as text, not from
 * computed style, so the test compares the rendered row against the design
 * value rather than against the cascade that produced it.
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

import tokensCss from '../../src/ui/tokens.css?raw';
import { fixtureFiles, goTo, loadFiles, mountApp } from '../support/app-harness.tsx';

function tokenPx(name: string): number {
  const match = new RegExp(`${name}:\\s*([0-9.]+)px;`).exec(tokensCss);
  if (match === null) throw new Error(`${name} is not a px token in tokens.css`);
  return Number(match[1]);
}

function firstRowHeight(): number {
  const row = document.querySelector('.lines-table tbody [role="row"]');
  if (row === null) throw new Error('no body row in the Lines table');
  return row.getBoundingClientRect().height;
}

describe('density', () => {
  it('sets a row to the compact and then the comfortable height token', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();

    // React Aria hides the native radio; the visible target is its label.
    const density = page.getByRole('radiogroup', { name: 'Density' });
    await userEvent.click(density.getByText('Compact', { exact: true }));
    await expect.poll(firstRowHeight).toBe(tokenPx('--row-height-compact'));

    await userEvent.click(density.getByText('Comfortable', { exact: true }));
    await expect.poll(firstRowHeight).toBe(tokenPx('--row-height-comfortable'));
  });
});
