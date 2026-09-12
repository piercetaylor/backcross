/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vite';

// Cross-origin isolation for the browser-mode test server only, so that
// performance.measureUserAgentSpecificMemory() is callable in Chromium
// (docs/adr/0011). GitHub Pages cannot send these headers; the app never
// relies on them.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// en-US so toLocaleString() renders the counts the tests read; a bounded
// action timeout so a missed click fails in seconds rather than at testTimeout.
const PROVIDER_OPTIONS = { contextOptions: { locale: 'en-US' }, actionTimeout: 10_000 };

// Chromium and Firefox, per the maintainer's 2026-09-12 decision. Chromium
// launches the full browser (channel 'chromium') rather than Playwright's
// headless shell, because the shell refuses measureUserAgentSpecificMemory()
// and CI runs headless. The viewport is wide enough for the rail, the
// genotype gutter, the canvas and the marker-detail panel side by side;
// Vitest's default is a phone width. A function, not a shared object: Vitest
// names each instance after its project, so two projects holding the same
// instance objects collide.
function browserMode() {
  return {
    enabled: true,
    provider: playwright(PROVIDER_OPTIONS),
    instances: [
      {
        browser: 'chromium' as const,
        provider: playwright({ ...PROVIDER_OPTIONS, launchOptions: { channel: 'chromium' } }),
      },
      { browser: 'firefox' as const },
    ],
    viewport: { width: 1280, height: 720 },
  };
}

// Pre-bundled up front, so the first browser test does not trigger Vite's
// mid-run dependency re-optimisation and reload.
const BROWSER_DEPS = [
  'react',
  'react-dom/client',
  'react-aria-components',
  'fflate',
  'vitest-browser-react',
];

// VITE_BASE_PATH lets the same build serve from "/" (custom host) or
// "/isoline-browser/" (GitHub Pages project site). See .env.example.
export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? (mode === 'production' ? '/isoline-browser/' : '/'),
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Set just above the 534 kB main chunk that react-aria-components produced
    // in M2.5, so the warning still fires on the next heavy dependency rather
    // than being silenced. It measures parse cost, not transfer. docs/adr/0010.
    chunkSizeWarningLimit: 600,
  },
  test: {
    // `npm test` is the node project alone; browser-mode tests run through
    // `npm run test:browser` and `npm run test:bench` (docs/adr/0011).
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/browser/**', 'tests/bench/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        server: { headers: ISOLATION_HEADERS },
        optimizeDeps: { include: BROWSER_DEPS },
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.{ts,tsx}'],
          browser: browserMode(),
          testTimeout: 60_000,
          expect: { poll: { timeout: 30_000 } },
        },
      },
      {
        extends: true,
        server: { headers: ISOLATION_HEADERS },
        optimizeDeps: { include: BROWSER_DEPS },
        test: {
          name: 'bench',
          include: ['tests/bench/**/*.test.{ts,tsx}'],
          browser: browserMode(),
          // One browser at a time: Chromium and Firefox loading 50K x 200
          // side by side contend for the same cores and time each other.
          fileParallelism: false,
          testTimeout: 180_000,
          expect: { poll: { timeout: 170_000 } },
        },
      },
    ],
  },
}));
