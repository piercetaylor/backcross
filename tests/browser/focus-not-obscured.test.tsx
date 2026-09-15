/**
 * WCAG 2.4.11 (focus not obscured) on the Lines table: a row reached by
 * keyboard is never hidden under the sticky header nor pushed outside the
 * scroll container's viewport, at a line count that overflows the visible
 * band. Companion to tests/browser/lines-grid-keyboard.test.tsx, which
 * asserts the APG grid navigation itself.
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  goTo,
  expectFocus,
  focusReport,
  focusStats,
  loadFiles,
  mountApp,
  pressExpectingFocus,
} from '../support/app-harness.tsx';
import {
  BENCH_SPEC,
  synthMarkersCsv,
  synthSamplesCsv,
  synthVcfLines,
} from '../support/synth-vcf.ts';

const SPEC = { ...BENCH_SPEC, markersPerChrom: 250, nCandidates: 40 };

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

function rects() {
  const viewport = document.querySelector('.lines-table-viewport')!.getBoundingClientRect();
  // The sticky element is the header cell, not the row group: thead stays in
  // flow and scrolls away, so its rect would put the criterion out of reach.
  const header = document.querySelector('.lines-table thead th')!.getBoundingClientRect();
  const row = active().closest('[role="row"]')!.getBoundingClientRect();
  return { viewport, header, row };
}

/** The focused row is wholly inside the scroll container and wholly below the sticky header. */
function expectNotObscured(label: string) {
  const { viewport, header, row } = rects();
  expect(row.top, `${label}: under the header`).toBeGreaterThanOrEqual(header.bottom - 0.5);
  expect(row.top, `${label}: above the viewport`).toBeGreaterThanOrEqual(viewport.top - 0.5);
  expect(row.bottom, `${label}: below the viewport`).toBeLessThanOrEqual(viewport.bottom + 0.5);
}

describe('focus not obscured (WCAG 2.4.11)', () => {
  it('a row reached by keyboard is never under the sticky header nor outside the scroll container', async () => {
    onTestFinished(({ task }) => {
      if (task.result?.state === 'fail') console.warn(`focus trace: ${focusReport()}`);
      else
        console.warn(`focus reclaims=${focusStats.reclaims} keyRetries=${focusStats.keyRetries}`);
    });

    await mountApp();
    await loadFiles({
      genotypes: new File([Array.from(synthVcfLines(SPEC)).join('')], 'synthetic.vcf'),
      samples: new File([synthSamplesCsv(SPEC)], 'samples.csv'),
      markers: new File([synthMarkersCsv(SPEC)], 'markers.csv'),
    });
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 40,/)).toBeInTheDocument();

    // Enter the grid as lines-grid-keyboard.test.tsx does: click the Density
    // Default label, then Tab into the grid.
    const actionBar = document.querySelector<HTMLElement>('.line-action-bar');
    expect(actionBar).not.toBeNull();
    await userEvent.click(
      page.getByRole('radiogroup', { name: 'Density' }).getByText('Default', { exact: true }),
    );
    await expectFocus(() => actionBar?.contains(active()), true);
    // At 40 rows the scroll container overflows and the browser gives it an
    // implicit tab stop of its own before the grid (absent at the 6-row
    // fixture lines-grid-keyboard.test.tsx uses), so the grid may take a
    // second Tab here.
    const viewport = document.querySelector<HTMLElement>('.lines-table-viewport')!;
    await pressExpectingFocus(
      'Tab',
      () => grid().contains(active()) || active() === viewport,
      true,
    );
    if (active() === viewport) {
      await pressExpectingFocus('Tab', () => grid().contains(active()), true);
    }

    expect(getComputedStyle(document.querySelector('.lines-table thead th')!).position).toBe(
      'sticky',
    );
    // Without overflow nothing scrolls, the sticky header never covers a row
    // and every assertion below would hold whatever the CSS did.
    expect(viewport.scrollHeight, 'the 40 rows overflow the scroll container').toBeGreaterThan(
      viewport.clientHeight,
    );

    const N = 20;
    await pressExpectingFocus('{Control>}{End}{/Control}', focusedRowIndex, 39);
    expectNotObscured('Ctrl+End');
    for (let i = 1; i <= N; i++) {
      await pressExpectingFocus('{ArrowUp}', focusedRowIndex, 39 - i);
      expectNotObscured(`ArrowUp ${i}`);
    }

    await pressExpectingFocus('{Control>}{Home}{/Control}', focusedRowIndex, 0);
    expectNotObscured('Ctrl+Home');
    for (let i = 1; i <= N; i++) {
      await pressExpectingFocus('{ArrowDown}', focusedRowIndex, i);
      expectNotObscured(`ArrowDown ${i}`);
    }
  });
});
