/**
 * Mounting and driving the real application in a browser-mode test.
 *
 * Responsibility: render <App/> with the three stylesheets src/main.tsx
 * imports, so layout and tokens are the ones a user sees; load files through
 * the Upload screen's three real inputs; and navigate by the rail's keyboard. Every
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
 * Interface: AppFiles, mountApp(), fixtureFiles(), loadFiles(files),
 * loadFilesInPage(files), goTo(step), waitFor(predicate, timeoutMs?),
 * nextFrame().
 */
import { StrictMode } from 'react';
import { page, userEvent } from 'vitest/browser';
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
