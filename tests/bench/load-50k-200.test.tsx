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
 * Memory: performance.measureUserAgentSpecificMemory() in Chromium, which
 * covers the analysis worker (tests/browser/isolation-probe.test.ts shows
 * the page is cross-origin isolated there). Firefox has no equivalent; its
 * figure is reported as unavailable. The delta is recorded, not asserted,
 * until phase 2 adds the bound.
 */
import { server } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

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

/** BENCH_SPEC as a bgzipped VCF File, built in chunks so no 40 MB string is ever held. */
function benchGenotypes(): File {
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
  return new File(blocks, 'bench.vcf.gz', { type: 'application/gzip' });
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
    await mountApp();
    const genotypes = benchGenotypes();
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

    const toSummary = Math.round(summaryAt - clickedAt);
    const toLines = Math.round(linesAt - clickedAt);
    const toDraw = Math.round(drawnAt - clickedAt);
    const memory =
      memoryBefore === null || memoryAfter === null
        ? 'memory delta unavailable (no measureUserAgentSpecificMemory)'
        : `memory delta ${mb(memoryAfter - memoryBefore)} (${mb(memoryBefore)} -> ${mb(memoryAfter)})`;
    console.log(
      `[bench ${server.browser}] input ${mb(genotypes.size)} bgzip; Load -> Summary ${toSummary} ms; ` +
        `Load -> "Lines: 200" ${toLines} ms; ` +
        `Load -> first draw ${toDraw} ms; ${memory}; budget ${BUDGET_MS} ms`,
    );

    expect(alertText()).toBeNull();
    expect(loaded).toEqual([counts.nMarkers, counts.nSamples, counts.nInformative]);
    expect(counts.nMarkers).toBe(50_000);
    expect(counts.nSamples).toBe(202);
    expect(toDraw).toBeLessThan(BUDGET_MS);
  });
});
