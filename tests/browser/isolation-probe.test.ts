/**
 * Whether the memory figure of phase 2 can be taken at all, per browser.
 *
 * The browser and bench projects serve every response with COOP same-origin
 * and COEP require-corp (vite.config.ts). In Chromium that makes the tester
 * iframe cross-origin isolated, which is what
 * performance.measureUserAgentSpecificMemory() requires; the call's figure
 * includes dedicated workers, so the worker that owns the genotype matrix is
 * inside it. Firefox does not implement the API, and this test records that
 * rather than pretending otherwise: its memory figure is an accounting
 * assertion only (docs/m3-phases.md, resolution 2).
 *
 * If the Chromium half fails, the tester iframe did not survive require-corp
 * and the bench must fall back to the CDP heap-size command described in
 * docs/adr/0011.
 */
import { server } from 'vitest/browser';
import { describe, expect, it } from 'vitest';

interface MemoryMeasurement {
  bytes: number;
  breakdown: unknown[];
}

type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<MemoryMeasurement>;
};

describe('cross-origin isolation probe', () => {
  it('runs in a provider this probe accounts for', () => {
    expect(['chromium', 'firefox']).toContain(server.browser);
  });

  it.runIf(server.browser === 'chromium')(
    'Chromium is cross-origin isolated and measures user-agent memory',
    async () => {
      expect(crossOriginIsolated).toBe(true);
      const perf = performance as MemoryPerformance;
      expect(typeof perf.measureUserAgentSpecificMemory).toBe('function');
      const result = await perf.measureUserAgentSpecificMemory!();
      expect(result.bytes).toBeGreaterThan(0);
      expect(Array.isArray(result.breakdown)).toBe(true);
    },
  );

  it.runIf(server.browser === 'firefox')(
    'Firefox has no measureUserAgentSpecificMemory; its memory check is accounting only',
    () => {
      const perf = performance as MemoryPerformance;
      expect(typeof perf.measureUserAgentSpecificMemory).toBe('undefined');
    },
  );
});
