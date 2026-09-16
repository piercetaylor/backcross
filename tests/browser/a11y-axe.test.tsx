/**
 * axe-core, WCAG 2.0/2.1 A and AA, over every screen and state a user can
 * reach without assistive technology: the Upload screen empty and revisited,
 * the BrAPI form empty, a load in flight with its Cancel button, the
 * cancelled and 404 alerts, Summary and QC, Lines in three states, the
 * genotype view (whole genome, one chromosome with its overview, a region
 * error, the sort popover open), Compare's form and result, and Export.
 * tests/support/axe.ts runs axe and formats any violation; a failure here
 * routes through stop rules S1-S3 (docs/m3-phase5-a11y.md).
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

import { fixtureFiles, goTo, loadFiles, mountApp, waitFor } from '../support/app-harness.tsx';
import { AXE_TAGS, KNOWN_A11Y_EXCEPTIONS, expectNoAxeViolations } from '../support/axe.ts';

const MOCK_BASE = `${location.origin}/__brapi__`;

describe('accessibility: axe', () => {
  it('the exceptions list is empty and the tag set is WCAG A and AA through 2.2', () => {
    expect(KNOWN_A11Y_EXCEPTIONS).toEqual([]);
    expect([...AXE_TAGS]).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  });

  it('Upload, empty', async () => {
    await mountApp();
    await expectNoAxeViolations('upload empty');
  });

  it('Upload, BrAPI source: empty form, load in flight with Cancel, cancelled alert, 404 alert', async () => {
    await mountApp();
    await userEvent.click(page.getByText('BrAPI server', { exact: true }));
    await expect.element(page.getByLabelText('Base URL')).toBeInTheDocument();
    await expectNoAxeViolations('brapi form empty');

    const { samples } = fixtureFiles();
    await userEvent.fill(page.getByLabelText('Base URL'), MOCK_BASE);
    await userEvent.fill(page.getByLabelText('Variant set id'), 'hangset');
    await userEvent.upload(page.getByLabelText(/^samples\.csv/), samples);
    await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));
    await expect
      .element(page.getByRole('button', { name: 'Cancel', exact: true }))
      .toBeInTheDocument();
    await expectNoAxeViolations('brapi load in flight');

    await userEvent.click(page.getByRole('button', { name: 'Cancel', exact: true }));
    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent ?? '')
      .toMatch(/BrAPI: load cancelled/);
    await expectNoAxeViolations('brapi cancelled alert');

    await userEvent.fill(page.getByLabelText('Variant set id'), 'nosuchset');
    await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));
    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent ?? '')
      .toMatch(/returned HTTP 404/);
    await expectNoAxeViolations('brapi 404 alert');
  });

  it('Upload, revisited after a load', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('1. Upload');
    await expect.element(page.getByText('500 markers', { exact: false })).toBeInTheDocument();
    await expectNoAxeViolations('upload loaded');
  });

  it('Summary and QC', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await expectNoAxeViolations('summary');
  });

  it('Lines: default, all selected, empty filter state', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();
    await expectNoAxeViolations('lines');

    await userEvent.click(page.getByRole('button', { name: 'Select all visible' }));
    await expect.poll(() => document.body.textContent ?? '').toMatch(/selected: 6/);
    await expectNoAxeViolations('lines all selected');

    await userEvent.fill(page.getByLabelText('Filter'), 'zzz');
    await expect.element(page.getByText('No lines match the filter.')).toBeInTheDocument();
    await expectNoAxeViolations('lines empty state');
  });

  it('Graphical genotypes: whole genome, one chromosome with overview, region error, sort popover open', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('4. Graphical genotypes');
    await waitFor(() => document.querySelectorAll('.geno-strip-track').length > 0);
    await expectNoAxeViolations('genotypes whole genome');

    // The View <select>'s wrapping <label> textContent includes every
    // <option>'s text (all 20 chromosomes), so an exact match on "View"
    // alone never resolves; exact: false does a substring match instead.
    await userEvent.selectOptions(page.getByLabelText('View', { exact: false }), 'Gm13');
    await waitFor(() => document.querySelector('canvas.geno-overview'));
    await expectNoAxeViolations('genotypes chromosome');

    await userEvent.fill(page.getByLabelText('Region'), 'nonsense');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => document.querySelector('#genotype-region-error'));
    await expectNoAxeViolations('genotypes region error');

    const trigger = document.querySelector<HTMLElement>('.line-select-button');
    if (trigger === null) throw new Error('no .line-select-button');
    await userEvent.click(page.elementLocator(trigger));
    await waitFor(() => document.querySelector('[role="listbox"]'));
    await expectNoAxeViolations('genotypes sort popover open');
    await userEvent.keyboard('{Escape}');
  });

  it('Compare: form and result', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('5. Compare');
    await expectNoAxeViolations('compare form');

    await userEvent.click(page.getByRole('button', { name: 'Compare', exact: true }));
    await expect.element(page.getByRole('heading', { name: /^Result:/ })).toBeInTheDocument();
    await expectNoAxeViolations('compare result');
  });

  it('Export', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('6. Export');
    await expect
      .element(page.getByRole('button', { name: 'Download per-line summary CSV' }))
      .toBeEnabled();
    await expectNoAxeViolations('export');
  });
});
