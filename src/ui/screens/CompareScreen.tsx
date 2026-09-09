/**
 * Screen 5: pairwise comparison.
 *
 * Responsibility: pick two samples and a comparison mode ('informative':
 * parent-of-origin classes at markers informative for this recurrent/donor
 * pair, or 'all': raw genotypes at every marker, which additionally surfaces
 * residual heterozygosity and genotyping error), trigger the worker's
 * 'compare' request through `runCompare`, and display the result. This
 * screen only formats `compare` (a PairwiseDiff); it never recomputes a
 * count itself. PairwiseDiff.discordantMarkers carries marker indices only
 * (no id or position -- that requires the dataset, which stays in the
 * worker), so the marker list here shows indices, not ids or positions; the
 * full list with ids and positions is available as a CSV from the Export
 * screen, built there by the worker.
 *
 * `compare` is the last completed request; it does not update or clear
 * itself when `sampleA`/`sampleB`/`mode` change below, so the result block is
 * labelled with `compare`'s own parameters (never the live form state), and a
 * note appears next to the Compare button whenever the form no longer
 * matches what is displayed.
 *
 * Props: samples, compare, runCompare, busy, chromosomeOrder.
 */
import { useEffect, useState } from 'react';

import type { PairwiseDiff, SampleRecord } from '../../core/types.ts';

type Mode = 'informative' | 'all';

/** Cap on how many discordant marker indices are listed inline. */
const DISCORDANT_PREVIEW_LIMIT = 200;

function pct2(numerator: number, denominator: number): string {
  return denominator === 0 ? 'NA' : ((numerator / denominator) * 100).toFixed(2);
}

function rate4(numerator: number, denominator: number): string {
  return denominator === 0 ? 'NA' : (numerator / denominator).toFixed(4);
}

function ibs4(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(4);
}

function optionLabel(s: SampleRecord): string {
  return `${s.lineName} (${s.sampleId})`;
}

export function CompareScreen({
  samples,
  compare,
  runCompare,
  busy,
  chromosomeOrder,
}: {
  samples: SampleRecord[];
  compare: PairwiseDiff | null;
  runCompare: (sampleA: string, sampleB: string, mode: Mode) => void;
  busy: boolean;
  chromosomeOrder: string[];
}) {
  const [sampleA, setSampleA] = useState('');
  const [sampleB, setSampleB] = useState('');
  const [mode, setMode] = useState<Mode>('informative');

  // Re-derive the defaults (first candidate vs. the recurrent parent) every
  // time a new sample list arrives, i.e. on a fresh load; `samples` keeps
  // its identity between renders that do not touch `loaded`, so this does
  // not clobber the user's own selection.
  useEffect(() => {
    const candidate = samples.find((s) => s.role === 'candidate');
    const recurrent = samples.find((s) => s.role === 'recurrent_parent');
    setSampleA(candidate?.sampleId ?? samples[0]?.sampleId ?? '');
    setSampleB(recurrent?.sampleId ?? samples[1]?.sampleId ?? samples[0]?.sampleId ?? '');
  }, [samples]);

  if (samples.length === 0) {
    return (
      <section>
        <h2>Compare two lines</h2>
        <p>Load a dataset first.</p>
      </section>
    );
  }

  const sameSample = sampleA !== '' && sampleA === sampleB;

  // True once a control (sample or mode) has changed since `compare` was
  // produced, so the displayed result no longer reflects the form above it.
  const resultStale =
    compare !== null &&
    (compare.sampleA !== sampleA || compare.sampleB !== sampleB || compare.mode !== mode);

  function sampleLabel(id: string): string {
    const s = samples.find((x) => x.sampleId === id);
    return s === undefined ? id : optionLabel(s);
  }

  // compare.byChromosome already carries one row per chromosome in worker
  // order, zeros included; keyed here by chrom name and re-walked in
  // `chromosomeOrder` so a table row exists for every chromosome this
  // screen knows about even in the unlikely case the two orders disagree.
  const byChrom = new Map((compare?.byChromosome ?? []).map((r) => [r.chrom, r]));
  const chromRows = chromosomeOrder.map((chrom) => {
    const r = byChrom.get(chrom);
    return { chrom, nCompared: r?.nCompared ?? 0, nDiscordant: r?.nDiscordant ?? 0 };
  });

  const discordantTotal = compare?.discordantMarkers.length ?? 0;
  const discordantPreview =
    compare === null
      ? []
      : Array.from(compare.discordantMarkers.slice(0, DISCORDANT_PREVIEW_LIMIT));
  const truncated = discordantTotal > DISCORDANT_PREVIEW_LIMIT;

  return (
    <section>
      <h2>Compare two lines</h2>

      <div>
        <label>
          Sample A{' '}
          <select value={sampleA} onChange={(e) => setSampleA(e.target.value)} disabled={busy}>
            {samples.map((s) => (
              <option key={s.sampleId} value={s.sampleId}>
                {optionLabel(s)}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Sample B{' '}
          <select value={sampleB} onChange={(e) => setSampleB(e.target.value)} disabled={busy}>
            {samples.map((s) => (
              <option key={s.sampleId} value={s.sampleId}>
                {optionLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend>Mode</legend>
        <label>
          <input
            type="radio"
            name="compare-mode"
            value="informative"
            checked={mode === 'informative'}
            disabled={busy}
            onChange={() => setMode('informative')}
          />{' '}
          Informative
        </label>{' '}
        <label>
          <input
            type="radio"
            name="compare-mode"
            value="all"
            checked={mode === 'all'}
            disabled={busy}
            onChange={() => setMode('all')}
          />{' '}
          All
        </label>
        <p>
          Informative compares parent-of-origin at markers informative for this parent pair; all
          compares raw genotypes everywhere and surfaces residual heterozygosity and genotyping
          error.
        </p>
      </fieldset>

      {sameSample && <p>Sample A and sample B are the same; select two different samples.</p>}

      <button
        type="button"
        disabled={busy || sameSample || sampleA === '' || sampleB === ''}
        onClick={() => runCompare(sampleA, sampleB, mode)}
      >
        Compare
      </button>
      {compare !== null && resultStale && (
        <p role="status">
          The form no longer matches the result below (still showing {sampleLabel(compare.sampleA)}{' '}
          vs {sampleLabel(compare.sampleB)}, {compare.mode}); press Compare to refresh it.
        </p>
      )}

      {compare !== null && (
        <>
          <h3>
            Result: {sampleLabel(compare.sampleA)} vs {sampleLabel(compare.sampleB)}, {compare.mode}
          </h3>
          <p>
            Markers compared: {compare.nCompared.toLocaleString()}; discordant:{' '}
            {compare.nDiscordant.toLocaleString()} ({pct2(compare.nDiscordant, compare.nCompared)}
            %).
            {compare.mode === 'all' && (
              <>
                {' '}
                Identity by state: {ibs4(compare.ibs)} (the mean over co-called markers of shared
                alleles divided by two).
              </>
            )}
          </p>

          {compare.mode === 'informative' && (
            <p>
              Skipped as missing: {compare.nSkippedMissing.toLocaleString()}.{' '}
              <strong style={compare.nSkippedNonparental > 0 ? { fontSize: '1.2em' } : undefined}>
                Skipped as nonparental: {compare.nSkippedNonparental.toLocaleString()}
                {compare.nSkippedNonparental > 0
                  ? ' -- check for contamination or a wrong parent'
                  : ''}
              </strong>
              . Both are informative markers this comparison could not use: a missing call means the
              sample was uncalled there, and a nonparental call carries an allele found in neither
              parent, so it cannot be placed by parent of origin and is excluded from the comparison
              rather than counted as a discordance.
            </p>
          )}

          <table>
            <caption>Discordance by chromosome</caption>
            <thead>
              <tr>
                <th scope="col">chrom</th>
                <th scope="col">n_compared</th>
                <th scope="col">n_discordant</th>
                <th scope="col">discordant rate</th>
              </tr>
            </thead>
            <tbody>
              {chromRows.map((row) => (
                <tr key={row.chrom}>
                  <td>{row.chrom}</td>
                  <td>{row.nCompared}</td>
                  <td>{row.nDiscordant}</td>
                  <td>{rate4(row.nDiscordant, row.nCompared)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Discordant markers</h3>
          <p>
            {discordantTotal.toLocaleString()} discordant marker
            {discordantTotal === 1 ? '' : 's'}.{' '}
            {discordantTotal > 0 &&
              'The full list, with marker ids and positions, is available as a CSV from the ' +
                'Export screen.'}
          </p>
          {discordantTotal > 0 && (
            <>
              <p>
                {truncated
                  ? `Showing the first ${DISCORDANT_PREVIEW_LIMIT} of ${discordantTotal}.`
                  : `Showing all ${discordantTotal}.`}
              </p>
              <ul>
                {discordantPreview.map((m, i) => (
                  <li key={i}>marker index {m}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
