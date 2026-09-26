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
import { describe, expect, it, vi } from 'vitest';

import { fixtureFiles, goTo, loadFiles, mountApp } from '../support/app-harness.tsx';
import { AnalysisClient } from '../../src/workers/client.ts';
import { DEFAULT_SEGMENT_PARAMS } from '../../src/core/segments.ts';

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

  it('normalises chromosome names under the Maize crop scheme chosen in the select', async () => {
    await mountApp();
    await userEvent.click(page.getByRole('button', { name: /Crop$/ }));
    await userEvent.click(page.getByRole('option', { name: 'Maize' }));
    const genotypes = new File(
      ['marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,1,1000,A,G,A\nr2,chr2,2000,C,T,C\n'],
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
    await goTo('4. Graphical genotypes');
    const options = await vi.waitUntil(() => {
      const select = page.getByRole('combobox', { name: 'View' }).element();
      const names = Array.from((select as HTMLSelectElement).options, (o) => o.textContent);
      return names.length > 1 ? names : null;
    });
    expect(options).toContain('chr1');
    expect(options).toContain('chr2');
    expect(options).not.toContain('Gm01');

    // The zoom field reads its locus under the same scheme, and its example
    // region is named in the loaded crop's own chromosome names.
    const region = page.getByLabelText('Region');
    expect(region.element().getAttribute('placeholder')).toBe('chr1:28.5-29.1Mb');
    await userEvent.fill(region, 'chr2:1-3Mb');
    await userEvent.click(page.getByRole('button', { name: 'Apply' }));
    const view = page.getByRole('combobox', { name: 'View' });
    await expect.poll(() => (view.element() as HTMLSelectElement).value).toBe('chr2');
    expect(document.querySelector('#genotype-region-error')).toBeNull();
  });

  it('reports a region on a chromosome the dataset lacks and leaves the view unchanged', async () => {
    await mountApp();
    await userEvent.click(page.getByRole('button', { name: /Crop$/ }));
    await userEvent.click(page.getByRole('option', { name: 'Maize' }));
    const genotypes = new File(
      ['marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,chr1,1000,A,G,A\nr2,chr2,2000,C,T,C\n'],
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
    await goTo('4. Graphical genotypes');
    const region = page.getByLabelText('Region');
    const view = page.getByRole('combobox', { name: 'View' });
    const viewValue = () => (view.element() as HTMLSelectElement).value;
    await userEvent.fill(region, 'chr2:1-3Mb');
    await userEvent.click(page.getByRole('button', { name: 'Apply' }));
    await expect.poll(viewValue).toBe('chr2');

    // chr7 is a maize name the scheme reads, but this dataset has no chr7:
    // the field says so and the view stays on chr2 rather than going to an
    // empty canvas.
    await userEvent.fill(region, 'chr7:1-3Mb');
    await userEvent.click(page.getByRole('button', { name: 'Apply' }));
    await expect
      .poll(() => document.querySelector('#genotype-region-error')?.textContent ?? '')
      .toBe('no chromosome "chr7" in this dataset (chr1, chr2)');
    expect(viewValue()).toBe('chr2');

    // A region the dataset has clears the error and moves the view.
    await userEvent.fill(region, 'chr1:1-2Mb');
    await userEvent.click(page.getByRole('button', { name: 'Apply' }));
    await expect.poll(viewValue).toBe('chr1');
    expect(document.querySelector('#genotype-region-error')).toBeNull();
  });
});

describe('the resident crop scheme in the worker (contract 1.5.0)', () => {
  // Maize, never soybean: soybean is the worker's default and cannot tell a
  // threaded scheme from the fallback.
  const GENOTYPES =
    'marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,1,1000000,A,G,G\nr2,chr2,2000000,C,T,T\n';
  const SAMPLES =
    'sample_id,line_name,role,generation,family_id,notes\n' +
    'RP,Recurrent,recurrent_parent,,,\nDONOR,Donor,donor_parent,,,\nL1,Line 1,candidate,,,\n';

  async function loadMaize(client: AnalysisClient) {
    const enc = new TextEncoder();
    return client.request('load', {
      genotypeFileName: 'genotypes.csv',
      genotypes: enc.encode(GENOTYPES).buffer,
      samples: enc.encode(SAMPLES).buffer,
      crop: 'maize',
    });
  }

  it("answers a targets request through the loaded dataset's scheme", async () => {
    const worker = new Worker(new URL('../../src/workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
    const client = new AnalysisClient(worker);
    try {
      const loaded = await loadMaize(client);
      expect(loaded.type === 'loaded' && loaded.crop).toBe('maize');
      expect(loaded.type === 'loaded' && loaded.chromosomeOrder).toEqual(['chr1', 'chr2']);
      const targets = await client.request('targets', {
        specs: ['t1=chr2:1-3Mb'],
        params: DEFAULT_SEGMENT_PARAMS,
      });
      expect(targets.type === 'targets' && targets.regions[0]?.chrom).toBe('chr2');
      expect(targets.type === 'targets' && targets.checks[0]?.status).not.toBe('no_data');
    } finally {
      client.terminate();
    }
  });
});
