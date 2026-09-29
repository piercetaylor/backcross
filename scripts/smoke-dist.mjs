// Serves a built site from a nested path and loads the demo in Chromium, so a
// relative-base build (VITE_BASE_PATH=./) is proven to find its scripts, its
// module worker and demo/synthetic/ from wherever the folder is served
// (docs/adr/0030; docs/m5-phases.md 13.4).
// Usage: node scripts/smoke-dist.mjs <distDir>
// Exit 0: the Summary heading appeared; 2: no Chromium or no distDir; 1: anything else.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = 4174;
const PREFIX = '/nested/backcross/';
const TIMEOUT_MS = 60_000;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.vcf': 'text/plain',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

function fail(code, message) {
  console.error(`smoke-dist: ${message}`);
  process.exit(code);
}

const distArg = process.argv[2];
if (distArg === undefined) fail(2, 'usage: node scripts/smoke-dist.mjs <distDir>');
const distDir = resolve(distArg);
if (!existsSync(join(distDir, 'index.html'))) fail(2, `no index.html in ${distDir}`);

const chromePath = chromium.executablePath();
if (!existsSync(chromePath)) {
  fail(
    2,
    `no Chromium at ${chromePath}. Run "npx playwright install chromium"; ` +
      "on the maintainer's machine PLAYWRIGHT_BROWSERS_PATH must point at " +
      '%USERPROFILE%\\.cache\\ms-playwright (CLAUDE.md, "Environment gotchas").',
  );
}

/** The file under distDir that a request path names, or null for a 404. */
function fileFor(pathname) {
  if (!pathname.startsWith(PREFIX)) return null;
  let rel;
  try {
    rel = decodeURIComponent(pathname.slice(PREFIX.length));
  } catch {
    return null;
  }
  if (rel === '') rel = 'index.html';
  const file = resolve(distDir, rel);
  if (!file.startsWith(distDir + sep)) return null;
  if (!Object.hasOwn(MIME, extname(file))) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return file;
}

let requests = 0;
const server = createServer((req, res) => {
  requests++;
  const { pathname } = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const file = fileFor(pathname);
  if (file === null) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] });
  res.end(readFileSync(file));
});

async function main() {
  await new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(PORT, HOST, ok);
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    let workers = 0;
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
    });
    page.on('worker', () => {
      workers++;
    });
    const started = Date.now();
    await page.goto(`http://${HOST}:${PORT}${PREFIX}?demo=synthetic`);
    await page
      .getByRole('heading', { name: 'Dataset summary and QC' })
      .waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    const ms = Date.now() - started;
    if (workers === 0) throw new Error('no module worker started');
    if (errors.length > 0) throw new Error(errors[0]);
    console.log(`smoke-dist: ok (${ms} ms, ${requests} requests)`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  server.close();
  fail(1, err instanceof Error ? err.message : String(err));
});
