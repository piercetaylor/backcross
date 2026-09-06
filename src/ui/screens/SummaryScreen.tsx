/**
 * Screen 2: dataset summary and QC.
 *
 * Responsibility: display counts (markers, informative markers, samples by
 * role), parent polymorphism rate, the informative-marker gap distribution
 * next to the active segment-gap default (docs/adr/0008), per-line QC with
 * flags, a per-marker call-rate histogram, and dataset-level flags. Every
 * number comes from the `loaded` and `qc` worker results passed in as
 * props; this screen only formats and groups them, it never re-derives a
 * metric the worker did not already compute.
 *
 * Props: loaded, qc, segmentParams (the currently active SegmentParams, to
 * show alongside the observed gap distribution), gapCriterion (the
 * criterion the worker's last segmentsAll response used; falls back to the
 * one 'load' reported when segments have not been (re)computed yet).
 *
 * The heading is focusable (tabIndex=-1) and focused on mount, since App
 * auto-navigates here after a successful load and the Load button it came
 * from is unmounted -- without this, focus would drop to <body>.
 */
import { useEffect, useRef } from 'react';

import type { GapCriterion } from '../../core/segments.ts';
import type { QcReport, SegmentParams } from '../../core/types.ts';
import type { LoadedState } from './UploadScreen.tsx';

function rate3(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(3);
}

/**
 * Value at index floor(p * (n - 1)) of the sorted array -- the "lower"
 * percentile method (linear interpolation's lower endpoint), not
 * nearest-rank.
 */
function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx] as number;
}

function mb(bp: number): string {
  return Number.isNaN(bp) ? 'NA' : (bp / 1_000_000).toFixed(3);
}

export function SummaryScreen({
  loaded,
  qc,
  segmentParams,
  gapCriterion,
}: {
  loaded: LoadedState | null;
  qc: QcReport | null;
  segmentParams: SegmentParams;
  gapCriterion: GapCriterion | null;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (loaded === null) {
    return (
      <section>
        <h2 ref={headingRef} tabIndex={-1}>
          Dataset summary and QC
        </h2>
        <p>Load a dataset first.</p>
      </section>
    );
  }

  const roleCounts = new Map<string, number>();
  for (const s of loaded.samples) roleCounts.set(s.role, (roleCounts.get(s.role) ?? 0) + 1);
  const lineNameById = new Map(loaded.samples.map((s) => [s.sampleId, s.lineName]));

  const gaps = loaded.informativeGapsBp;
  const gapMedianMb = mb(percentile(gaps, 0.5));
  const gapP95Mb = mb(percentile(gaps, 0.95));
  const gapMaxMb = gaps.length > 0 ? mb(gaps[gaps.length - 1] as number) : 'NA';
  const activeCriterion = gapCriterion ?? loaded.gapCriterion;
  const activeGapDefault =
    activeCriterion === 'cm'
      ? `${segmentParams.maxGapCm} cM (cM criterion active; bp default is ${mb(segmentParams.maxGapBp)} Mb)`
      : `${mb(segmentParams.maxGapBp)} Mb`;

  // Ten equal call-rate bins over [0, 1].
  const histCounts = new Array<number>(10).fill(0);
  if (qc !== null) {
    for (let m = 0; m < qc.markers.callRate.length; m++) {
      const rate = qc.markers.callRate[m] as number;
      // qc.markers.callRate is a Float32Array, so an exact tenth like 0.7 is
      // stored as 0.699999988; without this epsilon that floors into bin 6
      // instead of 7. The epsilon is far smaller than any spacing between
      // achievable call rates, so it never pulls a value into the wrong bin
      // the other way, and 1.0 still clamps to bin 9.
      const bin = Number.isNaN(rate) ? 0 : Math.min(9, Math.floor(rate * 10 + 1e-6));
      histCounts[bin] = (histCounts[bin] as number) + 1;
    }
  }
  const maxHistCount = Math.max(1, ...histCounts);

  return (
    <section>
      <h2 ref={headingRef} tabIndex={-1}>
        Dataset summary and QC
      </h2>

      {loaded.warnings.length > 0 && (
        <ul>
          {loaded.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <ul>
        <li>{loaded.nMarkers.toLocaleString()} markers</li>
        <li>{loaded.nInformative.toLocaleString()} informative markers</li>
        {Array.from(roleCounts.entries()).map(([role, count]) => (
          <li key={role}>
            {role}: {count}
          </li>
        ))}
      </ul>

      <p>Parent polymorphism rate: {qc === null ? 'NA' : rate3(qc.parentPolymorphismRate)}</p>

      <p>
        Informative marker gaps: median {gapMedianMb} Mb, p95 {gapP95Mb} Mb, max {gapMaxMb} Mb.
        Active segment gap default: {activeGapDefault}.
      </p>

      {qc !== null && qc.datasetFlags.length > 0 && (
        <p>Dataset flags: {qc.datasetFlags.join(', ')}</p>
      )}

      <h3>Call-rate histogram</h3>
      <div
        role="img"
        aria-label={`Marker call-rate histogram, 10 bins from 0 to 1: ${histCounts
          .map((c, i) => `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}: ${c}`)
          .join(', ')}`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}
      >
        {histCounts.map((count, i) => (
          <div key={i} style={{ textAlign: 'center', flex: 1 }}>
            <div>{count}</div>
            <div
              style={{
                height: Math.max(2, (count / maxHistCount) * 90),
                background: '#0072B2',
              }}
            />
            <div style={{ fontSize: 10 }}>
              {(i / 10).toFixed(1)}-{((i + 1) / 10).toFixed(1)}
            </div>
          </div>
        ))}
      </div>

      <h3>Per-line QC</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">sample_id</th>
            <th scope="col">line_name</th>
            <th scope="col">role</th>
            <th scope="col">missing rate (all markers)</th>
            <th scope="col">het rate (called)</th>
            <th scope="col">nonparental rate (informative called)</th>
            <th scope="col">flags</th>
          </tr>
        </thead>
        <tbody>
          {qc === null
            ? null
            : qc.lines.map((line) => {
                const flagged = line.flags.includes('closer_to_donor');
                return (
                  <tr key={line.sampleId} style={flagged ? { background: '#fde0dc' } : undefined}>
                    <td>{line.sampleId}</td>
                    <td>{lineNameById.get(line.sampleId) ?? line.sampleId}</td>
                    <td>{line.role}</td>
                    <td>{rate3(line.missingRate)}</td>
                    <td>{rate3(line.hetRate)}</td>
                    <td>{rate3(line.nonparentalRate)}</td>
                    <td>{line.flags.join(' ')}</td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </section>
  );
}
