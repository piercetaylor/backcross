/**
 * The Lines table's APG grid keyboard pattern, in a real browser.
 *
 * tests/line-table.test.tsx asserts the grid's roles and states from
 * server-rendered markup and says it cannot assert behaviour; this is the
 * behaviour. React Aria's Table is one tab stop: Tab from the action bar
 * enters the grid, arrow keys move within it, and a second Tab leaves it.
 *
 * React Aria focuses a row, not a cell, on entry, and with a row focused
 * Home and End move to the first and last row. They move within a row only
 * once a cell has focus, so the test steps into the row with ArrowRight
 * before asserting the cell-level Home and End of the pattern.
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

import { fixtureFiles, goTo, loadFiles, mountApp } from '../support/app-harness.tsx';

function grid(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="grid"]');
  if (el === null) throw new Error('no role="grid" on the page');
  return el;
}

function active(): Element {
  const el = document.activeElement;
  if (el === null) throw new Error('nothing is focused');
  return el;
}

/** The body rows, in order: the header row group is excluded. */
function bodyRows(): Element[] {
  return [...grid().querySelectorAll('tbody [role="row"]')];
}

/** The row holding the focused element, and its index among the body rows. */
function focusedRowIndex(): number {
  const row = active().closest('[role="row"]');
  return row === null ? -1 : bodyRows().indexOf(row);
}

/** The focused cell, when focus is on a cell or inside one. */
function focusedCell(): Element | null {
  return active().closest('[role="gridcell"], [role="rowheader"]');
}

function cellsOf(row: Element): Element[] {
  return [...row.querySelectorAll('[role="gridcell"], [role="rowheader"]')];
}

describe('Lines grid keyboard pattern', () => {
  it('is one tab stop with arrow, Home/End and Ctrl+End navigation inside it', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();

    // Start on the last control of the action bar, the density radio group.
    const actionBar = document.querySelector<HTMLElement>('.line-action-bar');
    expect(actionBar).not.toBeNull();
    // React Aria hides the native radio; the visible target is its label.
    await userEvent.click(
      page.getByRole('radiogroup', { name: 'Density' }).getByText('Default', { exact: true }),
    );
    expect(actionBar?.contains(active())).toBe(true);

    await userEvent.tab();
    expect(grid().contains(active())).toBe(true);
    const start = focusedRowIndex();
    expect(start).toBeGreaterThanOrEqual(0);

    expect(active().getAttribute('role')).toBe('row');

    await userEvent.keyboard('{ArrowDown}');
    expect(focusedRowIndex()).toBe(start + 1);
    expect(active().getAttribute('role')).toBe('row');

    // Row-focused: End and Home move to the last and first row.
    await userEvent.keyboard('{End}');
    expect(active().getAttribute('role')).toBe('row');
    expect(focusedRowIndex()).toBe(bodyRows().length - 1);
    await userEvent.keyboard('{Home}');
    expect(active().getAttribute('role')).toBe('row');
    expect(focusedRowIndex()).toBe(0);

    // Return to the row used for the cell-level checks below.
    for (let i = 0; i < start + 1; i++) {
      await userEvent.keyboard('{ArrowDown}');
    }
    expect(focusedRowIndex()).toBe(start + 1);

    const row = bodyRows()[start + 1] as Element;
    const cells = cellsOf(row);
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedCell()).toBe(cells[0]);
    await userEvent.keyboard('{End}');
    expect(focusedCell()).toBe(cells[cells.length - 1]);
    await userEvent.keyboard('{Home}');
    expect(focusedCell()).toBe(cells[0]);

    await userEvent.keyboard('{Control>}{End}{/Control}');
    expect(focusedRowIndex()).toBe(bodyRows().length - 1);

    await userEvent.tab();
    expect(grid().contains(active())).toBe(false);
  });
});
