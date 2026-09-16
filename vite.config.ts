/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { brapiMockPlugin } from './tests/support/brapi-mock-plugin.ts';
import type { BrowserCommand } from 'vitest/node';

// The demo dataset (docs/adr/0017): the committed synthetic fixture, served
// as <base>demo/synthetic/<file>. The build emits the three files into the
// site; the dev server, and so every browser-mode test, answers them from
// tests/fixtures/synthetic directly. No copy is committed, and nothing but
// these three generated files is ever served.
const DEMO_SOURCE_DIR = new URL('./tests/fixtures/synthetic/', import.meta.url);
const DEMO_FILES: Record<string, string> = {
  'genotypes.vcf': 'text/plain; charset=utf-8',
  'samples.csv': 'text/csv; charset=utf-8',
  'markers.csv': 'text/csv; charset=utf-8',
};

function demoDataPlugin(): Plugin {
  return {
    name: 'backcross-demo-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `${server.config.base}demo/synthetic/`;
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (!path.startsWith(prefix)) return next();
        const file = path.slice(prefix.length);
        const type = Object.hasOwn(DEMO_FILES, file) ? DEMO_FILES[file] : undefined;
        if (type === undefined) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', type);
        res.end(readFileSync(new URL(file, DEMO_SOURCE_DIR)));
      });
    },
    generateBundle() {
      for (const file of Object.keys(DEMO_FILES)) {
        this.emitFile({
          type: 'asset',
          fileName: `demo/synthetic/${file}`,
          source: readFileSync(new URL(file, DEMO_SOURCE_DIR)),
        });
      }
    },
  };
}

// Cross-origin isolation for the browser-mode test server only, so that
// performance.measureUserAgentSpecificMemory() is callable in Chromium
// (docs/adr/0011). GitHub Pages cannot send these headers; the app never
// relies on them.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// en-US so toLocaleString() renders the counts the tests read; a bounded
// action timeout so a missed click fails before testTimeout. 30 s, not 10 s:
// with the machine near 80 % CPU, Firefox left an action Playwright had
// already resolved (the Load button visible, enabled and stable) undispatched
// for over 10 s while the rest of the test ran at its usual pace. That is
// Playwright-to-Firefox latency under CPU starvation, not app state.
const PROVIDER_OPTIONS = { contextOptions: { locale: 'en-US' }, actionTimeout: 30_000 };

// Raises the test's page to the front of its browser, giving its window focus
// back (tests/support/app-harness.tsx, pressKeys). Firefox runs a page per
// test file in one browser, and a page acting elsewhere takes window focus.
const bringToFront: BrowserCommand<[], void> = async ({ page }) => {
  await page.bringToFront();
};

// Switches the page's media type for tests/browser/print-media.test.tsx;
// null restores the browser's own. Playwright's page.emulateMedia applies to
// every frame of the page, so the tester iframe sees @media print.
const emulateMedia: BrowserCommand<[media: 'print' | 'screen' | null], void> = async (
  { page },
  media,
) => {
  await page.emulateMedia({ media });
};

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
    // Twelve pages start at once, six per browser; under the same CPU load a
    // Firefox session missed Vitest's default 60 s connect timeout.
    connectTimeout: 120_000,
    commands: { bringToFront, emulateMedia },
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
  'axe-core',
];

// VITE_BASE_PATH lets the same build serve from "/" (custom host) or
// "/backcross/" (GitHub Pages project site). See .env.example.
export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? (mode === 'production' ? '/backcross/' : '/'),
  // brapiMockPlugin serves tests/fixtures/brapi under /__brapi__ for browser-mode tests (no build hook).
  // demoDataPlugin serves the synthetic fixture under demo/synthetic/, in dev and in the build.
  plugins: [react(), brapiMockPlugin(), demoDataPlugin()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Dependencies in their own chunks, so Vite's default 500 kB chunk warning
    // measures this repository's code rather than React Aria's (docs/adr/0016).
    // Group tests match module ids; [\\/] covers both path separators.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
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
          // One page at a time: focus-order, focus-not-obscured and
          // lines-grid-keyboard each take Firefox window focus back through
          // bringToFront, and run side by side they take it from each other
          // until one times out (observed 2026-09-15; serially all pass).
          fileParallelism: false,
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
