/**
 * Every colour or weight cue in the interface carries a text or ARIA cue
 * beside it: the QC-flagged row, the rail's current/done steps, a selected
 * Lines row, the legend's textures, and a region error's border.
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

import { CALL_CLASS_LABEL, CallClass } from '../../src/core/types.ts';
import { fixtureFiles, goTo, loadFiles, mountApp } from '../support/app-harness.tsx';

describe('non-colour cues', () => {
  it('Summary: a shaded QC row says why in text', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());

    const flagged = [...document.querySelectorAll('table.data-table tbody tr.qc-flagged')];
    expect(flagged.length).toBeGreaterThan(0);
    for (const row of flagged) {
      const td = row.querySelector<HTMLElement>('td.flags')!;
      expect(td.textContent).not.toBe('');
      expect(td.textContent).toContain('closer_to_donor');
      expect(getComputedStyle(td).fontWeight).toBe('600');
    }
  });

  it('Rail: current and done steps carry an ARIA or text cue', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());

    const current = document.querySelectorAll('.rail-item[data-state="current"]');
    expect(current.length).toBe(1);
    expect(current[0]?.getAttribute('aria-current')).toBe('page');

    const done = document.querySelector('.rail-item[data-state="done"]')!;
    expect(getComputedStyle(done, '::after').content).toContain('✓');

    expect(document.querySelectorAll('.rail-item[data-state="blocked"]').length).toBe(0);
  });

  it('Lines: a selected row is aria-selected with a visible tick', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('3. Lines');
    await userEvent.click(page.getByRole('button', { name: 'Select all visible' }));
    await expect.poll(() => document.body.textContent ?? '').toMatch(/selected: 6/);

    const rows = [...document.querySelectorAll('tbody [role="row"]')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('aria-selected')).toBe('true');
      const tick = row.querySelector<HTMLElement>('.check-tick')!;
      expect(getComputedStyle(tick).visibility).toBe('visible');
    }
  });

  it('Legend: every class has a text label and the four textured classes carry a pattern', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('4. Graphical genotypes');

    const items = [...document.querySelectorAll('.legend li')];
    expect(items.length).toBe(6);

    const expectedLabels = [
      CallClass.RP_HOM,
      CallClass.DONOR_HOM,
      CallClass.HET,
      CallClass.MISSING,
      CallClass.UNINFORMATIVE,
      CallClass.NONPARENTAL,
    ].map((c) => CALL_CLASS_LABEL[c]);
    expect(items.map((li) => li.textContent.trim())).toEqual(expectedLabels);

    const textured = new Set([
      CALL_CLASS_LABEL[CallClass.DONOR_HOM],
      CALL_CLASS_LABEL[CallClass.HET],
      CALL_CLASS_LABEL[CallClass.MISSING],
      CALL_CLASS_LABEL[CallClass.NONPARENTAL],
    ]);

    for (const li of items) {
      const swatch = li.querySelector<HTMLElement>('.class-swatch')!;
      expect(swatch.getAttribute('aria-hidden')).toBe('true');
      const bg = getComputedStyle(swatch).backgroundImage;
      const label = li.textContent.trim();
      if (textured.has(label)) expect(bg).toContain('gradient');
      else expect(bg).toBe('none');
    }
  });

  it('Errors carry role=alert and text, not only the alert colour', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await goTo('4. Graphical genotypes');
    await userEvent.fill(page.getByLabelText('Region'), 'nonsense');
    await userEvent.keyboard('{Enter}');

    const el = document.querySelector<HTMLElement>('#genotype-region-error')!;
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).not.toBe('');
    expect(getComputedStyle(el).borderLeftWidth).not.toBe('0px');
  });
});
