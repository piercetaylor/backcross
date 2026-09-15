# M3 phase 5: accessibility review — implementation spec

Repository: `C:\Users\pierc\Projects\Plant_Breeding_Projects\isoline-browser`. Saved by the main session as `docs/m3-phase5-a11y.md`. Sub-phases 5.1–5.9 below are each dispatchable as a line range; every one ends with its gates. Phase 4 UI is cited by component, symbol and accessible name only. Nothing under `src/io`, `src/workers` or `src/export` changes.

## 0. Scope, givens and stop rules

Givens (final): handoff decisions 3 and 5; m3-phases invariants 1–10 and the allocation table rows "WCAG 2.4.11", "Lighthouse", "Printed legibility" (phase 5 owns those three of the M2.5 "Not verified" list); `KNOWN_A11Y_EXCEPTIONS` stays empty; Playwright's `chromium.executablePath()` honours `PLAYWRIGHT_BROWSERS_PATH` on the maintainer's machine and launches headless (Chromium 153); phase 4 commits before phase 5 starts (handoff "Order").

Stop rules (the doer stops, writes its report, and the main session goes to the maintainer; nothing is worked around):

- S1. An axe violation whose target node is, or is inside, an element carrying `data-rac` (react-aria-components' marker): React Aria markup. Outcome is a dated ADR 0009 amendment decided by the maintainer. Never add to `KNOWN_A11Y_EXCEPTIONS`, never disable a rule, never wrap or restyle the React Aria element to dodge it.
- S2. A violation whose fix needs a colour or a dimension (a token value change or a new token): same route (ADR 0009 amendment), because `src/ui/tokens.css` is the design record.
- S3. A violation not predicted in 5.2 that a markup-only change fixes (an attribute, a role, a wrapper, a visually-hidden text) with no visual change: fix it, and list rule id, node and fix in the commit body under "axe findings fixed".
- S4. `npm run a11y:lighthouse` exits 1 after S3: stop with the printed audit list.
- S5. `window.matchMedia('print').matches` is false inside the tester iframe after `commands.emulateMedia('print')` in either browser: stop; the print test's design assumes Playwright's media emulation reaches the iframe.
- S6. The doer never runs git.

## 1. File list

New:

| path                                        | role                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tests/support/axe.ts`                      | axe runner, `AXE_TAGS`, `KNOWN_A11Y_EXCEPTIONS`, violation formatter                                      |
| `tests/browser/a11y-axe.test.tsx`           | axe on every screen and state (5.3)                                                                       |
| `tests/browser/focus-order.test.tsx`        | skip link, rail to screen, hidden elements, popover focus return, focus after load and after Cancel (5.4) |
| `tests/browser/focus-not-obscured.test.tsx` | WCAG 2.4.11 under the sticky table header (5.5)                                                           |
| `tests/browser/non-colour-cues.test.tsx`    | text/ARIA cue beside every colour or weight cue (5.6)                                                     |
| `tests/browser/print-media.test.tsx`        | print media rules (5.7)                                                                                   |
| `tests/upload-screen.test.tsx`              | node: the new-tab link markup (5.2)                                                                       |
| `scripts/lighthouse-a11y.mjs`               | Lighthouse gate (5.8)                                                                                     |

Edited:

| path                                                                                                                            | edit                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `package.json`, `README.md`, `CONTRIBUTING.md`                                                                                  | three devDependencies, script `a11y:lighthouse`, Node engine 22.19 (5.1)    |
| `vite.config.ts`                                                                                                                | `axe-core` in `BROWSER_DEPS`; `emulateMedia` command (5.1)                  |
| `eslint.config.js`                                                                                                              | ignore `lighthouse/` (5.1)                                                  |
| `.gitignore`                                                                                                                    | `lighthouse/` (5.1)                                                         |
| `tests/support/app-harness.tsx`                                                                                                 | `emulateMedia` in the `BrowserCommands` declaration (5.1)                   |
| `src/ui/shell/Rail.tsx`                                                                                                         | `<nav>` wraps a `role="toolbar"` div (5.2)                                  |
| `src/ui/screens/UploadScreen.tsx`                                                                                               | new-tab text on the link; focusable heading; Cancel moves focus to it (5.2) |
| `src/ui/screens/GenotypeViewScreen.tsx`                                                                                         | `role="img"` on both canvases (5.2)                                         |
| `src/ui/base.css`, `src/ui/shell/shell.css`, `src/ui/lines/lines.css`, `src/ui/screens/screens.css`, `src/ui/canvas/legend.css` | `@media print` rules; `print-color-adjust` (5.2)                            |
| `tests/browser/lines-grid-keyboard.test.tsx`                                                                                    | Ctrl+Home (5.4)                                                             |
| `.github/workflows/ci.yml`                                                                                                      | `npm run a11y:lighthouse` step (5.8)                                        |
| `CHANGELOG.md`, `docs/adr/0009-interface-design-language.md`, `CLAUDE.md`, `PLAN.md`                                            | 5.9                                                                         |

Not touched: `src/io/**`, `src/workers/**`, `src/export/**`, `src/ui/tokens.css` (unless S2 is triggered and the maintainer decides), `tsconfig.json`, `docs/m3-phases.md`, `README.md`.

## 2. Sub-phase 5.1: dependencies, config, command

### 5.1.1 `package.json`

Add to `devDependencies`, alphabetical, exact pins:

```json
"axe-core": "4.13.0",
"chrome-launcher": "1.2.1",
"lighthouse": "13.4.1",
```

Before `npm install`, run `npm view axe-core version`, `npm view chrome-launcher version`, `npm view lighthouse version`. If a printed version is newer, pin that exact version instead, subject to: axe-core major 4; chrome-launcher major ≥ 1 (ESM, named `launch`); lighthouse major ≥ 12 (ESM default export, `onlyCategories`) whose `engines.node` is met by CI's Node 22.x; chrome-launcher must satisfy lighthouse's own `chrome-launcher` range, so only one copy installs. Record the three installed versions in the commit body.

Also in `package.json`: `"engines": { "node": ">=22.19" }` (was `>=22.18`; lighthouse 13.4.1 declares `>=22.19`). Change `README.md` "Requires Node 22.18 or later." and `CONTRIBUTING.md` "Node 22.18 or newer is required" to 22.19 to match.

Add to `scripts`, after `"brapi:record"`:

```json
"a11y:lighthouse": "node scripts/lighthouse-a11y.mjs",
```

### 5.1.2 `vite.config.ts`

- `BROWSER_DEPS`: add `'axe-core'` after `'vitest-browser-react'`.
- After the `bringToFront` command (line 30), add:

```ts
// Switches the page's media type for tests/browser/print-media.test.tsx;
// null restores the browser's own. Playwright's page.emulateMedia applies to
// every frame of the page, so the tester iframe sees @media print.
const emulateMedia: BrowserCommand<[media: 'print' | 'screen' | null], void> = async (
  { page },
  media,
) => {
  await page.emulateMedia({ media });
};
```

- `commands: { bringToFront, emulateMedia }`.

### 5.1.3 `tests/support/app-harness.tsx`

In the `declare module 'vitest/browser'` block add:

```ts
/** Defined in vite.config.ts: Playwright's page.emulateMedia({ media }). */
emulateMedia: (media: 'print' | 'screen' | null) => Promise<void>;
```

Header comment: add `emulateMedia` to the sentence naming `bringToFront`. No other harness change.

### 5.1.4 `eslint.config.js` line 9

`{ ignores: ['dist/', 'node_modules/', 'coverage/', 'lighthouse/'] }` (the Lighthouse build output must not be linted).

### 5.1.5 `.gitignore`

Under "# dependencies and build output", after `coverage/`, add `lighthouse/`.

Gates 5.1: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser` (unchanged tests still pass in both instances).

## 3. Sub-phase 5.2: markup and stylesheet changes (predicted findings)

### 5.2.1 `src/ui/shell/Rail.tsx`: toolbar inside the navigation landmark

`toolbar` is not an allowed role on `<nav>` (ARIA in HTML); Lighthouse's `aria-allowed-role` audit flags it on the landing page. Replace lines 116–148 with:

```tsx
<nav aria-label="Steps">
  <div
    className="rail-steps"
    role="toolbar"
    aria-label="Steps"
    aria-orientation="vertical"
    onKeyDown={handleKeyDown}
  >
    {SCREENS.map((entry, i) => {
      /* unchanged */
    })}
  </div>
</nav>
```

`handleKeyDown`'s parameter type becomes `ReactKeyboardEvent<HTMLDivElement>`. `.rail-steps` keeps its rules in `shell.css` (now on the div). Header comment: "Keyboard:" paragraph gains "The toolbar is a `<div role="toolbar">` inside the `<nav>` landmark, because `toolbar` is not an allowed role on `nav`." `tests/rail.test.tsx` lines 65–69 still pass unchanged (they assert substrings). axe's `aria-allowed-role` is tagged best-practice and is not in `AXE_TAGS`; the Lighthouse gate is the only test of this.

### 5.2.2 `src/ui/screens/UploadScreen.tsx`

(a) New-tab indication (carried-over finding, WCAG G201). Replace the anchor at lines 207–209 with:

```tsx
<a className="input-coding-link" href={INPUT_CODING_URL} target="_blank" rel="noreferrer">
  input coding reference<span className="visually-hidden"> (opens in a new tab)</span>
</a>
```

Accessible name becomes exactly `input coding reference (opens in a new tab)`.

(b) Focus after Cancel. The Cancel button (accessible name `Cancel`, rendered while `brapiLoading`) unmounts under focus when the worker's "BrAPI: load cancelled" error lands, dropping focus to `<body>`. Change:

- `import { useRef, useState } from 'react';`
- Inside the component: `const headingRef = useRef<HTMLHeadingElement | null>(null);`
- The heading: `<h2 ref={headingRef} tabIndex={-1}>Upload and validate</h2>`
- The Cancel button's handler: `onClick={() => { onCancelBrapi(); headingRef.current?.focus(); }}`

Header comment: add "Cancel moves focus to the screen heading before it unmounts, so focus never drops to the body (tests/browser/focus-order.test.tsx)."

(c) Nothing else on this screen. Load errors are already a `role="alert"` paragraph in `App.tsx` (implicitly assertive live region); the m3-phases expectation of "a live region for load errors" is satisfied as is and is recorded in the commit body.

### 5.2.3 `src/ui/screens/GenotypeViewScreen.tsx`

- Main canvas (class `geno-canvas`): add `role="img"`; keep `tabIndex={0}`, the handlers and the existing `aria-label`.
- Overview canvas (class `geno-overview`): add `role="img"`; keep its `aria-label`.
- Header comment "The canvas and its context" paragraph: append "Both canvases are `role="img"` with a description: the main one is focusable and keyboard-operated, and its label states the keys (docs/m3-phases.md, phase 5). A screen reader in browse mode does not switch to focus mode for an image, so those keys reach the canvas only after the user switches modes; unverified without assistive technology."

### 5.2.4 Print rules (token-only; `tests/css-literals.test.ts` must stay green)

`src/ui/shell/shell.css`, append:

```css
/* ---- Print ---- */

/*
 * Paper gets the data, not the chrome: the rail is navigation, and the
 * content column takes the whole sheet. tests/browser/print-media.test.tsx.
 */
@media print {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .rail {
    display: none;
  }

  .app-main {
    padding: 0;
  }
}
```

`src/ui/base.css`, append:

```css
@media print {
  .skip-link {
    display: none;
  }
}
```

`src/ui/lines/lines.css`, append:

```css
/* ---- Print ---- */

@media print {
  .line-action-bar {
    display: none;
  }

  /* Nothing scrolls on paper: the whole table prints under a static header. */
  .lines-table-viewport {
    max-height: none;
    overflow: visible;
  }

  .lines-table thead th {
    position: static;
  }
}
```

`src/ui/screens/screens.css`, append:

```css
/* ---- Print ---- */

@media print {
  .geno-toolbar,
  .keyboard-help,
  .marker-detail {
    display: none;
  }

  .geno-scroll {
    overflow-x: visible;
  }
}
```

`src/ui/canvas/legend.css`, add to the `.class-swatch` rule:

```css
/* Browsers drop backgrounds when printing; the swatch is the legend's whole meaning. */
print-color-adjust: exact;
-webkit-print-color-adjust: exact;
```

### 5.2.5 `tests/upload-screen.test.tsx` (node project, new)

```tsx
/**
 * The Upload screen's markup from renderToString (environment: 'node', as
 * tests/rail.test.tsx): the input-coding link opens a new tab, says so for
 * assistive technology, and keeps rel="noreferrer". Behaviour (focus, the
 * BrAPI form) is in tests/browser/.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { config } from '../src/config.ts';
import { UploadScreen } from '../src/ui/screens/UploadScreen.tsx';

const html = renderToString(
  <UploadScreen
    params={{ rpp: config.rpp, segments: config.segments, qc: config.qc }}
    onParamsChange={() => undefined}
    busy={false}
    onLoad={() => undefined}
    loaded={null}
    onFetchCallSets={() => Promise.resolve({ callSets: [], warnings: [] })}
    onCancelBrapi={() => undefined}
    brapiLoading={false}
  />,
);

describe('input coding reference link', () => {
  const anchor = /<a class="input-coding-link"[^>]*>[\s\S]*?<\/a>/.exec(html)?.[0];

  it('exists once and points at docs/input-coding.md on the repository', () => {
    expect(anchor).toBeDefined();
    expect(html.split('class="input-coding-link"')).toHaveLength(2);
    expect(anchor).toContain(
      'href="https://github.com/piercetaylor/isoline-browser/blob/main/docs/input-coding.md"',
    );
  });

  it('opens a new tab without a referrer and says so', () => {
    expect(anchor).toContain('target="_blank"');
    expect(anchor).toContain('rel="noreferrer"');
    expect(anchor).toMatch(
      /input coding reference<span class="visually-hidden"> \(opens in a new tab\)<\/span>/,
    );
  });
});
```

Gates 5.2: `npm run lint`, `npm run typecheck`, `npm test` (includes `tests/rail.test.tsx`, `tests/css-literals.test.ts`, `tests/tokens.test.ts`, the new file), `npm run build`, `npm run test:browser` (existing `brapi-upload.test.tsx` still passes: the Cancel test clicks by name).

## 4. Sub-phase 5.3: axe harness

### 5.3.1 `tests/support/axe.ts` (browser tests only)

```ts
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

/** WCAG 2.0 and 2.1, A and AA. wcag22aa is one axe rule, target-size, disabled by axe until 2.2 is widely required; it fails .geno-gutter button (14 px at an 18 px pitch). Deferred, PLAN.md M3 block. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

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
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: [...AXE_TAGS] },
    resultTypes: ['violations'],
  });
  const violations = results.violations.filter((v) => !isExcepted(v));
  expect(violations.flatMap(describe), `axe: ${state}`).toEqual([]);
}
```

### 5.3.2 `tests/browser/a11y-axe.test.tsx`

Imports: `page, userEvent` from `vitest/browser`; `describe, expect, it` from vitest; harness `fixtureFiles, goTo, loadBrapi, loadFiles, mountApp, waitFor`; `AXE_TAGS, KNOWN_A11Y_EXCEPTIONS, expectNoAxeViolations` from `../support/axe.ts`. ``const MOCK_BASE = `${location.origin}/__brapi__`;`` (as `brapi-upload.test.tsx`).

Tests (each `it` mounts afresh; states run sequentially inside it):

1. `'the exceptions list is empty and the tag set is WCAG A and AA'`: `expect(KNOWN_A11Y_EXCEPTIONS).toEqual([])`; `expect([...AXE_TAGS]).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])`.
2. `'Upload, empty'`: `mountApp()`; `expectNoAxeViolations('upload empty')`.
3. `'Upload, BrAPI source: empty form, load in flight with Cancel, cancelled alert, 404 alert'`:
   - `mountApp()`; click `page.getByText('BrAPI server', { exact: true })`; wait `page.getByLabelText('Base URL')`; axe `'brapi form empty'`.
   - fill `Base URL` = MOCK_BASE, `Variant set id` = `'hangset'`; upload samples to `page.getByLabelText(/^samples\.csv/)`; click button `Load`; `expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInTheDocument()`; axe `'brapi load in flight'`.
   - click `Cancel`; poll `[role="alert"]` text matches `/BrAPI: load cancelled/`; axe `'brapi cancelled alert'`.
   - fill `Variant set id` = `'nosuchset'`; click `Load`; poll alert matches `/returned HTTP 404/`; axe `'brapi 404 alert'`.
4. `'Upload, revisited after a load'`: `mountApp(); loadFiles(fixtureFiles()); goTo('1. Upload')`; `expect.element(page.getByText('500 markers', { exact: false }))`; axe `'upload loaded'`.
5. `'Summary and QC'`: mount, load; axe `'summary'`.
6. `'Lines: default, all selected, empty filter state'`: goTo `'3. Lines'`; wait `/^Lines: 6,/`; axe `'lines'`; click button `Select all visible`; poll `/selected: 6/`; axe `'lines all selected'`; `userEvent.fill(page.getByLabelText('Filter'), 'zzz')`; `expect.element(page.getByText('No lines match the filter.'))`; axe `'lines empty state'`.
7. `'Graphical genotypes: whole genome, one chromosome with overview, region error, sort popover open'`: goTo `'4. Graphical genotypes'`; `waitFor(() => document.querySelectorAll('.geno-strip-track').length > 0)`; axe `'genotypes whole genome'`; `userEvent.selectOptions(page.getByLabelText('View'), 'Gm13')`; `waitFor(() => document.querySelector('canvas.geno-overview'))`; axe `'genotypes chromosome'`; `userEvent.fill(page.getByLabelText('Region'), 'nonsense'); userEvent.keyboard('{Enter}')`; poll `#genotype-region-error` exists; axe `'genotypes region error'`; `const trigger = document.querySelector<HTMLElement>('.line-select-button')`; `userEvent.click(page.elementLocator(trigger))`; `waitFor(() => document.querySelector('[role="listbox"]'))`; axe `'genotypes sort popover open'`; `userEvent.keyboard('{Escape}')`.
8. `'Compare: form and result'`: goTo `'5. Compare'`; axe `'compare form'`; click button `Compare`; `expect.element(page.getByRole('heading', { name: /^Result:/ }))`; axe `'compare result'`.
9. `'Export'`: goTo `'6. Export'`; `expect.element(page.getByRole('button', { name: 'Download per-line summary CSV' })).toBeEnabled()`; axe `'export'`.

Acceptance: every `it` passes in both instances. Any failure routes through stop rules S1–S3.

Gates 5.3: `npm run test:browser` (both instances), plus lint and typecheck.

## 5. Sub-phase 5.4: keyboard tests

### 5.4.1 `tests/browser/lines-grid-keyboard.test.tsx`

After line 115 (`{Control>}{End}{/Control}`), add:

```ts
await pressExpectingFocus('{Control>}{Home}{/Control}', focusedRowIndex, 0);
```

Header comment line 6: "arrow keys, Home/End, Ctrl+Home/End move within it". This closes the M2.5 "Not verified" wording ("Ctrl+Home/End") in full.

### 5.4.2 `tests/browser/focus-order.test.tsx` (new)

Helpers (in the file): `active()` as in `lines-grid-keyboard.test.tsx`; `rail = () => document.querySelector<HTMLElement>('.rail')!`; `toggle = () => document.querySelector<HTMLButtonElement>('.rail-toggle')!`;

```ts
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
```

Tests:

1. `'the first Tab lands on the skip link and Enter moves focus into main'`: `mountApp()`; `pressExpectingFocus('Tab', () => active().className, 'skip-link')`; `expect(isVisiblyFocused(active())).toBe(true)` (the `:focus` rule un-clips it); `pressExpectingFocus('{Enter}', () => active().id, 'main-content')`.
2. `'a successful load moves focus to the Summary heading'`: mount, `loadFiles(fixtureFiles())`; `expectFocus(() => active().textContent, 'Dataset summary and QC')`; `expect(active().tagName).toBe('H2')`.
3. `'cancelling a BrAPI load moves focus to the Upload heading'`: mount; the hangset flow of 5.3 test 3 up to clicking `Cancel`; `expectFocus(() => active().textContent, 'Upload and validate')`; poll alert `/BrAPI: load cancelled/`; `expect(active()).not.toBe(document.body)` after the Cancel button is gone (`expect.element(cancel).not.toBeInTheDocument()`).
4. `'from the rail's last tab stop one Tab enters each screen, and no Tab ever lands on a hidden element'`: mount, load. For each `[step, first]` of

   | step                       | expected `first` after one Tab from `.rail-toggle`                                                                                                                                                                |
   | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `'1. Upload'`              | `active()` is the link named `input coding reference (opens in a new tab)` (`page.getByRole('link', { name: 'input coding reference (opens in a new tab)' })`; also assert `getAttribute('target') === '_blank'`) |
   | `'2. Summary and QC'`      | `!rail().contains(active())` (the screen has no control; the sequence leaves the rail)                                                                                                                            |
   | `'3. Lines'`               | button `Select all visible`                                                                                                                                                                                       |
   | `'4. Graphical genotypes'` | button `Select all visible`                                                                                                                                                                                       |
   | `'5. Compare'`             | the `Sample A` select (`page.getByLabelText('Sample A')`)                                                                                                                                                         |
   | `'6. Export'`              | button `Download per-line summary CSV`                                                                                                                                                                            |

   For each: `goTo(step)`; `toggle().focus()`; `pressExpectingFocus('Tab', () => active() === expectedElement (or the predicate for Summary), true)`. Then walk: `const seen = new Set<Element>([active()])`; up to 30 times: `pressExpectingFocus('Tab', () => true, true)` (a plain `userEvent.tab()` inside `ensureWindowFocus` semantics; use `await userEvent.tab()` then `await expectFocus(() => document.hasFocus(), true)`), stop when `active() === document.body` or `seen.has(active())`; else ``expect(isVisiblyFocused(active()), `${step}: ${active().outerHTML.slice(0, 120)}`).toBe(true)`` and add to `seen`.

5. `'Escape closes the sort popover and returns focus to its button'`: mount, load, goTo `'4. Graphical genotypes'`; `const trigger = document.querySelector<HTMLElement>('.line-select-button')!; trigger.focus()`; `pressExpectingFocus('{ArrowDown}', () => active().closest('[role="listbox"]') !== null, true)`; `pressExpectingFocus('{Escape}', () => active(), trigger)`.

Both files use `onTestFinished` focus reporting as `lines-grid-keyboard.test.tsx` does (copy lines 69–74).

Gates 5.4: `npm run test:browser` both instances; lint; typecheck.

## 6. Sub-phase 5.5: `tests/browser/focus-not-obscured.test.tsx` (WCAG 2.4.11)

Dataset: `SPEC = { ...BENCH_SPEC, markersPerChrom: 250, nCandidates: 40 }` built as in `genotype-view.test.tsx` lines 59–65 (`synthVcfLines`, `synthSamplesCsv`, `synthMarkersCsv`), loaded with `loadFiles`; `goTo('3. Lines')`; `expect.element(page.getByText(/^Lines: 40,/))`.

Helpers: `grid()`, `active()`, `bodyRows()`, `focusedRowIndex()` copied from `lines-grid-keyboard.test.tsx`; plus:

```ts
function rects() {
  const viewport = document.querySelector('.lines-table-viewport')!.getBoundingClientRect();
  const header = document.querySelector('.lines-table thead')!.getBoundingClientRect();
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
```

Test `'a row reached by keyboard is never under the sticky header nor outside the scroll container'`: enter the grid as `lines-grid-keyboard.test.tsx` lines 81–90 (click the Density `Default` label, Tab). `const N = 20` (more rows than the 480 px viewport shows at 32 px; the plan's five presses never leave the visible band, see conflict 4). `pressExpectingFocus('{Control>}{End}{/Control}', focusedRowIndex, 39)`; `expectNotObscured('Ctrl+End')`; for `i` in 1..N: `pressExpectingFocus('{ArrowUp}', focusedRowIndex, 39 - i)`; ``expectNotObscured(`ArrowUp ${i}`)``. Then `pressExpectingFocus('{Control>}{Home}{/Control}', focusedRowIndex, 0)`; `expectNotObscured('Ctrl+Home')`; for `i` in 1..N: `{ArrowDown}` to `i`; `expectNotObscured`. Also assert once that the header is sticky: `getComputedStyle(document.querySelector('.lines-table thead th')!).position === 'sticky'`, so the test cannot pass because the header stopped sticking.

Gates 5.5: `npm run test:browser` both instances.

## 7. Sub-phase 5.6: `tests/browser/non-colour-cues.test.tsx`

Imports `CALL_CLASS_LABEL, CallClass` from `../../src/core/types.ts`. Mount and `loadFiles(fixtureFiles())` in each test.

1. `'Summary: a shaded QC row says why in text'`: `const flagged = [...document.querySelectorAll('table.data-table tbody tr.qc-flagged')]`; `expect(flagged.length).toBeGreaterThan(0)` (NIL_05); every one: `td.flags` text non-empty and contains `closer_to_donor`; `getComputedStyle(td.flags).fontWeight` is `'600'` (the weight cue exists alongside the text, not instead).
2. `'Rail: current and done steps carry an ARIA or text cue'`: `.rail-item[data-state="current"]` has `aria-current="page"` (exactly one); `.rail-item[data-state="done"]` (Upload): `getComputedStyle(el, '::after').content` contains `'\u2713'`; `.rail-item[data-state="blocked"]` count 0 after load.
3. `'Lines: a selected row is aria-selected with a visible tick'`: goTo Lines; click `Select all visible`; poll `/selected: 6/`; every `tbody [role="row"]` has `aria-selected="true"`; in each, `.check-tick` computed `visibility === 'visible'`.
4. `'Legend: every class has a text label and the four textured classes carry a pattern'`: goTo Graphical genotypes; `const items = [...document.querySelectorAll('.legend li')]`; length 6; labels in order `[RP_HOM, DONOR_HOM, HET, MISSING, UNINFORMATIVE, NONPARENTAL].map(c => CALL_CLASS_LABEL[c])` equal `items.map(li => li.textContent!.trim())`; every `.class-swatch` has `aria-hidden="true"`; `backgroundImage` of the swatch contains `'gradient'` for DONOR_HOM, HET, MISSING, NONPARENTAL and equals `'none'` for RP_HOM and UNINFORMATIVE (ADR 0009, amended 2026-09-11).
5. `'Errors carry role=alert and text, not only the alert colour'`: on Graphical genotypes fill `Region` with `nonsense`, Enter; `#genotype-region-error` has `role="alert"`, non-empty text, `getComputedStyle(el).borderLeftWidth !== '0px'` (the bar) — the text is the non-colour channel.

Gates 5.6: `npm run test:browser` both instances.

## 8. Sub-phase 5.7: `tests/browser/print-media.test.tsx`

`afterEach(async () => { await commands.emulateMedia(null); })`. Helper `async function printMedia() { await commands.emulateMedia('print'); await expect.poll(() => window.matchMedia('print').matches).toBe(true); }` (failure here is stop rule S5). `display(sel) = getComputedStyle(document.querySelector(sel)!).display`.

1. `'Lines: print hides the chrome and unrolls the table'`: mount, load, goTo Lines, wait `/^Lines: 6,/`; `printMedia()`; expect `display('.rail') === 'none'`, `display('.skip-link') === 'none'`, `display('.line-action-bar') === 'none'`; `.lines-table-viewport` computed `maxHeight === 'none'` and `overflowY === 'visible'`; `.lines-table thead th` `position === 'static'`; all 6 `tbody [role="row"]` have `getBoundingClientRect().height > 0`.
2. `'Graphical genotypes: print keeps the canvas, the gutter and a legend the printer will ink'`: mount, load, goTo Graphical genotypes; `waitFor` strip tracks > 0 and 6 gutter `li`; `const before = canvas.getBoundingClientRect()`; `printMedia()`; `display('.rail')`, `.line-action-bar`, `.geno-toolbar`, `.marker-detail`, `.keyboard-help` all `'none'`; poll: canvas `height === before.height` and `width >= before.width` (hiding the rail widens the column; the ResizeObserver redraws wider, never smaller: conflict 6); 6 gutter `li` each `height > 0`; every `.class-swatch`: `getComputedStyle(s).getPropertyValue('print-color-adjust') === 'exact' || getPropertyValue('-webkit-print-color-adjust') === 'exact'`; the four textured swatches' `backgroundImage` still contains `'gradient'`.

Paper itself stays unverifiable; the commit body says so.

Gates 5.7: `npm run test:browser` both instances; `npm test` (css-literals over the new rules).

## 9. Sub-phase 5.8: Lighthouse gate

### 9.1 `scripts/lighthouse-a11y.mjs` (complete)

As committed, the script also wraps `chrome.kill()` in a try/catch: on Windows chrome-launcher 1.2.1 fails with EPERM removing its profile directory after every run, which made a 100/100 audit exit 1. And the browser project runs its files one at a time (`fileParallelism: false` in `vite.config.ts`), because the three focus-taking files failed Firefox side by side.

```js
/**
 * Lighthouse accessibility audit of the built landing page (PLAN.md, M3:
 * "Lighthouse accessibility score above 90").
 *
 * Builds the app with base "/" into lighthouse/dist (never dist/, which is
 * the Pages build), serves it with Vite's preview server on 127.0.0.1:4173,
 * runs Lighthouse's accessibility category in the Chromium that Playwright
 * installed (chromium.executablePath() honours PLAYWRIGHT_BROWSERS_PATH;
 * CHROME_PATH overrides it), writes lighthouse/accessibility.json and prints
 * the score with every failing audit.
 *
 * Lighthouse sees only the Upload screen, since it cannot load files; the
 * other five screens are covered by axe in tests/browser/a11y-axe.test.tsx.
 *
 * Exit codes: 0 score above 90; 1 score 90 or below, a null score or a
 * Lighthouse runtime error; 2 the environment (no Chromium, build or server
 * failure).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const PORT = 4173;
const HOST = '127.0.0.1';
const OUT_DIR = join(process.cwd(), 'lighthouse');
const DIST_DIR = join(OUT_DIR, 'dist');
const REPORT = join(OUT_DIR, 'accessibility.json');
/** PLAN.md says "above 90": 91 passes, 90 fails. */
const THRESHOLD = 90;

function resolveChrome() {
  const fromEnv = process.env.CHROME_PATH;
  const path = fromEnv !== undefined && fromEnv !== '' ? fromEnv : chromium.executablePath();
  if (!existsSync(path)) {
    console.error(
      `No Chromium at ${path}. Run "npx playwright install chromium" or set CHROME_PATH; ` +
        "on the maintainer's machine PLAYWRIGHT_BROWSERS_PATH must point at " +
        '%USERPROFILE%\\.cache\\ms-playwright (CLAUDE.md, "Environment gotchas").',
    );
    process.exit(2);
  }
  return path;
}

async function main() {
  const chromePath = resolveChrome();
  process.env.VITE_BASE_PATH = '/';
  let server;
  try {
    await build({ logLevel: 'warn', build: { outDir: DIST_DIR, emptyOutDir: true } });
    server = await preview({
      logLevel: 'warn',
      build: { outDir: DIST_DIR },
      preview: { host: HOST, port: PORT, strictPort: true },
    });
  } catch (error) {
    console.error(error);
    process.exit(2);
  }
  const url = `http://${HOST}:${PORT}/`;
  let chrome;
  try {
    chrome = await launch({ chromePath, chromeFlags: ['--headless', '--disable-gpu'] });
  } catch (error) {
    console.error(error);
    await server.close();
    process.exit(2);
  }
  let code = 1;
  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility'],
    });
    if (result === undefined) throw new Error('Lighthouse returned no result');
    const { lhr } = result;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(REPORT, Array.isArray(result.report) ? result.report[0] : result.report);
    if (lhr.runtimeError !== undefined) {
      console.error(
        `Lighthouse runtime error ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`,
      );
    } else {
      const score = lhr.categories.accessibility.score;
      const pct = score === null ? null : Math.round(score * 100);
      console.log(
        `Lighthouse ${lhr.lighthouseVersion} accessibility: ${pct ?? 'null'} / 100 ` +
          `(${lhr.environment.hostUserAgent}) on ${lhr.finalDisplayedUrl}`,
      );
      const failing = lhr.categories.accessibility.auditRefs
        .map((ref) => lhr.audits[ref.id])
        .filter((audit) => audit.score !== null && audit.score < 1);
      for (const audit of failing) {
        console.log(`  FAIL ${audit.id}: ${audit.title}`);
        for (const item of audit.details?.items ?? []) {
          if (item.node?.selector !== undefined) console.log(`       ${item.node.selector}`);
        }
      }
      console.log(`Report: ${REPORT}`);
      if (pct !== null && pct > THRESHOLD) code = 0;
      else console.error(`Accessibility score ${pct ?? 'null'} is not above ${THRESHOLD}.`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    await chrome.kill();
    await server.close();
  }
  process.exit(code);
}

await main();
```

Verification the doer performs: `npm run a11y:lighthouse` locally prints a score and exits 0; `git status` shows no new tracked file (`lighthouse/` ignored); `dist/` untouched; `npm run lint` still passes with `lighthouse/` present.

### 9.2 `.github/workflows/ci.yml`

In the `browser` job, after the `npm run test:bench` step (lines 63–65), add:

```yaml
- run: npm run a11y:lighthouse
```

Comment above the job (lines 48–50) gains: "Then Lighthouse's accessibility category on the built landing page (scripts/lighthouse-a11y.mjs, PLAN.md M3)." Playwright's Chromium is already installed by that job; the script finds it through `chromium.executablePath()`.

### 9.3 `CLAUDE.md`, gates and gotchas (the State edits are in 5.9)

- Line 31: ``Per milestone, not per commit: `npm run test:bench`, the 50K x 200 load in both browsers, and `npm run a11y:lighthouse`, the Lighthouse accessibility audit of the built landing page (exit 0 means above 90). Record the bench's printed wall-clock and memory figures and the Lighthouse score and versions in the milestone's verification block and compare them with the previous ones.``
- Environment gotchas, after the Playwright bullet: ``- `npm run a11y:lighthouse` finds Chromium through Playwright's `chromium.executablePath()`, so it needs the same `PLAYWRIGHT_BROWSERS_PATH`; `CHROME_PATH` overrides it. It builds into `lighthouse/` (gitignored) and never touches `dist/`.``

Gates 5.8: `npm run a11y:lighthouse` exit 0 with score printed; `npm run lint`; `npm run build` (dist unaffected).

## 10. Sub-phase 5.9: documentation, verification block, commit

### 10.1 `CHANGELOG.md`

Under `## [Unreleased]` → `### Added`, insert as the first bullet:

``- Accessibility review (M3): focus order verified in Chromium and Firefox from the skip link, through the rail, into every screen; a Lines row reached by keyboard is never hidden under the sticky header (WCAG 2.4.11); every status carries a text or ARIA cue beside its colour or weight; axe-core reports no WCAG 2.0/2.1 A or AA violation on any of the six screens, including the BrAPI form, a load in flight with its Cancel button, its error, the empty-filter table, the chromosome overview, a region error and the sort list open; and Lighthouse accessibility is above 90 on the built landing page, run by `npm run a11y:lighthouse` locally and in CI. Visible changes: the "input coding reference" link says it opens in a new tab; the genotype canvases are exposed as images with their descriptions; the rail's steps are a toolbar inside the navigation landmark; cancelling a BrAPI load moves focus to the Upload heading instead of dropping it; and printing hides the rail, the action bars, the genotype toolbar and the hover panel, unrolls the Lines table, and keeps the legend swatches' colours and textures.``

### 10.2 `docs/adr/0009-interface-design-language.md`

Append at the end:

```
## Amendments, <commit date>

The accessibility review (docs/m3-phases.md, phase 5) forced these decisions, taken by the maintainer; the sections above are left as first written.

**Print shows the data and hides the chrome.** This record said nothing about paper. Under `@media print` the rail, the skip link, the line action bars, the genotype toolbar, the keyboard help and the hover panel are not printed; the content column takes the whole sheet; the Lines table prints in full under a static header; and the legend swatches force `print-color-adjust: exact`, since a printer that drops backgrounds would print a legend of empty boxes. The graphical genotype canvas prints as the bitmap it is, textures included, which is what the greyscale argument above rests on. Asserted by tests/browser/print-media.test.tsx; paper itself stays unverified.

**<S1/S2 outcomes, one paragraph each, if any; omitted otherwise.>**
```

### 10.3 `CLAUDE.md` State

Replace the State paragraph with: ``M0, M1, M2, M2.5 and M3 are complete and verified; each has a dated verification block at the bottom of `PLAN.md` recording what was measured and what was not. M3 shipped browser-mode tests in Chromium and Firefox (docs/adr/0011), the streaming bgzip parse (0012), the shared data contract at 1.2.0 (0013, 0014), the BrAPI allele-matrix loader (0015) and the accessibility review (axe on every screen, focus order, WCAG 2.4.11 under the sticky header, print media, `npm run a11y:lighthouse`). **What comes next is not yet planned**; the deferred list at the end of the M3 verification block in `PLAN.md` is the candidate set, virtualisation first.``

Replace the M2.5 paragraph with: ``M2.5 built the interface from `docs/m2.5-phases.md`; the browser-mode tests M3 added now assert the APG grid keyboard pattern, the sticky-header criterion and the print rules that M2.5 could only claim. Still asserted nowhere: screen-reader behaviour and paper output. The genotype overview subsamples lines once there are more of them than it has pixels, which is the virtualisation problem M3 did not take.``

ADR line: `` `0015` is the most recent. `0009` carries dated amendments at its end for decisions taken during M2.5 and the M3 accessibility review. ``

### 10.4 `PLAN.md` M3 verification block (template; the main session fills every `<…>` from its own runs and commits it; the doer writes none of the figures)

```
### M3 run, <YYYY-MM-DD>

Same laptop as the M1, M2 and M2.5 runs. Node v<…>, npm <…>, vitest 5.0.0, Playwright <…> (Chromium <…>, Firefox <…>). Five commits, one per phase of docs/m3-phases.md, plus the contract 1.1.0 and 1.2.0 commits; every gate passes at each.

$ npm run lint && npm run typecheck
(exit 0; "All matched files use Prettier code style!")

$ npm test
 Test Files  <n> passed (<n>)
      Tests  <n> passed (<n>)

$ npm run test:browser
 chromium: Test Files <n> passed, Tests <n> passed
 firefox:  Test Files <n> passed, Tests <n> passed

$ npm run build
dist/assets/analysis.worker-*.js   <…> kB
dist/assets/index-*.css            <…> kB
dist/assets/index-*.js             <…> kB  (gzip <…> kB)

$ npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract
(exit 0; no diff)

$ npm run test:bench
 chromium: Lines: 200 at <…> ms after Load; first draw at <…> ms; measureUserAgentSpecificMemory delta <…> MB against 2 × bytesInflated = <…> MB; peakBuilderBytes + residentMatrixBytes = <…> MB
 firefox:  Lines: 200 at <…> ms; first draw at <…> ms; peakBuilderBytes + residentMatrixBytes = <…> MB (accounting only; no memory API)
 Phase 1 baseline (non-streaming path, commit <sha>): <…> ms, <…> MB.  Phase 2 (streaming, commit <sha>): <…> ms, <…> MB.

$ npm run a11y:lighthouse
Lighthouse <…> accessibility: <score> / 100 (Chromium <…>) on http://127.0.0.1:4173/
```

**Measured.** <One paragraph per criterion of PLAN.md's M3 line: the memory bound and which browser; the 30 s figure on this laptop and the CI hang guard; the contract tests on both repositories (mirror check count); Lighthouse score; the axe state list of tests/browser/a11y-axe.test.tsx with "no violations in either browser".>

**Not verified.** Screen readers (no assistive technology in the environment; in particular whether a browse-mode user can reach the canvas keys); paper output (print media is emulated, not printed); Lighthouse on any screen that needs a dataset (it cannot load files; axe covers those); Safari; a real SoySNP50K or BARCSoySNP6K file; `readr` on the browser-only CSVs.

Deferred past M3, in rough order of value: virtualisation of the genotype overview; WCAG 2.2 target-size on the gutter buttons (2.5.8; the Equivalent exception arguably applies through the Lines rows, which axe cannot see); the vendor chunk split (docs/adr/0010); the contract items PLAN.md lists under "Deferred, 2026-09-14"; contract 1.3.0.

### 10.5 Commit (main session; explicit paths only; message via `git commit -F`)

`feat(ui): accessibility review with axe, focus, print and Lighthouse gates`

Body sections: "axe states" (the list from 5.3.2), "axe findings fixed" (S3 outcomes or "none beyond the predicted four": toolbar, new-tab text, canvas roles, Cancel focus), "Lighthouse: <score>, lighthouse <v>, chromium <v>, chrome path via Playwright", "Installed: axe-core <v>, chrome-launcher <v>, lighthouse <v>", "Honest split: Lighthouse sees the landing screen only; axe covers the other five after a fixture load", "Not verified: screen readers, paper". No attribution footer.

Gates 5.9 (main session, all): `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract`, `npm run test:bench`, `npm run a11y:lighthouse`.

## (a) Conflicts found

1. `docs/m3-phases.md:280` runs axe with `['wcag2a','wcag2aa','wcag21aa']`; `docs/adr/0009-interface-design-language.md:33` and `PLAN.md:130` argue from WCAG 2.2. Adding `wcag22aa` brings axe's `target-size` (2.5.8, 24 px), which `.geno-gutter button` fails: `src/ui/screens/screens.css:199-202` sets its height to `--canvas-row-height` (14 px, `tokens.css:130`) at an 18 px pitch. Question 1.
2. `docs/m3-phases.md:285` names `tests/support/commands.ts` for `emulateMedia`; the code has no such file and defines `bringToFront` inline in `vite.config.ts:28-30`. Spec puts `emulateMedia` beside it. Question 4.
3. `docs/m3-phases.md:281` "from the rail, one `tab()` enters the current screen's first control": `src/ui/shell/Rail.tsx:150-165` puts the collapse toggle after the steps as a separate tab stop, so from the current step it is two Tabs; and `SummaryScreen.tsx` has no focusable control (its `h2` is `tabIndex={-1}`, line 109). Spec measures from the toggle and asserts "leaves the rail" for Summary.
4. `docs/m3-phases.md:282` "ArrowUp five times" after Ctrl+End never leaves the visible band: `lines.css:178` gives the viewport `calc(100vh - 240px)` = 480 px at the 720 px test viewport (`vite.config.ts:51`), about 15 rows. Spec presses 20 each way.
5. `docs/m3-phases.md:283` "every QC status cell has non-empty text": `src/ui/screens/SummaryScreen.tsx:195` renders an empty flags cell for an unflagged line by design. Spec asserts `tr.qc-flagged` rows only.
6. `docs/m3-phases.md:284` "the canvas keeps its size" under print: hiding the rail (`shell.css:12-21`) widens the content column and the host's ResizeObserver (`GenotypeViewScreen.tsx:260-284`) redraws the canvas wider. Spec asserts equal height and width ≥ before.
7. `docs/m3-phases.md:286` builds and previews from `dist/`, which `ci.yml:43-46` uploads to Pages from the `check` job and which a local run would overwrite with a `/`-based build. Spec builds into `lighthouse/dist` through Vite's JS API; `eslint.config.js:9` must then ignore `lighthouse/`.
8. `docs/m3-phases.md:288` expects "a live region for load errors": `src/App.tsx:479-483` already renders `<p role="alert">`. No change; recorded in the commit body.
9. `docs/m3-phases.md:288` expects `role="img"` on the genotype canvas: `GenotypeViewScreen.tsx:793-805` and `:811-816` carry `aria-label` but no role. Spec adds it (5.2.3). Question 2 on the role choice.
10. `src/ui/shell/Rail.tsx:116-122` puts `role="toolbar"` on `<nav>`, which ARIA in HTML does not allow and Lighthouse's `aria-allowed-role` audit flags; no plan item names it. Spec 5.2.1. Question 5.
11. `PLAN.md:130` says the application "has no menu and no dialog"; `src/ui/lines/LineActionBar.tsx:198-214` has a `Select` with a `Popover`/`ListBox` overlay. The "dialogs and menus open" state is that popover.
12. `src/ui/screens/UploadScreen.tsx:393-397` unmounts the focused Cancel button when the cancellation error lands, dropping focus to `<body>`; no plan item. Spec 5.2.2(b), touching phase-4 code after phase 4 commits. Question 3.
13. `CLAUDE.md:38` said `0014` is the most recent ADR; handoff decision 4 makes phase 4's ADR `0015`. Spec 10.3 writes `0015`.
14. `CHANGELOG.md` has two `### Changed` headings under `[Unreleased]`. Pre-existing; phase 5 adds to `### Added` only. Question 6.
15. `docs/m3-phases.md:292` counts "the six tests above" against a table of five new test files plus `commands.ts`; the spec's count is five new browser tests, one edited, one new node test.
16. `docs/m3-phases.md:63` names the Windows Playwright cache `%USERPROFILE%\AppData\Local\ms-playwright`; `CLAUDE.md:54` says that cache cannot launch and `PLAYWRIGHT_BROWSERS_PATH` overrides it. The script inherits Playwright's resolution, so both paths are honoured; CLAUDE.md gets the note (9.3).
17. `docs/m3-phases.md:239` named the BrAPI ADR `0014`; superseded by handoff decision 4 (`0015`). Noted only.

## (b) Maintainer questions

**Resolved 2026-09-15.** The maintainer delegated all seven to Fable research ("ask fable"), with the criterion of what best serves academic and open-source plant-breeding users. Every recommendation below was taken: Q1 (a), keep WCAG 2.0/2.1 A+AA and defer 2.5.8; Q2 `role="img"`, with the browse-mode caveat recorded; Q3 to Q6 yes. For Q7, axe's `color-contrast-matches` skips elements that are `aria-disabled` or inside a disabled ancestor (checked in the axe-core 4.10.3 source), so the rule will not fire; `--neutral-10` stays only as a contingency. The research also corrected the pinned versions to axe-core 4.13.0, lighthouse 13.4.1 and chrome-launcher 1.2.1, and raised the Node engine to 22.19; the main session checked the versions with `npm view`. Sources: WCAG 2.2 Understanding 2.5.8, ARIA in HTML, WAI-ARIA 1.2, the MDN role pages, the axe-core source at v4.10.3, the Lighthouse repository and the npm registry. Spec sections 5.1.1, 5.2.1, 5.2.3, 5.3.1 and 10.4 were edited to match.

1. **WCAG 2.2 AA in the axe tag set?** Adding `wcag22aa` predicts a `target-size` violation on the 14 px gutter buttons (conflict 1). Options: (a) keep the plan's 2.0/2.1 A+AA set, record 2.5.8 as deferred in the M3 block with the note that the gutter toggles the same selection the 32 px Lines rows and checkboxes toggle (2.5.8's "Equivalent" exception, which axe cannot see); (b) add `wcag22aa` and, if it fires, amend ADR 0009 to `--canvas-row-height: 20px` (24 px pitch, the spacing exception axe does check), which changes the whole-genome density; (c) add `wcag22aa` and disable `target-size` on the genotype screen, which is an exception in disguise. Recommended: (a); 2.2 conformance deserves its own decision on gutter geometry rather than a side effect of a tag list.
2. **Canvas role: `img` or `application`?** The main canvas is keyboard-operated (arrows, +/-, 0, Escape); under `role="img"` a screen reader in browse mode may intercept those keys; `application` hands them through but is heavy and unverifiable here. Recommended: `role="img"` as the plan says, with the existing label naming the keys; record "screen readers not verified".
3. **Cancel focus (5.2.2b) touches phase-4 UI.** Recommended: yes, in phase 5, after phase 4 commits; it is a markup-only focus fix with a test.
4. **`emulateMedia` in `vite.config.ts` beside `bringToFront`, not a new `tests/support/commands.ts`?** Recommended: yes; the code chose the inline pattern in phase 1.
5. **Rail markup: `<nav>` wrapping `<div role="toolbar">`?** Recommended: yes; ARIA in HTML conformance and a Lighthouse audit, no visual change, `tests/rail.test.tsx` unchanged.
6. **Merge the two `### Changed` headings in `CHANGELOG.md` in this commit?** Recommended: yes, docs-only, one line moved.
7. **If axe flags `color-contrast` on the rail's `aria-disabled` blocked steps** (`--color-text-disabled` = `--neutral-8`, 3.47:1 on `--neutral-2`; axe treats `aria-disabled` as inactive, verified in axe source): verified in axe source that it will not fire; if it ever does, the recommended answer is `--color-text-disabled: var(--neutral-10)` (6.0:1; `tests/tokens.test.ts` pins nothing on that alias) recorded as an ADR 0009 amendment, not an exception.
