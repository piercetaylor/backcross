/**
 * axe-core over the mounted application, for tests/browser/a11y-axe.test.tsx.
 *
 * The context is the app root (.app-shell), not the document: the Vitest
 * tester iframe's own <html> has no lang and no title, and those page-level
 * rules are Lighthouse's on the built index.html (scripts/lighthouse-a11y.mjs).
 *
 * KNOWN_A11Y_EXCEPTIONS is the only way a violation may be tolerated, it is
 * empty, and a test asserts it is empty: adding an entry needs a dated
 * amendment to docs/adr/0009 by the maintainer, whose date goes in the entry.
 *
 * Interface: AXE_TAGS, KNOWN_A11Y_EXCEPTIONS, expectNoAxeViolations(state).
 */
import axe from 'axe-core';
import type { Result } from 'axe-core';
import { expect } from 'vitest';

/** WCAG 2.0, 2.1 and 2.2, A and AA. wcag22aa is one axe rule, target-size, disabled by axe's defaults and enabled below (M4 phase 2). */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

export interface A11yException {
  ruleId: string;
  /** The exact axe target selector of the tolerated node. */
  selector: string;
  /** The ADR 0009 amendment date that recorded it, e.g. '2026-09-20'. */
  adrAmendment: string;
}

export const KNOWN_A11Y_EXCEPTIONS: readonly A11yException[] = [];

function isExcepted(violation: Result): boolean {
  return violation.nodes.every((node) =>
    KNOWN_A11Y_EXCEPTIONS.some(
      (e) => e.ruleId === violation.id && e.selector === String(node.target),
    ),
  );
}

/** One line per violation node, readable in a failed assertion. */
function describe(violation: Result): string[] {
  return violation.nodes.map((node) => {
    const target = String(node.target);
    const rac = document.querySelector(target)?.closest('[data-rac]') !== null;
    return `${violation.id} [${violation.impact ?? 'n/a'}] ${target}${rac ? ' (React Aria markup: stop, maintainer decision, docs/adr/0009 amendment)' : ''} ${violation.helpUrl}`;
  });
}

/** Runs axe on the app root and fails with every violation listed. `state` names the screen and state for the report. */
export async function expectNoAxeViolations(state: string): Promise<void> {
  const root = document.querySelector('.app-shell');
  if (root === null) throw new Error('the application is not mounted');
  // React Aria renders a popover into a fresh child of document.body rather
  // than inside the shell (react-aria Overlay, portalContainer), so an open
  // listbox is invisible to a scan rooted at .app-shell. Every body child
  // outside the shell is scanned with it; the tester's own markup is in
  // another document.
  const overlays = [...document.body.children].filter(
    (el) => !el.contains(root) && el !== root && !root.contains(el),
  );
  const results = await axe.run([root, ...overlays] as unknown as Element, {
    runOnly: { type: 'tag', values: [...AXE_TAGS] },
    rules: { 'target-size': { enabled: true } },
    resultTypes: ['violations'],
  });
  const violations = results.violations.filter((v) => !isExcepted(v));
  expect(violations.flatMap(describe), `axe: ${state}`).toEqual([]);
}
