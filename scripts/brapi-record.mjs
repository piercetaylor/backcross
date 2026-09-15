#!/usr/bin/env node
/**
 * Records a few pages of a live BrAPI v2.1 server's /callsets, /variants and
 * /allelematrix responses to data/brapi-recorded/<YYYYMMDD-HHMMSS>/ (gitignored),
 * so the shapes of the fixture written by scripts/make-fixture.mjs can be
 * compared with what a real server returns. Shape check only: nothing recorded
 * here is ever copied into the repository. Not used by any test or by CI.
 *
 * Outputs: callsets.p<i>.json, variants.p<i>.json, allelematrix.v<i>.c<j>.json
 * (1-space JSON, LF), urls.txt (one URL per line, never the token) and
 * shape.txt (sorted top-level and `result` key lists per file).
 *
 * Usage (bash):
 *   node scripts/brapi-record.mjs <baseUrl> <variantSetDbId> [--variants-page-size N] [--callsets-page-size N] [--max-pages N]
 *   BRAPI_TOKEN=<token> in the environment adds Authorization: Bearer (never a CLI argument)
 * PowerShell: $env:BRAPI_TOKEN = '<token>' before running the same node command.
 *
 * Defaults: page sizes 13 (variants) and 5 (call sets), --max-pages 2 per list
 * dimension; --max-pages 1 still fetches allele-matrix page (0,0). Exits
 * non-zero on any non-2xx response, printing the URL and status.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE =
  'usage: node scripts/brapi-record.mjs <baseUrl> <variantSetDbId> [--variants-page-size N] [--callsets-page-size N] [--max-pages N]\n' +
  '       BRAPI_TOKEN=<token> in the environment adds Authorization: Bearer (never a CLI argument)';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const positional = [];
const opts = { variantsPageSize: 13, callSetsPageSize: 5, maxPages: 2 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const flag = {
    '--variants-page-size': 'variantsPageSize',
    '--callsets-page-size': 'callSetsPageSize',
    '--max-pages': 'maxPages',
  }[a];
  if (flag !== undefined) {
    const n = Number(argv[++i]);
    if (!Number.isInteger(n) || n < 1) fail(`${a} needs a positive integer\n${USAGE}`);
    opts[flag] = n;
  } else if (a.startsWith('--')) {
    fail(`unknown option ${a}\n${USAGE}`);
  } else {
    positional.push(a);
  }
}
if (positional.length !== 2) fail(USAGE);
const base = positional[0].trim().replace(/\/+$/, '');
if (!/^https?:\/\/\S+$/.test(base)) fail(`base URL must start with http:// or https://\n${USAGE}`);
const variantSetDbId = positional[1];
const token = (process.env.BRAPI_TOKEN ?? '').trim();

const stamp = new Date()
  .toISOString()
  .replace(/\.\d+Z$/, '')
  .replace(/[-:]/g, '')
  .replace('T', '-');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'brapi-recorded', stamp);
mkdirSync(OUT, { recursive: true });

const urls = [];
const shapes = [];

async function record(fileName, url) {
  urls.push(url);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) {
    writeFileSync(join(OUT, 'urls.txt'), urls.join('\n') + '\n');
    fail(`GET ${url} returned HTTP ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  writeFileSync(join(OUT, fileName), JSON.stringify(body, null, 1) + '\n');
  const top = body && typeof body === 'object' ? Object.keys(body).sort() : [];
  const result =
    body && typeof body.result === 'object' && body.result !== null
      ? Object.keys(body.result).sort()
      : [];
  shapes.push(`${fileName}\n  top: ${top.join(', ')}\n  result: ${result.join(', ')}`);
  return body;
}

const totalPagesOf = (x) => (Number.isInteger(x) && x >= 1 ? x : 1);

// Same paging rule as src/io/brapi.ts (spec section 3.3). /variants on
// test-server.brapi.org ignores `page` and honours `pageToken`, so a later
// /variants page sends pageToken=<nextPageToken> when the previous response gave
// one, else page=N&pageToken=N; a page repeating an earlier first variantDbId
// means the server ignored paging.
async function recordList(endpoint, pageSize) {
  let totalPages = 1;
  let nextPageToken = '';
  const seenIds = new Set();
  for (let p = 0; p < Math.min(totalPages, opts.maxPages); p++) {
    const params = [['variantSetDbId', variantSetDbId]];
    if (endpoint === 'variants' && p > 0 && nextPageToken !== '') {
      params.push(['pageToken', nextPageToken]);
    } else {
      params.push(['page', String(p)]);
      if (endpoint === 'variants' && p > 0) params.push(['pageToken', String(p)]);
    }
    params.push(['pageSize', String(pageSize)]);
    const q = new URLSearchParams(params);
    const body = await record(`${endpoint}.p${p}.json`, `${base}/${endpoint}?${q}`);
    const pagination = body?.metadata?.pagination;
    if (p === 0) totalPages = totalPagesOf(pagination?.totalPages);
    nextPageToken =
      typeof pagination?.nextPageToken === 'string' ? pagination.nextPageToken.trim() : '';
    if (endpoint === 'variants') {
      const data = Array.isArray(body?.result?.data) ? body.result.data : [];
      const firstId = data[0]?.variantDbId;
      if (typeof firstId === 'string' && seenIds.has(firstId)) {
        fail(`/variants page ${p} repeated an earlier page; the server ignored paging`);
      }
      for (const row of data)
        if (typeof row?.variantDbId === 'string') seenIds.add(row.variantDbId);
    }
  }
}

await recordList('callsets', opts.callSetsPageSize);
await recordList('variants', opts.variantsPageSize);

let pv = 1;
let pc = 1;
for (let v = 0; v < Math.min(pv, opts.maxPages); v++) {
  for (let c = 0; c < Math.min(pc, opts.maxPages); c++) {
    const q = new URLSearchParams({
      variantSetDbId,
      dataMatrixAbbreviations: 'GT',
      dimensionVariantPage: String(v),
      dimensionVariantPageSize: String(opts.variantsPageSize),
      dimensionCallSetPage: String(c),
      dimensionCallSetPageSize: String(opts.callSetsPageSize),
    });
    const body = await record(`allelematrix.v${v}.c${c}.json`, `${base}/allelematrix?${q}`);
    if (v === 0 && c === 0) {
      const pagination = Array.isArray(body?.result?.pagination) ? body.result.pagination : [];
      pv = totalPagesOf(pagination.find((d) => d?.dimension === 'VARIANTS')?.totalPages);
      pc = totalPagesOf(pagination.find((d) => d?.dimension === 'CALLSETS')?.totalPages);
    }
  }
}

writeFileSync(join(OUT, 'urls.txt'), urls.join('\n') + '\n');
writeFileSync(join(OUT, 'shape.txt'), shapes.join('\n') + '\n');
console.log(`recorded ${urls.length} responses to ${OUT}`);
