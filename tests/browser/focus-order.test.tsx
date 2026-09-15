/**
 * Focus order across the whole shell: the skip link, the rail into every
 * screen, no Tab ever landing on a hidden element, the popover's focus
 * return, and focus after a load and after cancelling a BrAPI load.
 *
 * Uses the same pressExpectingFocus/expectFocus contract as
 * tests/browser/lines-grid-keyboard.test.tsx for the same reason: another
 * page can take window focus mid-test in Firefox, and the helpers take it
 * back and retry a key only when a blur was observed.
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  fixtureFiles,
  goTo,
  expectFocus,
  focusReport,
  focusStats,
  loadFiles,
  mountApp,
  pressExpectingFocus,
  type Step,
} from '../support/app-harness.tsx';

function active(): Element {
  const el = document.activeElement;
  if (el === null) throw new Error('nothing is focused');
  return el;
}

const rail = () => document.querySelector<HTMLElement>('.rail')!;
const toggle = () => document.querySelector<HTMLButtonElement>('.rail-toggle')!;

/** The element a user sees focused: a React Aria visually-hidden input stands for its <label>. */
function visibleProxy(el: Element): Element {
  return el.closest('label') ?? el;
}
function isVisiblyFocused(el: Element): boolean {
  const proxy = visibleProxy(el);
  const rect = proxy.getBoundingClientRect();
  const style = getComputedStyle(proxy);
  return (
    rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none'
  );
}

function reportFocus(): void {
  onTestFinished(({ task }) => {
    if (task.result?.state === 'fail') console.warn(`focus trace: ${focusReport()}`);
    else console.warn(`focus reclaims=${focusStats.reclaims} keyRetries=${focusStats.keyRetries}`);
  });
}

describe('focus order', () => {
  it('the first Tab lands on the skip link and Enter moves focus into main', async () => {
    reportFocus();
    await mountApp();
    await pressExpectingFocus('Tab', () => active().className, 'skip-link');
    expect(isVisiblyFocused(active())).toBe(true);
    await pressExpectingFocus('{Enter}', () => active().id, 'main-content');
  });

  it('a successful load moves focus to the Summary heading', async () => {
    reportFocus();
    await mountApp();
    await loadFiles(fixtureFiles());
    await expectFocus(() => active().textContent, 'Dataset summary and QC');
    expect(active().tagName).toBe('H2');
  });

  it('cancelling a BrAPI load moves focus to the Upload heading', async () => {
    reportFocus();
    await mountApp();
    const { samples } = fixtureFiles();
    await userEvent.click(page.getByText('BrAPI server', { exact: true }));
    await userEvent.fill(page.getByLabelText('Base URL'), `${location.origin}/__brapi__`);
    // The mock server holds every request for this id open (brapi-mock-plugin.ts).
    await userEvent.fill(page.getByLabelText('Variant set id'), 'hangset');
    await userEvent.upload(page.getByLabelText(/^samples\.csv/), samples);
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));
    await expect.element(cancel).toBeInTheDocument();
    await userEvent.click(cancel);
    await expectFocus(() => active().textContent, 'Upload and validate');
    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent ?? '')
      .toMatch(/BrAPI: load cancelled/);
    await expect.element(cancel).not.toBeInTheDocument();
    expect(active()).not.toBe(document.body);
  });

  it("from the rail's last tab stop one Tab enters each screen, and no Tab ever lands on a hidden element", async () => {
    reportFocus();
    await mountApp();
    await loadFiles(fixtureFiles());

    const cases: [Step, () => boolean][] = [
      [
        '1. Upload',
        () =>
          active().tagName === 'A' &&
          active().textContent === 'input coding reference (opens in a new tab)' &&
          active().getAttribute('target') === '_blank',
      ],
      // The screen has no control; the sequence leaves the rail.
      ['2. Summary and QC', () => !rail().contains(active())],
      ['3. Lines', () => active().textContent === 'Select all visible'],
      ['4. Graphical genotypes', () => active().textContent === 'Select all visible'],
      ['5. Compare', () => active().closest('label')?.textContent?.startsWith('Sample A') === true],
      ['6. Export', () => active().textContent === 'Download per-line summary CSV'],
    ];

    for (const [step, expectFirst] of cases) {
      await goTo(step);
      // A real click, not toggle().focus(): once a previous case tabs off
      // the end of the page, Firefox drops document.hasFocus() and a
      // programmatic .focus() call never gets it back, but a dispatched
      // click does (it also flips the collapse state, which does not
      // change what is tabbable or its visible size).
      await userEvent.click(page.elementLocator(toggle()));
      await pressExpectingFocus('Tab', expectFirst, true);

      // Tabbing off the end of the page (case '2. Summary and QC', which has
      // no control) lands on document.body with document.hasFocus() false in
      // Firefox, and no reclaim brings it back; body is checked before
      // anything waits on focus, and once reached the walk stops without
      // pressing another key.
      const seen = new Set<Element>([active()]);
      for (let guard = 0; guard < 30 && active() !== document.body; guard++) {
        await pressExpectingFocus('Tab', () => true, true);
        if (active() === document.body || seen.has(active())) break;
        expect(isVisiblyFocused(active()), `${step}: ${active().outerHTML.slice(0, 120)}`).toBe(
          true,
        );
        seen.add(active());
      }
    }
  });

  it('Escape closes the sort popover and returns focus to its button', async () => {
    reportFocus();
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('4. Graphical genotypes');
    const trigger = document.querySelector<HTMLElement>('.line-select-button')!;
    trigger.focus();
    await pressExpectingFocus(
      '{ArrowDown}',
      () => active().closest('[role="listbox"]') !== null,
      true,
    );
    await pressExpectingFocus('{Escape}', () => active(), trigger);
  });
});
