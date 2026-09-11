/**
 * Screen 6: export.
 *
 * Responsibility: download the per-line summary CSV (export/summary-csv.ts),
 * segments CSV (export/segments-csv.ts), target check CSV (export/targets-csv.ts),
 * pairwise CSV (export/pairwise-csv.ts), the discordant-markers CSV
 * (requested from the worker through `onRequestDiscordantMarkersCsv`, since
 * it needs the parsed dataset and classification that stay worker-resident)
 * and the self-contained HTML report (export/report.ts); PDF via the
 * browser's own print dialog. Every CSV and the report are downloaded as a
 * Blob URL created and revoked in the main thread; nothing is uploaded. This
 * screen formats worker results and already-fetched main-thread state into
 * files; it does not compute anything the worker has not already produced.
 *
 * `buildHtmlReport` (export/report.ts) takes a `Dataset`, but the parsed
 * Dataset lives only inside the analysis worker
 * (src/workers/analysis.worker.ts) and is never transferred to the main
 * thread. It reads only four things off `input.dataset`: `markers.cm` (is a
 * genetic map loaded), `markers.ids.length` (marker count), `samples` (role
 * counts and line names) and `chromosomeOrder.length` (chromosome count) --
 * never genotypes, `chromIndex`, `sortedMarkerOrder`, or the two
 * parent-column indices. `ReportInput.dataset` is a small `ReportDataset` of
 * exactly those facts, taken from `loaded`, so no genotype matrix is needed
 * here.
 *
 * Graphical genotype figures for the report are rendered here, offscreen,
 * from `classesData` -- the same class data the genotype view screen draws,
 * already reduced to the visible lines and put in display order by App
 * (ui/lines/classes-order.ts), so the report's figures are the lines the
 * genotype view is showing, in the order it shows them (docs/adr/0009,
 * amended 2026-09-11). The CSV exports are unaffected: they are computed
 * over the whole dataset by contract (docs/data-formats.md). Rendering is
 * through GraphicalGenotypeRenderer, one canvas per sample, at a fixed 900
 * CSS px width.
 *
 * The discordant-markers button is additionally disabled while `busy`: it is
 * the one export that issues a fresh worker request, and while a load or
 * parameter chain is in flight (App.tsx) the worker processes that request
 * first, so a discordant-markers request queued during it would either be
 * recomputed against the new dataset with the old sampleA/sampleB/mode, or
 * fail outright once the old sample ids no longer exist. Every other button
 * here only formats state already committed to React (rpp, qc,
 * segmentsByCandidate, targets, compare), so it carries no such risk and is
 * left enabled during `busy`.
 *
 * Props: loaded, rpp, qc, segmentsByCandidate, targets, params, gapCriterion,
 * compare, classesData, classesLoading, busy, onRequestDiscordantMarkersCsv.
 */
import { useState } from 'react';

import { GraphicalGenotypeRenderer } from '../canvas/GraphicalGenotypeRenderer.ts';
import type { GapCriterion } from '../../core/segments.ts';
import type {
  DonorSegment,
  LineRpp,
  PairwiseDiff,
  QcReport,
  TargetCheck,
  TargetRegion,
} from '../../core/types.ts';
import { pairwiseCsv } from '../../export/pairwise-csv.ts';
import { buildHtmlReport } from '../../export/report.ts';
import { lineSummaryCsv } from '../../export/summary-csv.ts';
import { segmentsCsv } from '../../export/segments-csv.ts';
import { targetsCsv } from '../../export/targets-csv.ts';
import type { GenotypeClassesData } from '../../workers/protocol.ts';
import type { AnalysisParams, LoadedState } from './UploadScreen.tsx';

/** Fixed offscreen render width for report figures, CSS px. */
const REPORT_IMAGE_WIDTH_PX = 900;

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Renders one offscreen canvas per line in `classesData`, at a fixed width, into a sample_id -> PNG data URI map. */
function renderReportImages(classesData: GenotypeClassesData): Map<string, string> {
  const images = new Map<string, string>();
  for (const line of classesData.lines) {
    const canvas = document.createElement('canvas');
    const renderer = new GraphicalGenotypeRenderer(canvas);
    renderer.setData({
      chromosomeOrder: classesData.chromosomeOrder,
      chromLengthsBp: classesData.chromLengthsBp,
      markerChromIndex: classesData.markerChromIndex,
      markerPosBp: classesData.markerPosBp,
      sortedMarkerOrder: classesData.sortedMarkerOrder,
      informative: classesData.informative,
      lines: [line],
    });
    renderer.setSize(REPORT_IMAGE_WIDTH_PX);
    renderer.draw();
    images.set(line.sampleId, renderer.toDataUrl());
  }
  return images;
}

function openForPrint(html: string): boolean {
  const win = window.open('', '_blank');
  if (win === null) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

export function ExportScreen({
  loaded,
  rpp,
  qc,
  segmentsByCandidate,
  targets,
  params,
  gapCriterion,
  compare,
  classesData,
  classesLoading,
  busy,
  onRequestDiscordantMarkersCsv,
}: {
  loaded: LoadedState | null;
  rpp: LineRpp[] | null;
  qc: QcReport | null;
  segmentsByCandidate: DonorSegment[][] | null;
  targets: { regions: TargetRegion[]; checks: TargetCheck[] } | null;
  params: AnalysisParams;
  gapCriterion: GapCriterion | null;
  compare: PairwiseDiff | null;
  classesData: GenotypeClassesData | null;
  classesLoading: boolean;
  /** True while a load or parameter chain is in flight (App.tsx); see the module header. */
  busy: boolean;
  /**
   * Builds the discordant-marker table in the worker, which owns the parsed
   * dataset and the classification the table needs (docs/adr/0001).
   */
  onRequestDiscordantMarkersCsv:
    ((sampleA: string, sampleB: string, mode: 'informative' | 'all') => Promise<string>) | null;
}) {
  // Hoisted above the `loaded === null` early return below so this component
  // always renders the same hooks regardless of that branch (a `loaded`
  // null-to-non-null transition while mounted would otherwise render zero
  // hooks on one pass and one on the next, which React rejects).
  const [discordantError, setDiscordantError] = useState<string | null>(null);

  if (loaded === null) {
    return (
      <section>
        <h2>Export</h2>
        <p>Load a dataset first.</p>
      </section>
    );
  }

  const diffs: PairwiseDiff[] = compare === null ? [] : [compare];
  const effectiveGapCriterion = gapCriterion ?? loaded.gapCriterion;

  const canSummary = rpp !== null;
  const canSegments = segmentsByCandidate !== null;
  const canTargets = targets !== null && targets.regions.length > 0;
  const canPairwise = compare !== null;
  const canReport = rpp !== null && !classesLoading;

  function buildReportHtml(): string {
    if (loaded === null || rpp === null) throw new Error('report requires rpp results');
    const images =
      classesData === null ? new Map<string, string>() : renderReportImages(classesData);
    return buildHtmlReport({
      dataset: {
        nMarkers: loaded.nMarkers,
        nChromosomes: loaded.chromosomeOrder.length,
        hasCm: loaded.hasCm,
        samples: loaded.samples,
      },
      lineRpp: rpp,
      qc,
      targets: targets?.checks ?? [],
      segmentsByCandidate: segmentsByCandidate ?? [],
      images,
      generatedAt: new Date(),
      params,
      gapCriterion: effectiveGapCriterion,
      warnings: loaded.warnings,
      nInformative: loaded.nInformative,
    });
  }

  return (
    <section>
      <h2>Export</h2>
      <p>Files are generated in this browser tab and are never uploaded anywhere.</p>

      <ul>
        <li>
          <button
            type="button"
            disabled={!canSummary}
            onClick={() => {
              if (rpp === null) return;
              download(
                'isoline-summary.csv',
                lineSummaryCsv(rpp, loaded.chromosomeOrder),
                'text/csv',
              );
            }}
          >
            Download per-line summary CSV
          </button>
          {!canSummary && <span> -- no RPP results available yet.</span>}
        </li>

        <li>
          <button
            type="button"
            disabled={!canSegments}
            onClick={() => {
              if (segmentsByCandidate === null) return;
              download(
                'isoline-segments.csv',
                segmentsCsv(segmentsByCandidate.flat(), effectiveGapCriterion),
                'text/csv',
              );
            }}
          >
            Download segments CSV
          </button>
          {!canSegments && <span> -- no donor segments computed yet.</span>}
        </li>

        <li>
          <button
            type="button"
            disabled={!canTargets}
            onClick={() => {
              if (targets === null) return;
              download('isoline-targets.csv', targetsCsv(targets.checks), 'text/csv');
            }}
          >
            Download target check CSV
          </button>
          {!canTargets && <span> -- no target regions are defined.</span>}
        </li>

        <li>
          <button
            type="button"
            disabled={!canPairwise}
            onClick={() => {
              download(
                'isoline-pairwise.csv',
                pairwiseCsv(diffs, loaded.chromosomeOrder),
                'text/csv',
              );
            }}
          >
            Download pairwise CSV
          </button>
          {!canPairwise && (
            <span> -- no comparison has been run; run one from the Compare screen.</span>
          )}
        </li>

        <li>
          <button
            type="button"
            disabled={busy || !canPairwise || onRequestDiscordantMarkersCsv === null}
            onClick={() => {
              if (compare === null || onRequestDiscordantMarkersCsv === null) return;
              // The table names each marker and its parent-of-origin classes, so
              // the worker builds it and hands back the finished text.
              void onRequestDiscordantMarkersCsv(compare.sampleA, compare.sampleB, compare.mode)
                .then((csv) => {
                  download('isoline-discordant-markers.csv', csv, 'text/csv');
                })
                .catch((e: unknown) => {
                  setDiscordantError(e instanceof Error ? e.message : String(e));
                });
            }}
          >
            Download discordant-markers CSV
          </button>
          {busy && (
            <span>
              {' '}
              -- disabled while a load or parameter update is in progress, so this cannot be
              computed against a dataset that is about to change.
            </span>
          )}
          {!busy && !canPairwise && (
            <span> -- no comparison has been run; run one from the Compare screen.</span>
          )}
          {discordantError !== null && <span role="alert"> -- {discordantError}</span>}
        </li>

        <li>
          <button
            type="button"
            disabled={!canReport}
            onClick={() => {
              download('isoline-report.html', buildReportHtml(), 'text/html');
            }}
          >
            Download HTML report
          </button>
          {!canReport && (
            <span>
              {' '}
              --{' '}
              {rpp === null
                ? 'no RPP results available yet.'
                : 'genotype images are still loading.'}
            </span>
          )}
        </li>

        <li>
          <button
            type="button"
            disabled={!canReport}
            onClick={() => {
              const html = buildReportHtml();
              if (!openForPrint(html)) {
                download('isoline-report.html', html, 'text/html');
              }
            }}
          >
            Print / save as PDF
          </button>
          <span>
            {' '}
            Opens the report in a new window and calls the browser's print dialog, where "Save as
            PDF" is a printer choice. If pop-ups are blocked, the HTML file downloads instead --
            open it and print from there.
          </span>
        </li>
      </ul>
    </section>
  );
}
