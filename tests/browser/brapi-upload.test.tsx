/**
 * The Upload screen's BrAPI source (docs/m3-phase4-brapi.md section 9.4):
 * the Source switch, an end-to-end load through the worker's real fetch
 * against the mock server (tests/support/brapi-mock-plugin.ts, same origin,
 * serving tests/fixtures/brapi), and a failure reported in the alert. The
 * worker itself rejects a loadBrapi payload carrying a token profile (contract 1.4.0).
 */
import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

import { AnalysisClient } from '../../src/workers/client.ts';
import { fixtureFiles, goTo, loadBrapi, mountApp } from '../support/app-harness.tsx';

const MOCK_BASE = `${location.origin}/__brapi__`;

describe('BrAPI upload', () => {
  it('switches the inputs with the Source radio', async () => {
    await mountApp();
    await expect.element(page.getByLabelText(/^Genotype file/)).toBeInTheDocument();
    await userEvent.click(page.getByText('BrAPI server', { exact: true }));

    await expect.element(page.getByLabelText(/^Genotype file/)).not.toBeInTheDocument();
    await expect.element(page.getByLabelText('Base URL')).toBeInTheDocument();
    await expect.element(page.getByLabelText('Variant set id')).toBeInTheDocument();
    const tokenInput = page.getByLabelText('Access token (optional)');
    await expect.element(tokenInput).toBeInTheDocument();
    await expect.element(tokenInput).toHaveAttribute('type', 'password');

    const download = page.getByRole('button', { name: 'Download call-set table' });
    await expect.element(download).toBeDisabled();
    await userEvent.fill(page.getByLabelText('Base URL'), MOCK_BASE);
    await expect.element(download).toBeDisabled();
    await userEvent.fill(page.getByLabelText('Variant set id'), 'variantset1');
    await expect.element(download).toBeEnabled();

    await userEvent.click(page.getByText('Files', { exact: true }));
    await expect.element(page.getByLabelText(/^Genotype file/)).toBeInTheDocument();
  });

  it('loads a variant set through the worker from the mock server', async () => {
    await mountApp();
    const { samples, markers } = fixtureFiles();
    await loadBrapi(
      { samples, ...(markers === undefined ? {} : { markers }) },
      { baseUrl: MOCK_BASE, variantSetDbId: 'variantset1' },
    );
    await expect.element(page.getByText('29 markers', { exact: false })).toBeInTheDocument();
    await goTo('3. Lines');
    await expect.element(page.getByText(/^Lines: 6,/)).toBeInTheDocument();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels a BrAPI load in flight through the worker with the Cancel button', async () => {
    await mountApp();
    const { samples } = fixtureFiles();
    await userEvent.click(page.getByText('BrAPI server', { exact: true }));
    await userEvent.fill(page.getByLabelText('Base URL'), MOCK_BASE);
    // The mock server holds every request for this id open (brapi-mock-plugin.ts).
    await userEvent.fill(page.getByLabelText('Variant set id'), 'hangset');
    await userEvent.upload(page.getByLabelText(/^samples\.csv/), samples);
    await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));

    const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    await expect.element(cancel).toBeInTheDocument();
    await userEvent.click(cancel);

    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent ?? '')
      .toMatch(/BrAPI: load cancelled/);
    await expect.element(cancel).not.toBeInTheDocument();
    await expect
      .element(page.getByRole('heading', { name: 'Upload and validate' }))
      .toBeInTheDocument();
  });

  it('reports a BrAPI failure in the alert without leaving the Upload screen', async () => {
    await mountApp();
    const { samples } = fixtureFiles();
    await userEvent.click(page.getByText('BrAPI server', { exact: true }));
    await userEvent.fill(page.getByLabelText('Base URL'), MOCK_BASE);
    await userEvent.fill(page.getByLabelText('Variant set id'), 'nosuchset');
    await userEvent.upload(page.getByLabelText(/^samples\.csv/), samples);
    await userEvent.click(page.getByRole('button', { name: 'Load', exact: true }));

    const alert = page.getByRole('alert');
    await expect.poll(() => alert.element().textContent).toMatch(/BrAPI: GET .* returned HTTP 404/);
    await expect
      .element(page.getByRole('heading', { name: 'Upload and validate' }))
      .toBeInTheDocument();
  });

  it('rejects a loadBrapi payload carrying a token profile in the worker', async () => {
    const worker = new Worker(new URL('../../src/workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
    const client = new AnalysisClient(worker);
    try {
      const samples = new TextEncoder().encode(
        'sample_id,role\nRP,recurrent_parent\nDONOR,donor_parent\nL1,candidate\n',
      ).buffer;
      await expect(
        client.request('loadBrapi', {
          source: { baseUrl: MOCK_BASE, variantSetDbId: 'vs1' },
          samples,
          profile: 'dart',
        }),
      ).rejects.toThrow(
        'token profile "dart" applies to HapMap and wide CSV; a BrAPI source carries allele indices',
      );
    } finally {
      client.terminate();
    }
  });
});
