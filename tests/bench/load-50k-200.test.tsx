/**
 * 50,000 markers by 200 lines through the real application: a scale and
 * correctness test first, a timing record second (docs/m3-phases.md, Q5).
 *
 * The input is generated in the page from BENCH_SPEC, framed as BGZF, and
 * never written anywhere. It is loaded through the Upload screen's inputs
 * with loadFilesInPage, so the blob does not cross the test RPC. The test
 * always asserts that the load completes -- the Lines readout reaches 200,
 * the genotype canvas draws, no error is surfaced -- and that the dataset has
 * the dimensions synthCounts derives independently. It prints the wall-clock
 * from the Load click to each of those two moments, and the memory delta
 * across the load where the browser can measure it.
 *
 * Timing: asserted against VITE_BENCH_BUDGET_MS, default 30,000 ms, which is
 * the laptop figure; CI sets a looser hang guard. Navigation between the two
 * timed moments uses in-page clicks on the rail rather than Playwright, so
 * no RPC round trip is inside the figure.
 *
 * Memory (docs/m3-phases.md, phase 2; Q1 settled the bound as twice the
 * inflated bytes). The worker's 'loaded' result carries three accounting
 * figures -- bytesInflated, peakBuilderBytes, residentMatrixBytes -- which
 * the test reads by wrapping the page's Worker constructor, so every worker
 * App creates also reports its messages here and nothing in src/ changes
 * for the test's sake. bytesInflated is checked against the byte length
 * this file generated. In both browsers peakBuilderBytes +
 * residentMatrixBytes must be under 2 x bytesInflated. In Chromium,
 * performance.measureUserAgentSpecificMemory(), which covers the analysis
 * worker (tests/browser/isolation-probe.test.ts shows the page is
 * cross-origin isolated there), is taken before Load and after the first
 * draw, where phase 1 took it, and that delta must also be under
 * 2 x bytesInflated. Firefox has no equivalent API; its figure is reported
 * as unavailable.
 */
import { server } from 'vitest/browser';
import { describe, expect, it, onTestFinished } from 'vitest';

import { loadFilesInPage, mountApp, waitFor } from '../support/app-harness.tsx';
import { bgzfBlocks } from '../support/bgzf.ts';
import {
  BENCH_SPEC,
  synthCounts,
  synthMarkersCsv,
  synthSamplesCsv,
  synthVcfLines,
} from '../support/synth-vcf.ts';

const BUDGET_MS = Number(import.meta.env['VITE_BENCH_BUDGET_MS'] ?? 30_000);
const TIMEOUT_MS = 170_000;
const CHUNK_CHARS = 1 << 20;

interface LoadedFigures {
  bytesInflated: number;
  peakBuilderBytes: number;
  residentMatrixBytes: number;
}

/**
 * Replaces the page's Worker with a subclass that hands each 'loaded'
 * result's accounting figures to `onLoaded`; returns the restore function.
 * App constructs its worker in an effect during mount, so the spy must be
 * in place before mountApp resolves.
 */
function spyOnWorkers(onLoaded: (figures: LoadedFigures) => void): () => void {
  const Original = globalThis.Worker;
  class SpiedWorker extends Original {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.addEventListener('message', (ev: MessageEvent) => {
        const data = ev.data as { ok?: boolean; result?: { type?: string } & LoadedFigures };
        if (data.ok === true && data.result?.type === 'loaded') {
          const { bytesInflated, peakBuilderBytes, residentMatrixBytes } = data.result;
          onLoaded({ bytesInflated, peakBuilderBytes, residentMatrixBytes });
        }
      });
    }
  }
  globalThis.Worker = SpiedWorker;
  return () => {
    globalThis.Worker = Original;
  };
}

type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};

/** Resident bytes across the page and its workers, or null where the browser cannot say. */
async function measureMemory(): Promise<number | null> {
  const perf = performance as MemoryPerformance;
  if (typeof perf.measureUserAgentSpecificMemory !== 'function' || !crossOriginIsolated) {
    return null;
  }
  return (await perf.measureUserAgentSpecificMemory()).bytes;
}

/**
 * BENCH_SPEC as a bgzipped VCF File, built in chunks so no 40 MB string is
 * ever held, with the VCF's byte length before framing.
 */
function benchGenotypes(): { file: File; inflatedBytes: number } {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let pending: string[] = [];
  let pendingChars = 0;
  for (const line of synthVcfLines(BENCH_SPEC)) {
    pending.push(line);
    pendingChars += line.length;
    if (pendingChars >= CHUNK_CHARS) {
      parts.push(encoder.encode(pending.join('')));
      pending = [];
      pendingChars = 0;
    }
  }
  parts.push(encoder.encode(pending.join('')));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  const blocks = bgzfBlocks(bytes) as Uint8Array<ArrayBuffer>[];
  return {
    file: new File(blocks, 'bench.vcf.gz', { type: 'application/gzip' }),
    inflatedBytes: bytes.length,
  };
}

function railStep(name: string): HTMLElement {
  for (const el of document.querySelectorAll<HTMLElement>('.rail-item')) {
    if ((el.getAttribute('aria-label') ?? el.textContent?.trim()) === name) return el;
  }
  throw new Error(`no rail step ${name}`);
}

function alertText(): string | null {
  return document.querySelector('[role="alert"]')?.textContent ?? null;
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

describe('50K x 200 load', () => {
  it('loads, lists 200 lines and draws them, with the counts synthCounts derives', async () => {
    const counts = synthCounts(BENCH_SPEC);
    let figures: LoadedFigures | null = null;
    onTestFinished(
      spyOnWorkers((f) => {
        figures = f;
      }),
    );
    await mountApp();
    const { file: genotypes, inflatedBytes } = benchGenotypes();
    const files = {
      genotypes,
      samples: new File([synthSamplesCsv(BENCH_SPEC)], 'samples.csv'),
      markers: new File([synthMarkersCsv(BENCH_SPEC)], 'markers.csv'),
    };
    const memoryBefore = await measureMemory();

    const clickedAt = await loadFilesInPage(files);
    const summaryAt = await waitFor(() => {
      const failed = alertText();
      if (failed !== null) throw new Error(`load failed: ${failed}`);
      return document.querySelector('h2')?.textContent === 'Dataset summary and QC'
        ? performance.now()
        : null;
    }, TIMEOUT_MS);

    railStep('3. Lines').click();
    const linesAt = await waitFor(() => {
      const readout = document.querySelector('.line-action-bar-readout')?.textContent ?? '';
      return readout.startsWith('Lines: 200,') ? performance.now() : null;
    }, TIMEOUT_MS);

    railStep('4. Graphical genotypes').click();
    const drawnAt = await waitFor(() => {
      const failed = alertText();
      if (failed !== null) throw new Error(`draw failed: ${failed}`);
      const lines = document.querySelectorAll('.geno-gutter li').length;
      const tracks = document.querySelectorAll('.geno-strip-track').length;
      return lines === counts.nSamples - 2 && tracks === BENCH_SPEC.nChrom
        ? performance.now()
        : null;
    }, TIMEOUT_MS);

    const memoryAfter = await measureMemory();

    railStep('1. Upload').click();
    const summary = await waitFor(() => {
      for (const p of document.querySelectorAll('p')) {
        const m = /([\d,]+) markers, ([\d,]+) samples, ([\d,]+) informative/.exec(
          p.textContent ?? '',
        );
        if (m !== null) return m;
      }
      return null;
    });
    const loaded = summary.slice(1, 4).map((v) => Number(v.replace(/,/g, '')));

    const reported = figures as LoadedFigures | null;
    if (reported === null) throw new Error("no 'loaded' result reached the worker spy");
    const { bytesInflated, peakBuilderBytes, residentMatrixBytes } = reported;
    const bound = 2 * bytesInflated;
    const memoryDelta =
      memoryBefore === null || memoryAfter === null ? null : memoryAfter - memoryBefore;

    const toSummary = Math.round(summaryAt - clickedAt);
    const toLines = Math.round(linesAt - clickedAt);
    const toDraw = Math.round(drawnAt - clickedAt);
    const memory =
      memoryBefore === null || memoryAfter === null || memoryDelta === null
        ? 'memory delta unavailable (no measureUserAgentSpecificMemory)'
        : `memory delta ${mb(memoryDelta)} (${mb(memoryBefore)} -> ${mb(memoryAfter)}), ` +
          `${(memoryDelta / bytesInflated).toFixed(2)} x bytesInflated`;
    const accounting = peakBuilderBytes + residentMatrixBytes;
    console.log(
      `[bench ${server.browser}] input ${mb(genotypes.size)} bgzip; Load -> Summary ${toSummary} ms; ` +
        `Load -> "Lines: 200" ${toLines} ms; ` +
        `Load -> first draw ${toDraw} ms; ${memory}; budget ${BUDGET_MS} ms; ` +
        `bytesInflated ${bytesInflated} (${mb(bytesInflated)}); ` +
        `peakBuilderBytes ${peakBuilderBytes} (${mb(peakBuilderBytes)}); ` +
        `residentMatrixBytes ${residentMatrixBytes} (${mb(residentMatrixBytes)}); ` +
        `peak + resident ${(accounting / bytesInflated).toFixed(2)} x bytesInflated`,
    );

    expect(alertText()).toBeNull();
    expect(loaded).toEqual([counts.nMarkers, counts.nSamples, counts.nInformative]);
    expect(counts.nMarkers).toBe(50_000);
    expect(counts.nSamples).toBe(202);
    expect(toDraw).toBeLessThan(BUDGET_MS);
    expect(bytesInflated).toBe(inflatedBytes);
    expect(accounting).toBeLessThan(bound);
    if (server.browser === 'chromium') {
      expect(memoryDelta, 'Chromium measures memory (isolation-probe.test.ts)').not.toBeNull();
      expect(memoryDelta as number).toBeLessThan(bound);
    }
  });
});
