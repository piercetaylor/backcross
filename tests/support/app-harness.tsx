/**
 * Mounting and driving the real application in a browser-mode test.
 *
 * Responsibility: render <App/> with the three stylesheets src/main.tsx
 * imports, so layout and tokens are the ones a user sees; load files through
 * the Upload screen's real inputs (files, or a BrAPI server); and navigate by the rail's keyboard. Every
 * helper goes through the page the way a user would -- nothing reaches into
 * App's state -- so what a browser test asserts is what a user gets.
 *
 * Two loaders. `loadFiles` uploads through `userEvent.upload`, which is
 * Playwright's setInputFiles, and clicks Load: the real interaction, for
 * inputs of a megabyte or so. `loadFilesInPage` is the bench variant: it
 * assigns `input.files` from a DataTransfer and dispatches `change` inside
 * the page, so a multi-megabyte blob never round-trips through the test RPC
 * to Playwright, and it returns the performance.now() of its own click on
 * Load so the bench can time from there.
 *
 * `pressExpectingFocus` and `expectFocus` are for tests that depend on real
 * focus. In Firefox every test file's page shares one browser and one active
 * window, and a page acting elsewhere takes it: the focused element blurs (a
 * focusout with a null relatedTarget), and React Aria's collections stop
 * moving DOM focus until the window has focus again. The helpers bring the
 * page back to the front and, where a blur undid a key, press it again.
 * goTo does not need them: the rail moves focus itself.
 *
 * `loadBrapi` switches the Source to BrAPI server, fills Base URL and
 * Variant set id, uploads samples.csv (and markers.csv) and clicks Load.
 *
 * Interface: AppFiles, mountApp(), fixtureFiles(), loadFiles(files),
 * loadBrapi(files, source),
 * loadFilesInPage(files), goTo(step), pressExpectingFocus(keys, read,
 * expected), expectFocus(read, expected), focusStats, focusReport(),
 * waitFor(predicate, timeoutMs?), nextFrame(), bringToFront and
 * emulateMedia (Playwright commands declared in vite.config.ts).
 */
import { StrictMode } from 'react';
import { commands, page, userEvent } from 'vitest/browser';
import { expect } from 'vitest';
import { render } from 'vitest-browser-react';

import '../../src/ui/tokens.css';
import '../../src/ui/fonts.css';
import '../../src/ui/base.css';
import { App } from '../../src/App.tsx';
import markersCsv from '../fixtures/synthetic/markers.csv?raw';
import samplesCsv from '../fixtures/synthetic/samples.csv?raw';
import genotypesVcf from '../fixtures/synthetic/genotypes.vcf?raw';

export interface AppFiles {
  genotypes: File;
  samples: File;
  markers?: File;
}

/** The rail steps, by their accessible names (src/ui/shell/Rail.tsx). */
export type Step =
  | '1. Upload'
  | '2. Summary and QC'
  | '3. Lines'
  | '4. Graphical genotypes'
  | '5. Compare'
  | '6. Export';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Defined in vite.config.ts: Playwright's page.bringToFront(). */
    bringToFront: () => Promise<void>;
    /** Defined in vite.config.ts: Playwright's page.emulateMedia({ media }). */
    emulateMedia: (media: 'print' | 'screen' | null) => Promise<void>;
  }
}

const GENOTYPE_LABEL = /^Genotype file/;
const SAMPLES_LABEL = /^samples\.csv/;
const MARKERS_LABEL = /^markers\.csv/;

/** Renders the application as src/main.tsx does. */
export async function mountApp() {
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/** The committed synthetic fixture: VCF, samples.csv and markers.csv. */
export function fixtureFiles(): AppFiles {
  return {
    genotypes: new File([genotypesVcf], 'genotypes.vcf', { type: 'text/plain' }),
    samples: new File([samplesCsv], 'samples.csv', { type: 'text/csv' }),
    markers: new File([markersCsv], 'markers.csv', { type: 'text/csv' }),
  };
}

/**
 * Uploads through the three real inputs, clicks Load, and waits for the
 * Summary screen, which App shows only once load, rpp, qc and segments have
 * all returned.
 */
export async function loadFiles(files: AppFiles): Promise<void> {
  // In-page precondition: the Upload screen is mounted and its input enabled
  // (it is disabled while `busy`) before Playwright's action timeout starts.
  await expect.element(page.getByLabelText(GENOTYPE_LABEL)).toBeEnabled();
  await userEvent.upload(page.getByLabelText(GENOTYPE_LABEL), files.genotypes);
  await userEvent.upload(page.getByLabelText(SAMPLES_LABEL), files.samples);
  if (files.markers !== undefined) {
    await userEvent.upload(page.getByLabelText(MARKERS_LABEL), files.markers);
  }
  await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));
  await expect
    .element(page.getByRole('heading', { name: 'Dataset summary and QC' }))
    .toBeInTheDocument();
}

/**
 * Loads a BrAPI variant set through the Upload screen: the Source radio, the
 * two text fields, the samples.csv and markers.csv inputs, then Load; waits
 * for the Summary screen as loadFiles does.
 */
export async function loadBrapi(
  files: { samples: File; markers?: File },
  source: { baseUrl: string; variantSetDbId: string },
): Promise<void> {
  await expect.element(page.getByLabelText(SAMPLES_LABEL)).toBeEnabled();
  // React Aria hides the native radio; the visible target is its label.
  await userEvent.click(page.getByText('BrAPI server', { exact: true }));
  await userEvent.fill(page.getByLabelText('Base URL'), source.baseUrl);
  await userEvent.fill(page.getByLabelText('Variant set id'), source.variantSetDbId);
  await userEvent.upload(page.getByLabelText(SAMPLES_LABEL), files.samples);
  if (files.markers !== undefined) {
    await userEvent.upload(page.getByLabelText(MARKERS_LABEL), files.markers);
  }
  await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));
  await expect
    .element(page.getByRole('heading', { name: 'Dataset summary and QC' }))
    .toBeInTheDocument();
}

function fileInput(label: RegExp): HTMLInputElement {
  for (const el of document.querySelectorAll('label')) {
    if (label.test((el.textContent ?? '').trim())) {
      const input = el.querySelector('input[type="file"]');
      if (input instanceof HTMLInputElement) return input;
    }
  }
  throw new Error(`no file input labelled ${String(label)}`);
}

function assignFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * The bench loader: assigns the files inside the page, clicks Load, and
 * returns performance.now() at the click. It does not wait for the load.
 */
export async function loadFilesInPage(files: AppFiles): Promise<number> {
  assignFile(fileInput(GENOTYPE_LABEL), files.genotypes);
  assignFile(fileInput(SAMPLES_LABEL), files.samples);
  if (files.markers !== undefined) assignFile(fileInput(MARKERS_LABEL), files.markers);
  const load = await waitFor(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Load' && !b.disabled,
    );
    return button ?? null;
  });
  const clickedAt = performance.now();
  load.click();
  return clickedAt;
}

const STEPS: Step[] = [
  '1. Upload',
  '2. Summary and QC',
  '3. Lines',
  '4. Graphical genotypes',
  '5. Compare',
  '6. Export',
];

function currentStep(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.rail-item[aria-current="page"]');
  if (el === null) throw new Error('the rail has no current step');
  return el;
}

function stepName(el: HTMLElement): string {
  return el.getAttribute('aria-label') ?? (el.textContent ?? '').trim();
}

/**
 * Moves to a rail step through the rail's own keyboard contract: focus the
 * current step, then ArrowDown or ArrowUp, which move focus and activate
 * the step it lands on (src/ui/shell/Rail.tsx). Keyboard rather than a
 * pointer because, in a headed browser on this machine, Playwright's clicks
 * on the collapsed rail's 32 px steps did not reach the page at all, while
 * the same clicks headless did; a key press has no coordinates to lose.
 */
export async function goTo(step: Step): Promise<void> {
  const target = STEPS.indexOf(step);
  for (let guard = 0; guard < STEPS.length; guard++) {
    const current = currentStep();
    const here = STEPS.indexOf(stepName(current) as Step);
    if (here === target) return;
    current.focus();
    await userEvent.keyboard(here < target ? '{ArrowDown}' : '{ArrowUp}');
  }
  if (stepName(currentStep()) !== step) throw new Error(`could not reach ${step}`);
}

/** Brings the page and the test iframe's window to the front of the browser. */
async function reclaimWindowFocus(): Promise<void> {
  // document.hasFocus() here is true only for the focused frame, so the page
  // comes to the front first and then the test iframe's window within it.
  await commands.bringToFront();
  window.focus();
}

/** Takes window focus back, retrying until it holds, for up to 30 s. */
async function ensureWindowFocus(): Promise<void> {
  const deadline = performance.now() + 30_000;
  while (!document.hasFocus()) {
    if (performance.now() > deadline) throw new Error('could not give the page window focus');
    await reclaimWindowFocus();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Counts reported by the keyboard test: see expectFocus and pressExpectingFocus. */
export const focusStats = { reclaims: 0, keyRetries: 0 };

// The last focus-related events, dumped when a keyboard test fails.
const focusTrace: string[] = [];
let blurredSinceKey = false;
function traceFocus(event: Event): void {
  if (event.type === 'blur') blurredSinceKey = true;
  const target =
    event.target instanceof Element
      ? (event.target.getAttribute('role') ?? event.target.tagName)
      : 'window';
  const detail = event instanceof KeyboardEvent ? ` ${event.key}` : '';
  focusTrace.push(
    `${Math.round(performance.now())} ${event.type}${detail} ${target} hasFocus=${document.hasFocus()}`,
  );
  if (focusTrace.length > 40) focusTrace.shift();
}
for (const type of ['keydown', 'focusin', 'focusout']) {
  document.addEventListener(type, traceFocus, true);
}
window.addEventListener('blur', traceFocus);
window.addEventListener('focus', traceFocus);

/** The recent focus events and counts, for a failed keyboard test's output. */
export function focusReport(): string {
  return `reclaims=${focusStats.reclaims} keyRetries=${focusStats.keyRetries} | ${focusTrace.join(' | ')}`;
}

/**
 * Polls `read` until it returns `expected`, taking window focus back on any
 * poll that finds it gone. For a check whose focus move has already
 * happened, such as after a click: a blur then only hides it until the
 * window is focused again.
 */
export async function expectFocus<T>(read: () => T, expected: T): Promise<void> {
  await expect
    .poll(async () => {
      if (!document.hasFocus()) {
        focusStats.reclaims++;
        await reclaimWindowFocus();
      }
      return read();
    })
    .toBe(expected);
}

/**
 * Presses `keys` (or Tab) in a focused window and waits until `read` returns
 * `expected`. When the window was blurred between the key and its effect,
 * the key is pressed again, up to four times.
 *
 * Why a repeat is sound, and only then: React Aria records a key's move in
 * a ref but moves DOM focus only while the collection is focused. When the
 * window regains focus, the browser refocuses the element that had it, whose
 * onFocus resets the focused key to itself (react-aria useSelectableItem), so
 * the recorded move is undone and the grid is back in its state from before
 * the key. With no blur observed, a missed effect is a real failure and is
 * reported by the same 30 s poll as any other assertion.
 */
export async function pressExpectingFocus<T>(
  keys: string,
  read: () => T,
  expected: T,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    await ensureWindowFocus();
    blurredSinceKey = false;
    if (keys === 'Tab') await userEvent.tab();
    else await userEvent.keyboard(keys);
    const deadline = performance.now() + 5_000;
    while (!Object.is(read(), expected) && performance.now() < deadline && !blurredSinceKey) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (Object.is(read(), expected)) return;
    if (!blurredSinceKey || attempt >= 4) break;
    focusStats.keyRetries++;
  }
  await expectFocus(read, expected);
}

/** Resolves on the next animation frame. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Polls `predicate` every few milliseconds until it returns a value other
 * than null, false or undefined, and resolves with that value. Used where a
 * test needs the moment a condition became true, which expect.poll does not
 * report.
 */
export async function waitFor<T>(
  predicate: () => T | null | undefined | false,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value !== null && value !== undefined && value !== false) return value;
    if (performance.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
