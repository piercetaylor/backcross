/**
 * The demo dataset end to end (docs/adr/0017): the Upload screen's "Try the
 * demo dataset" button, and a page opened at `?demo=synthetic`, each reach
 * Summary through the worker's 'loadDemo' fetch of the files the dev server
 * serves under demo/synthetic/ (vite.config.ts), with the fixture's six lines
 * and 500 markers. An unknown `?demo=` value shows the app alert and leaves
 * the Upload screen usable.
 *
 * The query string is set on the tester page with history.replaceState before
 * the app mounts, keeping the page's own parameters, and restored after.
 */
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';

import { goTo, mountApp } from '../support/app-harness.tsx';

const originalHref = location.href;

afterEach(() => {
  history.replaceState(history.state, '', originalHref);
});

function setDemoParam(value: string): void {
  const url = new URL(location.href);
  url.searchParams.set('demo', value);
  history.replaceState(history.state, '', url.href);
}

async function expectFixtureLoaded(): Promise<void> {
  await expect
    .element(page.getByRole('heading', { name: 'Dataset summary and QC' }))
    .toBeInTheDocument();
  await expect.element(page.getByText('500 markers', { exact: true })).toBeInTheDocument();
  await goTo('3. Lines');
  await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();
  expect(document.querySelector('[role="alert"]')).toBeNull();
}

describe('demo dataset', () => {
  it('the demo button loads the synthetic fixture and reaches Summary', async () => {
    await mountApp();
    await expect.element(page.getByText(/The demo data are synthetic/)).toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Try the demo dataset' }));
    await expectFixtureLoaded();
  });

  it('?demo=synthetic loads the demo on arrival and reaches Summary', async () => {
    setDemoParam('synthetic');
    await mountApp();
    await expectFixtureLoaded();
  });

  it('an unknown ?demo= value shows the alert and stays on Upload', async () => {
    setDemoParam('real');
    await mountApp();
    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent ?? '')
      .toBe('Unknown demo dataset "real" in the page address. Available: synthetic.');
    await expect
      .element(page.getByRole('heading', { name: 'Upload and validate' }))
      .toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Try the demo dataset' })).toBeEnabled();
  });
});
