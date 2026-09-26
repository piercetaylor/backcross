/**
 * The demo dataset end to end (docs/adr/0017): the Upload screen's "Try the
 * demo dataset" button, and a page opened at `?demo=synthetic`, each reach
 * Summary through the worker's 'loadDemo' fetch of the files the dev server
 * serves under demo/synthetic/ (vite.config.ts), with the fixture's six lines
 * and 500 markers; the button loads under the crop chosen in the Crop select,
 * `?demo=synthetic&crop=<id>` loads under that crop and leaves the select on
 * it, and "Copy link to this demo" writes the chosen crop into the link. An
 * unknown `?demo=` or `&crop=` value shows the app alert and leaves the
 * Upload screen usable.
 *
 * The query string is set on the tester page with history.replaceState before
 * the app mounts, keeping the page's own parameters, and restored after.
 */
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { goTo, mountApp } from '../support/app-harness.tsx';

const originalHref = location.href;

afterEach(() => {
  history.replaceState(history.state, '', originalHref);
  vi.restoreAllMocks();
});

function setDemoParam(value: string, crop?: string): void {
  const url = new URL(location.href);
  url.searchParams.set('demo', value);
  if (crop !== undefined) url.searchParams.set('crop', crop);
  history.replaceState(history.state, '', url.href);
}

// The fixture's Gm names read the same under every crop, so the region field
// tells the schemes apart: soybean reads chr13 as Gm13, any other crop keeps
// chr13 as written, and the view never reaches Gm13.
async function applyRegion(text: string): Promise<void> {
  await userEvent.fill(page.getByLabelText('Region'), text);
  await userEvent.click(page.getByRole('button', { name: 'Apply' }));
}

function viewValue(): string {
  return (page.getByRole('combobox', { name: 'View' }).element() as HTMLSelectElement).value;
}

async function expectLoadedUnderSoybean(): Promise<void> {
  await goTo('4. Graphical genotypes');
  await applyRegion('chr13:1-3Mb');
  await expect.poll(viewValue).toBe('Gm13');
}

async function expectLoadedUnderOtherCrop(): Promise<void> {
  await goTo('4. Graphical genotypes');
  await applyRegion('Gm12:1-3Mb');
  await expect.poll(viewValue).toBe('Gm12');
  await applyRegion('chr13:1-3Mb');
  await expect.poll(viewValue).not.toBe('Gm12');
  expect(viewValue()).not.toBe('Gm13');
}

async function choosePea(): Promise<void> {
  await userEvent.click(page.getByRole('button', { name: /Crop$/ }));
  await userEvent.click(page.getByRole('option', { name: 'Pea' }));
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
    await mountApp();
    await userEvent.click(page.getByRole('button', { name: 'Try the demo dataset' }));
    await expectFixtureLoaded();
    await expectLoadedUnderSoybean();

    await goTo('1. Upload');
    await choosePea();
    await userEvent.click(page.getByRole('button', { name: 'Try the demo dataset' }));
    await expectFixtureLoaded();
    await expectLoadedUnderOtherCrop();
  });

  it('"Copy link to this demo" writes the chosen crop into the link', async () => {
    const written: string[] = [];
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation((text: string) => {
      written.push(text);
      return Promise.resolve();
    });
    await mountApp();
    await userEvent.click(page.getByRole('button', { name: 'Copy link to this demo' }));
    await choosePea();
    await userEvent.click(page.getByRole('button', { name: 'Copy link to this demo' }));
    await expect.poll(() => written.length).toBe(2);
    const [plain, pea] = written.map((href) => new URL(href).searchParams);
    expect(plain?.get('demo')).toBe('synthetic');
    expect(plain?.has('crop')).toBe(false);
    expect(pea?.get('demo')).toBe('synthetic');
    expect(pea?.get('crop')).toBe('pea');
  });

  it('?demo=synthetic&crop=pea loads under pea and leaves the select on Pea', async () => {
    setDemoParam('synthetic', 'pea');
    await mountApp();
    await expectFixtureLoaded();
    await expectLoadedUnderOtherCrop();
    await goTo('1. Upload');
    await expect.element(page.getByRole('button', { name: /Pea\s*Crop$/ })).toBeInTheDocument();
  });

  it('an unknown &crop= value shows the alert and loads nothing', async () => {
    setDemoParam('synthetic', 'sunflower');
    await mountApp();
    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent ?? '')
      .toMatch(/^Unknown crop "sunflower" in the page address\. Available: soybean, /);
    await expect
      .element(page.getByRole('heading', { name: 'Upload and validate' }))
      .toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Try the demo dataset' })).toBeEnabled();
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
