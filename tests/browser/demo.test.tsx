/**
 * The demo dataset end to end (docs/adr/0017): the Upload screen's "Try the
 * demo dataset" button, and a page opened at `?demo=synthetic`, each reach
 * Summary through the worker's 'loadDemo' fetch of the files the dev server
 * serves under demo/synthetic/ (vite.config.ts), with the fixture's six lines
 * and 500 markers; the button loads under the crop chosen in the Crop select.
 * An unknown `?demo=` value shows the app alert and leaves
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

  it('the demo button loads under the crop chosen in the select', async () => {
    // The fixture's Gm names read the same under every crop, so the region
    // field tells the schemes apart: soybean reads chr13 as Gm13, pea keeps
    // chr13 as written, and the view never reaches Gm13.
    async function applyRegion(text: string): Promise<void> {
      await userEvent.fill(page.getByLabelText('Region'), text);
      await userEvent.click(page.getByRole('button', { name: 'Apply' }));
    }
    const view = () =>
      (page.getByRole('combobox', { name: 'View' }).element() as HTMLSelectElement).value;

    await mountApp();
    await userEvent.click(page.getByRole('button', { name: 'Try the demo dataset' }));
    await expectFixtureLoaded();
    await goTo('4. Graphical genotypes');
    await applyRegion('chr13:1-3Mb');
    await expect.poll(view).toBe('Gm13');

    await goTo('1. Upload');
    await userEvent.click(page.getByRole('button', { name: /Crop$/ }));
    await userEvent.click(page.getByRole('option', { name: 'Pea' }));
    await userEvent.click(page.getByRole('button', { name: 'Try the demo dataset' }));
    await expectFixtureLoaded();
    await goTo('4. Graphical genotypes');
    await applyRegion('Gm12:1-3Mb');
    await expect.poll(view).toBe('Gm12');
    await applyRegion('chr13:1-3Mb');
    await expect.poll(view).not.toBe('Gm12');
    expect(view()).not.toBe('Gm13');
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
