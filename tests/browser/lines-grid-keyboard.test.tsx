/**
 * The Lines table's APG grid keyboard pattern, in a real browser.
 *
 * tests/line-table.test.tsx asserts the grid's roles and states from
 * server-rendered markup and says it cannot assert behaviour; this is the
 * behaviour. React Aria's Table is one tab stop: Tab from the action bar
 * enters the grid, arrow keys, Home/End and Ctrl+Home/End move within it,
 * and a second Tab leaves it.
 *
 * React Aria focuses a row, not a cell, on entry, and with a row focused
 * Home and End move to the first and last row. They move within a row only
 * once a cell has focus, so the test steps into the row with ArrowRight
 * before asserting the cell-level Home and End of the pattern.
 *
 * Each key goes through the harness's pressExpectingFocus, and each other
 * focus check through expectFocus. In Firefox another test file's page can
 * take window focus mid-test, which blurs the grid and undoes a key's move;
 * the helpers take focus back and press again only when a blur was seen.
 * The poll is needed anyway: React Aria moves DOM focus in an effect after
 * the key handler's state update.
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  fixtureFiles,
  goTo,
  loadFiles,
  mountApp,
  expectFocus,
  focusReport,
  focusStats,
  pressExpectingFocus,
} from '../support/app-harness.tsx';

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
    onTestFinished(({ task }) => {
      // Reported, not asserted: how often another page took window focus.
      if (task.result?.state === 'fail') console.warn(`focus trace: ${focusReport()}`);
      else
        console.warn(`focus reclaims=${focusStats.reclaims} keyRetries=${focusStats.keyRetries}`);
    });
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
    await expectFocus(() => actionBar?.contains(active()), true);

    await pressExpectingFocus('Tab', () => grid().contains(active()), true);
    await expectFocus(() => active().getAttribute('role'), 'row');
    const start = focusedRowIndex();
    expect(start).toBeGreaterThanOrEqual(0);

    await pressExpectingFocus('{ArrowDown}', focusedRowIndex, start + 1);
    await expectFocus(() => active().getAttribute('role'), 'row');

    // Row-focused: End and Home move to the last and first row.
    await pressExpectingFocus('{End}', focusedRowIndex, bodyRows().length - 1);
    await expectFocus(() => active().getAttribute('role'), 'row');
    await pressExpectingFocus('{Home}', focusedRowIndex, 0);
    await expectFocus(() => active().getAttribute('role'), 'row');

    // Return to the row used for the cell-level checks below, one key and
    // one landed focus at a time.
    for (let i = 0; i < start + 1; i++) {
      await pressExpectingFocus('{ArrowDown}', focusedRowIndex, i + 1);
    }

    const row = bodyRows()[start + 1] as Element;
    const cells = cellsOf(row);
    await pressExpectingFocus('{ArrowRight}', focusedCell, cells[0]);
    await pressExpectingFocus('{End}', focusedCell, cells[cells.length - 1]);
    await pressExpectingFocus('{Home}', focusedCell, cells[0]);

    await pressExpectingFocus('{Control>}{End}{/Control}', focusedRowIndex, bodyRows().length - 1);
    await pressExpectingFocus('{Control>}{Home}{/Control}', focusedRowIndex, 0);

    await pressExpectingFocus('Tab', () => grid().contains(active()), false);
  });
});
