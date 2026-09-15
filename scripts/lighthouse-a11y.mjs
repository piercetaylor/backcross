/**
 * Lighthouse accessibility audit of the built landing page (PLAN.md, M3:
 * "Lighthouse accessibility score above 90").
 *
 * Builds the app with base "/" into lighthouse/dist (never dist/, which is
 * the Pages build), serves it with Vite's preview server on 127.0.0.1:4173,
 * runs Lighthouse's accessibility category in the Chromium that Playwright
 * installed (chromium.executablePath() honours PLAYWRIGHT_BROWSERS_PATH;
 * CHROME_PATH overrides it), writes lighthouse/accessibility.json and prints
 * the score with every failing audit.
 *
 * Lighthouse sees only the Upload screen, since it cannot load files; the
 * other five screens are covered by axe in tests/browser/a11y-axe.test.tsx.
 *
 * Exit codes: 0 score above 90; 2 the environment before the audit (no
 * Chromium, build or server failure); 1 everything else, which is a score of
 * 90 or below, a null score, a Lighthouse runtime error, and a Lighthouse
 * call that throws (it cannot be told apart from a failing audit here).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const PORT = 4173;
const HOST = '127.0.0.1';
const OUT_DIR = join(process.cwd(), 'lighthouse');
const DIST_DIR = join(OUT_DIR, 'dist');
const REPORT = join(OUT_DIR, 'accessibility.json');
/** PLAN.md says "above 90": 91 passes, 90 fails. */
const THRESHOLD = 90;

function resolveChrome() {
  const fromEnv = process.env.CHROME_PATH;
  const path = fromEnv !== undefined && fromEnv !== '' ? fromEnv : chromium.executablePath();
  if (!existsSync(path)) {
    console.error(
      `No Chromium at ${path}. Run "npx playwright install chromium" or set CHROME_PATH; ` +
        "on the maintainer's machine PLAYWRIGHT_BROWSERS_PATH must point at " +
        '%USERPROFILE%\\.cache\\ms-playwright (CLAUDE.md, "Environment gotchas").',
    );
    process.exit(2);
  }
  return path;
}

async function main() {
  const chromePath = resolveChrome();
  process.env.VITE_BASE_PATH = '/';
  let server;
  try {
    await build({ logLevel: 'warn', build: { outDir: DIST_DIR, emptyOutDir: true } });
    server = await preview({
      logLevel: 'warn',
      build: { outDir: DIST_DIR },
      preview: { host: HOST, port: PORT, strictPort: true },
    });
  } catch (error) {
    console.error(error);
    process.exit(2);
  }
  const url = `http://${HOST}:${PORT}/`;
  let chrome;
  try {
    chrome = await launch({ chromePath, chromeFlags: ['--headless', '--disable-gpu'] });
  } catch (error) {
    console.error(error);
    await server.close();
    process.exit(2);
  }
  let code = 1;
  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility'],
    });
    if (result === undefined) throw new Error('Lighthouse returned no result');
    const { lhr } = result;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(REPORT, Array.isArray(result.report) ? result.report[0] : result.report);
    if (lhr.runtimeError !== undefined) {
      console.error(
        `Lighthouse runtime error ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`,
      );
    } else {
      const score = lhr.categories.accessibility.score;
      const pct = score === null ? null : Math.round(score * 100);
      console.log(
        `Lighthouse ${lhr.lighthouseVersion} accessibility: ${pct ?? 'null'} / 100 ` +
          `(${lhr.environment.hostUserAgent}) on ${lhr.finalDisplayedUrl}`,
      );
      const failing = lhr.categories.accessibility.auditRefs
        .map((ref) => lhr.audits[ref.id])
        .filter((audit) => audit.score !== null && audit.score < 1);
      for (const audit of failing) {
        console.log(`  FAIL ${audit.id}: ${audit.title}`);
        for (const item of audit.details?.items ?? []) {
          if (item.node?.selector !== undefined) console.log(`       ${item.node.selector}`);
        }
      }
      console.log(`Report: ${REPORT}`);
      if (pct !== null && pct > THRESHOLD) code = 0;
      else console.error(`Accessibility score ${pct ?? 'null'} is not above ${THRESHOLD}.`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    try {
      await chrome.kill();
    } catch (error) {
      // On Windows chrome-launcher can fail with EPERM removing its profile
      // directory while Chrome still holds handles; the audit already ran.
      console.warn(`chrome-launcher cleanup: ${error.message}`);
    }
    await server.close();
  }
  process.exit(code);
}

await main();
