/**
 * The fixture loads through the real file inputs and the worker, end to end.
 *
 * Every node test calls src/io and src/core directly; this is the one that
 * goes through the Upload screen, the genotype File handed to the worker
 * and streamed there (docs/adr/0012), the worker's
 * load-rpp-qc-segments chain and App's navigation. The QC expectations are
 * the ones tests/qc.test.ts asserts from the same fixture in Node, read here
 * off the rendered Summary table. A wide CSV with a SoyBase `H` loads under
 * the SoyBase token profile chosen in the Upload screen's select (contract 1.4.0).
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

import { fixtureFiles, goTo, loadFiles, mountApp } from '../support/app-harness.tsx';

/** The flags cell of a sample's row in the Summary screen's per-line QC table. */
function qcFlags(sampleId: string): string[] {
  for (const row of document.querySelectorAll('table.data-table tbody tr')) {
    const cells = row.querySelectorAll('td');
    if (cells[0]?.textContent === sampleId) {
      const flags = row.querySelector('td.flags')?.textContent ?? '';
      return flags.split(' ').filter((f) => f !== '');
    }
  }
  throw new Error(`no QC row for ${sampleId}`);
}

describe('load path', () => {
  it('loads the fixture through the real inputs and reports six lines', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());
    await expect.element(page.getByText('500 markers', { exact: true })).toBeInTheDocument();
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('flags NIL_03, NIL_05 and NIL_06 in the QC table as tests/qc.test.ts expects', async () => {
    await mountApp();
    await loadFiles(fixtureFiles());

    const nil03 = qcFlags('NIL_03');
    expect(nil03).toContain('nonparental_alleles');
    expect(nil03).not.toContain('closer_to_donor');

    expect(qcFlags('NIL_05')).toContain('closer_to_donor');

    const nil06 = qcFlags('NIL_06');
    expect(nil06).toContain('high_missing');
    expect(nil06).not.toContain('high_het');

    expect(qcFlags('NIL_01')).toEqual([]);
  });

  it('loads a wide CSV with an H cell under the SoyBase token profile', async () => {
    await mountApp();
    await userEvent.click(page.getByRole('button', { name: /Token profile/ }));
    await userEvent.click(page.getByRole('option', { name: 'SoyBase SNP allele report' }));
    const genotypes = new File(
      ['marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,Gm02,1000,A,G,H\nr2,Gm02,2000,C,T,C\n'],
      'genotypes.csv',
      { type: 'text/csv' },
    );
    const samples = new File(
      [
        'sample_id,line_name,role,generation,family_id,notes\n' +
          'RP,Recurrent,recurrent_parent,,,\nDONOR,Donor,donor_parent,,,\nL1,Line 1,candidate,,,\n',
      ],
      'samples.csv',
      { type: 'text/csv' },
    );
    await loadFiles({ genotypes, samples });
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 1,/)).toBeInTheDocument();
  });
});
