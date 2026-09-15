# M3 phase 4: BrAPI allele-matrix loader — implementation spec

Save as `docs/m3-phase4-brapi.md`. Written 2026-09-15 from `CLAUDE.md`, `docs/handoff-m3-phases-4-5.md` (decisions 1, 2, 4 final), `docs/m3-phases.md` (lines 1–58, 223–271, 296–320) and the code as of contract 1.2.0. Everything the doer needs is here; where this spec refines m3-phases.md it says so in section A (conflicts). Section B holds the questions the maintainer answers **before dispatch**; each carries the answer this spec assumes, so the doer changes nothing unless an answer differs.

Rules carried over unchanged: no `contract/` change (verified: `contract/data-contract.md:83-85` holds only the class-code labels; outputs live in `docs/data-formats.md`, so `contract/VERSION` stays 1.2.0 and `tests/contract-cases.test.ts:140` keeps finding `version 1.2.0` in data-formats.md); no real genotype data; `tests/fixtures/brapi/` generated only by `scripts/make-fixture.mjs` and under 64 KB; `tests/fixtures/synthetic/` unchanged and under 200 KB; never run git; no AI attribution.

---

## 0. Fixed facts the doer relies on

| fact                                                                                                                                                                                                                     | where                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Worker owns the matrix; `fetch` lives only in `src/io/brapi.ts` and is called from the worker                                                                                                                            | m3-phases invariants 1–2, ADR 0001 |
| `GenotypeBuilder.push(id, chromRaw, posBp, alleleSymbols)` normalises chrom, rejects non-finite/negative pos, stores `alleleSymbols` **by reference**; `setCall` ignores a pair with a MISSING member and sorts the pair | `src/io/builder.ts:58-101`         |
| `assembleDataset(parsed, samples, markerMap?)` applies the map itself (`applyMarkerMap`), drops unlisted columns with a warning, throws `samples.csv lists sample(s) absent from the genotype file: …`                   | `src/io/loaders.ts:155-228`        |
| `parseMarkerMap` (1.2.0 grammar) returns `Map<marker_id, {chrom (normalised), posBp, cm}>`                                                                                                                               | `src/io/markers.ts:25-48`          |
| `loaded` already carries `warnings: string[]`                                                                                                                                                                            | `src/workers/protocol.ts:139`      |
| `tsconfig`: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` — optional fields are added by conditional spread, never `x: undefined`                                                                             | `tsconfig.json:10,12`              |
| `.prettierignore` excludes `tests/fixtures/`; `.gitattributes` forces LF; `.gitignore:19` already ignores `data/` (no change needed)                                                                                     | those files                        |
| Vitest projects: `node` = `tests/**` minus `tests/browser/**`, `tests/bench/**`; `browser` = `tests/browser/**` in Chromium and Firefox                                                                                  | `vite.config.ts:85-106`            |
| Lint gate on `src/App.tsx`, `src/ui/**/*.tsx` bans colour and px literals only (text labels are fine)                                                                                                                    | `eslint/ui-literal-selectors.json` |
| `BrAPI` test server: `https://test-server.brapi.org/brapi/v2`, variant set `variantset1`; returns `null` `referenceName`/`start`/`referenceBases`; `sepPhased`/`sepUnphased` the reverse of VCF                          | m3-phases resolution 6             |

---

## 1. File list

### Create

| file                                          | purpose                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/io/brapi.ts`                             | BrAPI v2.1 client: paging, joins, `parseBrapiCall`, sample-id rule, errors                |
| `src/export/callsets-csv.ts`                  | call-set table CSV                                                                        |
| `src/export/sample-ids.ts`                    | the two external-id cells every exporter writes                                           |
| `src/ui/download.ts`                          | `downloadText` (moved out of ExportScreen)                                                |
| `scripts/brapi-record.mjs`                    | live recorder to `data/brapi-recorded/` (decision 2)                                      |
| `tests/brapi.test.ts`                         | node: loader, pagination, ids, errors, fixture size                                       |
| `tests/export-ids.test.ts`                    | node: the new columns in every exporter                                                   |
| `tests/support/brapi-fixture.ts`              | maps a request URL to a fixture file; shared by the node test and the mock server         |
| `tests/support/brapi-mock-plugin.ts`          | Vite `configureServer` middleware serving the fixture under `/__brapi__` for browser mode |
| `tests/browser/brapi-upload.test.tsx`         | browser: the Source switch and an end-to-end BrAPI load through the worker                |
| `tests/fixtures/brapi/*.json` (9 files)       | generated by `scripts/make-fixture.mjs`, never edited                                     |
| `docs/adr/0015-brapi-allele-matrix-loader.md` | MADR                                                                                      |

### Modify

`src/core/types.ts`, `src/workers/protocol.ts`, `src/workers/client.ts`, `src/workers/analysis.worker.ts`, `src/export/summary-csv.ts`, `src/export/segments-csv.ts`, `src/export/targets-csv.ts`, `src/export/pairwise-csv.ts`, `src/export/report.ts`, `src/cli.ts`, `src/ui/screens/UploadScreen.tsx`, `src/ui/screens/ExportScreen.tsx`, `src/ui/screens/screens.css`, `src/ui/lines/LineActionBar.tsx` (export `LineRadio`), `src/App.tsx`, `scripts/make-fixture.mjs`, `vite.config.ts`, `package.json`, `tests/support/app-harness.tsx`, `tests/smoke.test.ts`, `tests/fixture-segments.test.ts`, `tests/fixture-targets.test.ts`, `tests/fixture-compare.test.ts`, `tests/report.test.ts`, `docs/data-formats.md`, `docs/reference-repos.md`, `docs/m3-phases.md`, `CHANGELOG.md`, `PLAN.md`, `CLAUDE.md`.

Not touched: `src/io/calls.ts`, `src/io/position.ts`, `src/io/loaders.ts`, `src/io/builder.ts`, `src/io/markers.ts`, anything under `src/core/` except the two optional fields in `types.ts`, `contract/**`, `tests/support/normalise.ts`, `.gitignore`.

---

## 2. Types and signatures

### 2.1 `src/core/types.ts`

Add to `SampleRecord` (after `notes`):

```ts
  /** BrAPI call set this sample was loaded from (docs/data-formats.md, "BrAPI allele matrix"); absent for file-loaded datasets. */
  callSetDbId?: string;
  sampleDbId?: string;
```

Nothing else in `src/core/` changes.

### 2.2 `src/io/brapi.ts` (new)

Header comment states: responsibility (fetch a variant set's call sets, variants and GT allele matrix from a BrAPI v2.1 server into a `ParsedGenotypes` through `GenotypeBuilder`, inside the worker; the only module that calls `fetch`), that it never routes cells through `calls.ts` nor positions through `position.ts`, and the interface below.

```ts
import { MISSING_ALLELE } from '../core/types.ts';
import type { SampleRecord } from '../core/types.ts';
import { GenotypeBuilder } from './builder.ts';
import type { ParsedGenotypes } from './builder.ts';
import type { MarkerMap } from './markers.ts';

export interface BrapiSource {
  /** e.g. https://host/brapi/v2; trimmed, trailing slashes stripped by normaliseBaseUrl. */
  baseUrl: string;
  variantSetDbId: string;
  /** Bearer token; trimmed; empty or absent = no Authorization header. Never echoed anywhere. */
  token?: string;
  /** Page sizes for /variants and /callsets; the same two numbers are the /allelematrix dimension page sizes. */
  pageSize?: { variants: number; callSets: number };
}
export const BRAPI_DEFAULT_PAGE_SIZE = { variants: 1000, callSets: 500 } as const;
export const BRAPI_REQUEST_TIMEOUT_MS = 60_000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface BrapiFetchOptions {
  /** Aborts the whole load; the error is kind 'brapi.cancelled'. */
  signal?: AbortSignal;
  /** Per request, not per load. Default BRAPI_REQUEST_TIMEOUT_MS. */
  requestTimeoutMs?: number;
}

export interface BrapiCallSet {
  /** The sample_id this call set is loaded under (section 4.1). */
  sampleId: string;
  /** '' when the server omitted it. */
  callSetName: string;
  callSetDbId: string;
  /** '' when the server omitted it. */
  sampleDbId: string;
}

export interface BrapiGenotypes extends ParsedGenotypes {
  /** In /callsets order, which is genotypes.sampleIds order. */
  callSets: BrapiCallSet[];
  /** GenotypeBuilder.peakBytes. */
  peakBuilderBytes: number;
}

export type BrapiErrorKind =
  | 'brapi.bad_url'
  | 'brapi.network'
  | 'brapi.http'
  | 'brapi.not_json'
  | 'brapi.bad_shape'
  | 'brapi.timeout'
  | 'brapi.cancelled'
  | 'brapi.no_call_sets'
  | 'brapi.no_variants'
  | 'brapi.no_gt_matrix'
  | 'brapi.unknown_id'
  | 'brapi.invalid_call'
  | 'brapi.no_position';

export class BrapiError extends Error {
  readonly kind: BrapiErrorKind;
  constructor(kind: BrapiErrorKind, message: string);
}

export function normaliseBaseUrl(raw: string): string;
export function parseBrapiCall(
  token: string,
  sepPhased: string,
  sepUnphased: string,
  unknown: string,
): [number, number];
export function assignSampleIds(
  raw: { callSetName: string; callSetDbId: string; sampleDbId: string }[],
): { callSets: BrapiCallSet[]; warnings: string[] };
export function attachCallSetIds(samples: SampleRecord[], callSets: BrapiCallSet[]): SampleRecord[];
export async function fetchBrapiCallSets(
  source: BrapiSource,
  fetchImpl: FetchLike,
  options?: BrapiFetchOptions,
): Promise<{ callSets: BrapiCallSet[]; warnings: string[] }>;
export async function fetchBrapiGenotypes(
  source: BrapiSource,
  fetchImpl: FetchLike,
  markerMap?: MarkerMap,
  options?: BrapiFetchOptions,
): Promise<BrapiGenotypes>;
```

`BrapiErrorKind` is deliberately **not** added to `tests/support/normalise.ts` `ErrorKind`: those are the shared contract's kinds and BrAPI is outside the contract.

### 2.3 `src/workers/protocol.ts`

Add to `WorkerRequest`:

```ts
  | {
      id: number;
      /** BrAPI load (docs/adr/0015): the worker fetches; samples.csv and markers.csv as for 'load'. */
      type: 'loadBrapi';
      payload: { source: BrapiSource; samples: ArrayBuffer; markers?: ArrayBuffer };
    }
  | {
      id: number;
      /** Pages /callsets only, so the Upload screen can offer the call-set table before a samples.csv exists. */
      type: 'brapiCallSets';
      payload: { source: BrapiSource };
    }
  | {
      id: number;
      /** Handled out of band in onmessage, not queued: aborts the in-flight BrAPI fetch, if any. */
      type: 'cancelBrapi';
      payload: Record<string, never>;
    }
```

Add exported type and two fields on `loaded`:

```ts
export type DatasetSource =
  | { kind: 'files'; genotypeFileName: string }
  | { kind: 'brapi'; baseUrl: string; variantSetDbId: string }; // baseUrl normalised; never the token
```

`loaded` gains `source: DatasetSource;` after `residentMatrixBytes`. Add to `WorkerResult`:

```ts
  | { type: 'brapiCallSets'; callSets: BrapiCallSet[]; warnings: string[] }
  | { type: 'cancelBrapi' }
```

Import `import type { BrapiCallSet, BrapiSource } from '../io/brapi.ts';` (type-only). Update the header comment (the two new requests; `loaded.source`).

### 2.4 `src/workers/client.ts`

Line 26: `type ResultTypeFor<T extends RequestType> = T extends 'load' | 'loadBrapi' ? 'loaded' : T;` and the comment above it.

### 2.5 Exporters (exact new signatures)

```ts
// src/export/sample-ids.ts
/** The two cells every export writes after its sample id column(s): csvField(callSetDbId ?? ''), csvField(sampleDbId ?? ''). Unknown sample id -> two empty cells. */
export function externalIdCells(samples: SampleRecord[]): (sampleId: string) => [string, string];

// src/export/summary-csv.ts
export function lineSummaryCsv(
  lines: LineRpp[],
  chromosomeOrder: string[],
  samples: SampleRecord[],
): string;
// src/export/segments-csv.ts
export function segmentsCsv(
  segments: DonorSegment[],
  gapCriterion: GapCriterion,
  samples: SampleRecord[],
): string;
// src/export/targets-csv.ts
export function targetsCsv(checks: TargetCheck[], samples: SampleRecord[]): string;
// src/export/pairwise-csv.ts
export function pairwiseCsv(
  diffs: PairwiseDiff[],
  chromosomeOrder: string[],
  samples: SampleRecord[],
): string;
export function discordantMarkersCsv(
  diffs: PairwiseDiff[],
  dataset: Dataset,
  cls: Classification,
): string; // unchanged; reads dataset.samples
// src/export/callsets-csv.ts
export const CALLSETS_CSV_HEADER = [
  'sample_id',
  'call_set_name',
  'call_set_db_id',
  'sample_db_id',
] as const;
export function callSetsCsv(callSets: BrapiCallSet[]): string;
// src/export/report.ts
export interface ReportDataset {
  nMarkers;
  nChromosomes;
  hasCm;
  samples;
  /** new, optional: */ source?: string;
}
```

`SEGMENTS_CSV_HEADER`, `TARGETS_CSV_HEADER`, `PAIRWISE_CSV_HEADER`, `DISCORDANT_MARKERS_CSV_HEADER` constants are updated to the strings in section 4.3.

### 2.6 `src/ui/download.ts`

```ts
/** Downloads `content` as `filename` through a Blob URL created and revoked on the main thread; nothing is uploaded. */
export function downloadText(filename: string, content: string, mime: string): void;
```

Body is `ExportScreen.tsx:72-82` verbatim; ExportScreen imports it.

### 2.7 `src/ui/screens/UploadScreen.tsx` props

```ts
export type LoadPayload = Extract<WorkerRequest, { type: 'load' }>['payload'];
export type BrapiLoadPayload = Extract<WorkerRequest, { type: 'loadBrapi' }>['payload'];
export type LoadRequest =
  | { type: 'load'; payload: LoadPayload }
  | { type: 'loadBrapi'; payload: BrapiLoadPayload };

props: {
  params; onParamsChange; busy; loaded;                 // as today
  onLoad: (request: LoadRequest) => void;               // was (payload: LoadPayload)
  onFetchCallSets: (source: BrapiSource) => Promise<{ callSets: BrapiCallSet[]; warnings: string[] }>;
  onCancelBrapi: () => void;
  /** True from a loadBrapi dispatch until its 'loaded' or error; shows the Cancel button. */
  brapiLoading: boolean;
}
```

---

## 3. BrAPI flow (`src/io/brapi.ts`)

### 3.1 URL and headers

- `normaliseBaseUrl(raw)`: `raw.trim().replace(/\/+$/, '')`; must match `/^https?:\/\/\S+$/` else `BrapiError('brapi.bad_url', 'BrAPI: base URL must start with http:// or https://')`. Empty `variantSetDbId.trim()` → `BrapiError('brapi.bad_url', 'BrAPI: variant set id is required')`.
- URLs are built with `URLSearchParams` in this exact parameter order:
  - `${base}/callsets?variantSetDbId=…&page=${p}&pageSize=${callSets}`
  - `${base}/variants?variantSetDbId=…&page=${p}&pageSize=${variants}` for page 0; later pages follow the token rule of section 3.3
  - `${base}/allelematrix?variantSetDbId=…&dataMatrixAbbreviations=GT&dimensionVariantPage=${i}&dimensionVariantPageSize=${variants}&dimensionCallSetPage=${j}&dimensionCallSetPageSize=${callSets}`
- Every request: `{ method: 'GET', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, mode: 'cors', credentials: 'omit', signal }`. The token appears in no URL, error message, warning, result or log.
- `signal`: `const timeout = AbortSignal.timeout(requestTimeoutMs)`; `options.signal ? AbortSignal.any([options.signal, timeout]) : timeout` (Node 22, Chromium 116+, Firefox 124+ all have `AbortSignal.any`).

### 3.2 One request, one error mapping (`getJson(url)`)

| condition                                                                                                | kind              | message (exact prefix)                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchImpl` throws and `options.signal?.aborted`                                                         | `brapi.cancelled` | `BrAPI: load cancelled`                                                                                                                                                                                                                                                           |
| `fetchImpl` throws and `timeout.aborted`                                                                 | `brapi.timeout`   | `BrAPI: GET ${url} did not respond within ${requestTimeoutMs / 1000} s`                                                                                                                                                                                                           |
| `fetchImpl` throws otherwise (CORS and network failures are both a `TypeError` and cannot be told apart) | `brapi.network`   | `BrAPI: could not reach ${url} (${e.message}). Either the server is unreachable or it does not allow this app's origin: it must answer with Access-Control-Allow-Origin for this origin and, when an access token is used, allow the Authorization header in its CORS preflight.` |
| `!response.ok`                                                                                           | `brapi.http`      | `BrAPI: GET ${url} returned HTTP ${status}${statusText ? ' ' + statusText : ''}` + (`status === 401 \|\| status === 403` ? `; check the access token` : ``)                                                                                                                       |
| `response.json()` rejects                                                                                | `brapi.not_json`  | `BrAPI: GET ${url} did not return JSON`                                                                                                                                                                                                                                           |
| body is not an object with an object `result`                                                            | `brapi.bad_shape` | `BrAPI: GET ${url}: response has no result object`                                                                                                                                                                                                                                |

### 3.3 Pagination (list endpoints)

`totalPages = body.metadata?.pagination?.totalPages`; if not a finite integer ≥ 1 it is taken as 1. Pages `0 … totalPages-1`; `result.data` must be an array (else `brapi.bad_shape`, `…: result.data is not an array`); an empty page after page 0 ends the loop early. Rows are concatenated in page order.

`/callsets` pages by `page=N`. `/variants` uses the token rule, because test-server.brapi.org ignores `page` there and returns page 0 again, while it honours `pageToken=<page number>` and answers an empty `nextPageToken` (confirmed against the recording `data/brapi-recorded/20260915-165601`, 2026-09-15; `/callsets` and `/allelematrix` page correctly by number):

- page 0 sends no token (`variantSetDbId=…&page=0&pageSize=…`);
- each later page sends `pageToken=<nextPageToken>` (`variantSetDbId=…&pageToken=…&pageSize=…`) when the previous response's `metadata.pagination.nextPageToken` was a non-empty string, otherwise both (`variantSetDbId=…&page=N&pageToken=N&pageSize=…`);
- the loop stops at `totalPages` read from page 0;
- if a page's first `variantDbId` was already seen on an earlier page, throw `brapi.bad_shape` `BrAPI: /variants page N repeated an earlier page; the server ignored paging`.

`scripts/brapi-record.mjs` follows the same rule, and the test fixture resolver (`tests/support/brapi-fixture.ts`) models the server: `/variants` ignores `page`, selects by `pageToken`, and the fixture pages carry an empty `nextPageToken`.

### 3.4 Call sets

For each row: `callSetDbId` must be a non-empty string (else `brapi.bad_shape`: `BrAPI: /callsets row ${i} has no callSetDbId`); `callSetName` and `sampleDbId` read as trimmed strings, `''` when absent or not strings. Duplicate `callSetDbId` across pages → `brapi.bad_shape` naming it. No rows → `brapi.no_call_sets`: `BrAPI: variant set ${id} has no call sets`. Then `assignSampleIds` (section 4.1).

### 3.5 Variants

For each row:

- `variantDbId` non-empty string (else `brapi.bad_shape`: `BrAPI: /variants row ${i} has no variantDbId`).
- **marker id** = `variantNames` when it is a non-empty trimmed string (Breedbase emits a scalar), or the first non-empty trimmed string when it is an array (Gigwa, Germinate, test server); a name equal to `.` (the VCF missing-ID token) counts as absent; otherwise `variantDbId` (question B5).
- **position**: `referenceName` a non-empty string and `start` a finite integer ≥ 0 → `chrom = referenceName`, `pos = start + 1` (BrAPI `start` is 0-based). Otherwise the variant is _unpositioned_: if `markerMap?.get(markerId)` exists → `chrom = entry.chrom`, `pos = entry.posBp`; else throw `BrapiError('brapi.no_position', `BrAPI: variant "${markerId}" (${variantDbId}) has no referenceName or start; supply its chrom and pos_bp in markers.csv`)` — the first such variant in page order.
- **alleles**: `referenceBases` a non-empty string → `[referenceBases, ...alternateBases.filter(non-empty strings)]` (`alternateBases` absent → `[referenceBases]`). Otherwise `symbols = []` (the array object is kept and filled at finish, section 3.7).
- `builder.push(markerId, chrom, pos, symbols)`; duplicate marker id throws the builder's `duplicate marker id: …` (plain `Error`, acceptable). No rows → `brapi.no_variants`: `BrAPI: variant set ${id} has no variants`.
- Keep `offsetByVariantDbId: Map<string, number>`, `symbolsByOffset`, `basesKnownByOffset: boolean`, `maxIndexByOffset: number` (−1 initially), `seenInMatrix: Set<variantDbId>`.

All variants are pushed here, after `/variants`, before any matrix page (refines m3-phases:229 "pushed once, at call-set page 0"; behaviour is identical, the offset is simply known earlier).

### 3.6 Allele matrix

`builder = new GenotypeBuilder(callSets.map(c => c.sampleId))` (a duplicate would have been caught in `assignSampleIds`). `colByCallSetDbId: Map<string, number>`.

- Fetch `(v=0, c=0)` first; read `result.pagination` (array; entries with `dimension === 'VARIANTS'` and `'CALLSETS'`; `totalPages` each defaulting to 1 as in 3.3). Loop `v` outer `0…Pv-1`, `c` inner `0…Pc-1`, skipping the refetch of `(0,0)`.
- Per page: `matrices = result.dataMatrices` array; `gt = matrices.find(m => m.dataMatrixAbbreviation === 'GT')` else `brapi.no_gt_matrix`: `BrAPI: /allelematrix page ${v},${c} has no GT data matrix`. Separators: `sepPhased = nonEmptyString(result.sepPhased) ?? '|'`, `sepUnphased = nonEmptyString(result.sepUnphased) ?? '/'`, `unknown = nonEmptyString(result.unknownString) ?? '.'` (read per page; nothing assumed).
- `variantDbIds`, `callSetDbIds` arrays of strings; `gt.dataMatrix.length === variantDbIds.length` and every row length `=== callSetDbIds.length`, else `brapi.bad_shape`: `BrAPI: /allelematrix page ${v},${c}: dataMatrix is ${rows} x ${cols}, expected ${nv} x ${nc}`.
- Row `i`: `offset = offsetByVariantDbId.get(variantDbIds[i])`, else `brapi.unknown_id`: `BrAPI: /allelematrix names variant "${id}" that /variants did not list`. Add to `seenInMatrix`. Column `j`: `col = colByCallSetDbId.get(callSetDbIds[j])`, else `brapi.unknown_id`: `BrAPI: /allelematrix names call set "${id}" that /callsets did not list`.
- Cell: `null`/`undefined` → missing; non-string → `brapi.bad_shape`; else `[x, y] = parseBrapiCall(cell, sepPhased, sepUnphased, unknown)` (wrap its error into `brapi.invalid_call` with `BrAPI: variant "${markerId}", call set "${callSetDbId}": ${inner message}`). If `x === MISSING_ALLELE` skip. If bases known and `y >= symbols.length` → `brapi.invalid_call`: `BrAPI: variant "${markerId}": allele index ${y} but only ${symbols.length} allele(s) listed`. Else track `maxIndexByOffset`. `builder.setCall(offset, col, x, y)`.

### 3.7 Finish

- For every variant with bases unknown: `symbols.push(...Array.from({ length: maxIndex + 1 }, (_, k) => String(k)))` (`[]` if no call was seen).
- Variants never seen in any matrix page: `n > 0` → warning `BrAPI: ${n} variant(s) absent from every /allelematrix page were loaded with all calls missing: ${first five ids}${n > 5 ? ', ...' : ''}`.
- `parsed = builder.finish()`; return `{ ...parsed, coded: false, warnings: [...assignSampleIds warnings, ...parsed.warnings, ...matrix warnings], callSets, peakBuilderBytes: builder.peakBytes }`.

### 3.8 `parseBrapiCall(token, sepPhased, sepUnphased, unknown): [number, number]`

Grammar, in order:

1. `t = token.trim()`; `t === '' || t === unknown` → `[MISSING_ALLELE, MISSING_ALLELE]`.
2. `hasP = sepPhased !== '' && t.includes(sepPhased)`, `hasU = sepUnphased !== '' && t.includes(sepUnphased)`. Both → `Error('invalid GT token "…": both separators present')`. Neither → haploid: one part, read as homozygous.
3. Split on the present separator; more than two parts → `Error('invalid GT token "…": calls are diploid')`.
4. Each part: `=== unknown || === '.'` → `MISSING_ALLELE`; else must match `/^\d+$/` → `Number(part)`; else `Error('invalid GT token "…"')`.
5. Either allele missing → whole call missing `[255, 255]` (matches VCF: `vcf.ts:119-131` plus `builder.setCall`).
6. Return ascending `[min, max]` (so `('1|0','/','|','.')` → `[0, 1]`, as m3-phases:268 requires). Haploid `'1'` → `[1, 1]`.

Values > 254 are rejected by `builder.setCall`.

### 3.9 `fetchBrapiCallSets`

Sections 3.1–3.4 only; returns `{ callSets, warnings }`.

### 3.10 `attachCallSetIds(samples, callSets)`

`byId = new Map(callSets.map(c => [c.sampleId, c]))`; `samples.map(s => { const c = byId.get(s.sampleId); return c === undefined ? s : { ...s, callSetDbId: c.callSetDbId, sampleDbId: c.sampleDbId }; })`. A manifest sample not in the call sets is left as is; `assembleDataset` then fails with its existing message (`loaders.ts:184`, "absent from the genotype file") — kept as is; the data-formats.md section explains that "genotype file" means the variant set for BrAPI (conflict A11).

---

## 4. Decision 1 in full

### 4.1 `sample_id` rule (`assignSampleIds`)

1. `name = callSetName.trim()`.
2. Count names over all call sets. A call set whose name is non-empty **and** occurs exactly once → `sampleId = name`.
3. Otherwise (empty name, or name shared by ≥ 2 call sets) → `sampleId = callSetDbId`.
4. One warning per shared name, in first-occurrence order: `BrAPI: ${n} call sets share the name "${name}"; their sample_id is the callSetDbId: ${dbIds.join(', ')}`. Empty names produce no warning.
5. If the resulting `sampleId`s are not unique (a name equals another call set's `callSetDbId`) → `BrapiError('brapi.bad_shape', `BrAPI: sample ids are not unique after falling back to callSetDbId: ${dups.join(', ')}`)`.

Replicates: each call set is its own `sample_id`; `samples.csv` gives them the same `line_name`; nothing merges (Q3).

### 4.2 Call-set table CSV

- Module `src/export/callsets-csv.ts`; header `sample_id,call_set_name,call_set_db_id,sample_db_id`; one row per call set in `/callsets` order; `csvField` on every cell; `\n` line ends, trailing newline. (Adds `sample_id` to the decision's three columns so `samples.csv` can be written from it by adding the required `role` column: question B4.)
- Filename `brapi-callsets.csv`, MIME `text/csv`.
- Produced on the **main thread** in the Upload screen (`downloadText(…, callSetsCsv(callSets), 'text/csv')`) from the `brapiCallSets` worker result. It names no marker and no genotype, so CLAUDE.md's worker rule does not apply; the fetch itself is in the worker (invariant 1).
- Offered **before** load: the "Download call-set table" button is enabled as soon as Base URL and Variant set id are non-empty, because `samples.csv` is required to load and this table is how it is built.

### 4.3 The two columns in every export

Placement: immediately after the sample id column(s) (question B1). Empty value for file-loaded datasets and for a sample the worker cannot resolve: the empty string, written bare (`csvField('')` is `''`), never `""`, so `data.table::fread` reads it as NA too (question B2; `readr::read_csv` reads `""` as `NA` by default, and `NA` stays the marker for numeric NaN).

| export                      | new header, exact                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| per-line summary            | `sample_id,call_set_db_id,sample_db_id,n_informative,n_called,n_rp_hom,n_donor_hom,n_het,n_missing,n_nonparental,rpp_count,rpp_bp,rpp_cm,rpp_count_Gm01,…` (wide block unchanged, still last)                                                                         |
| segments                    | `sample_id,call_set_db_id,sample_db_id,chrom,start_bp,end_bp,left_flank_bp,right_flank_bp,n_markers,n_donor_hom,n_het,class,start_cm,end_cm,length_bp,length_cm,gap_criterion`                                                                                        |
| target check                | `sample_id,call_set_db_id,sample_db_id,target,chrom,start_bp,end_bp,status,n_informative_in_region,segment_start_bp,segment_end_bp,drag_min_bp,drag_max_bp`                                                                                                           |
| pairwise summary            | `sample_a,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,mode,chrom,n_compared,n_discordant`                                                                                                                                                |
| discordant markers (worker) | `sample_a,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,marker_id,chrom,pos_bp,class_a,class_b`                                                                                                                                            |
| call-set table              | `sample_id,call_set_name,call_set_db_id,sample_db_id`                                                                                                                                                                                                                 |
| HTML report                 | `Lines` and `Per-line quality control` tables gain `call_set_db_id`, `sample_db_id` after `sample_id` **only when** `dataset.samples.some(s => s.callSetDbId !== undefined)`; the dataset summary gains a `Source` row when `dataset.source` is defined (question B3) |

Report `Source` text (built in ExportScreen from `loaded.source`): files → `Genotype file ${genotypeFileName}`; BrAPI → `BrAPI variant set ${variantSetDbId} from ${baseUrl.replace(/^https?:\/\//, '')}` — scheme stripped because `tests/report.test.ts:77-78` asserts the report contains no `http://`/`https://`.

`pairwise-csv.ts:9-10` header comment is rewritten: "These column names are documented in docs/data-formats.md; a change there is a user-visible output change (CHANGELOG) and needs the maintainer's approval (CLAUDE.md)."

CLI (`src/cli.ts:135,155,158`): pass `dataset.samples`; a CLI dataset is always file-loaded, so the cells are empty.

### 4.4 `docs/data-formats.md` edits (exact)

1. Line 3 becomes: `This document holds what is this repository's own: the platforms, target regions, analysis parameters, the BrAPI source and every output. The input file contract is `contract/data-contract.md`, shared with progeny-selector (contract/README.md gives the version rules). Validation happens once, at the boundary in src/io/ (`loaders.ts`for files,`brapi.ts` for a BrAPI server); error messages quote the offending file, line and column, or the BrAPI URL.`
2. After the "Input contract" section (keep its `version 1.2.0` text unchanged), insert:

```
## BrAPI allele matrix (isoline-browser only, outside the shared contract)

A variant set can be loaded from a BrAPI v2.1 server (Genotyping module) instead of a genotype file; `samples.csv` and `markers.csv` are supplied exactly as for a file. The worker fetches, in this order and page by page, `GET {baseUrl}/callsets?variantSetDbId=`, `GET {baseUrl}/variants?variantSetDbId=` and `GET {baseUrl}/allelematrix?variantSetDbId=&dataMatrixAbbreviations=GT` over both dimensions (variant pages outer, call-set pages inner), and joins every matrix cell to its variant and call set by `variantDbId` and `callSetDbId`, never by position in the page. Each response's `sepPhased`, `sepUnphased` and `unknownString` are honoured; phasing is ignored; a token without a separator is a haploid call read as homozygous; a token with more than two alleles is an error (calls are diploid); a token with one missing allele is a missing call.

- `sample_id` is the call set's `callSetName` when it is present and unique within the variant set, else its `callSetDbId`; colliding names fall back to the DbId with a warning naming them. Each call set is one `sample_id`; replicates are given the same `line_name` in samples.csv. The call-set table (`brapi-callsets.csv`, below) is offered from the Upload screen so samples.csv is built from real values. `callSetDbId` and `sampleDbId` are kept and written into every export.
- `marker_id` is the first entry of `variantNames`, else `variantDbId`.
- `pos_bp = start + 1` (BrAPI `start` is 0-based) and `chrom = referenceName`, normalised as for files. A variant without `referenceName` or `start` takes both from markers.csv; if markers.csv does not list it, the load fails naming the marker. markers.csv otherwise overrides positions exactly as for a file.
- Allele symbols are `referenceBases` then `alternateBases`; when `referenceBases` is absent the symbols are the allele indices as text (`0`, `1`, …).
- Authentication: an optional bearer token, sent as `Authorization: Bearer <token>` on every request, kept only in the page's memory and never written anywhere.
- The server must allow this application's origin (CORS: `Access-Control-Allow-Origin`, and the `Authorization` header in the preflight when a token is used). A CORS refusal and a network failure look the same to the browser; the error says so.
- Each request times out after 60 s; a load can be cancelled from the Upload screen.
- Not supported: other authentication schemes, `/samples` and `/germplasm` lookups (a Gigwa import may auto-generate `callSetName`; the call-set table is the mitigation), polyploid calls.
```

3. Under `## Outputs`, add before the per-line summary: `Every table below carries `call_set_db_id`and`sample_db_id`(the BrAPI call set behind the sample; empty for a dataset loaded from a file) immediately after its sample id column(s); the pairwise tables carry them for both samples, suffixed`_a`and`_b`.` Then replace each column list with the exact header from 4.3, and add:

```
### Call-set table CSV (implemented)

`sample_id, call_set_name, call_set_db_id, sample_db_id`, one row per call set of the variant set in server order, downloadable from the Upload screen before a load (`brapi-callsets.csv`), so `samples.csv` is written from the ids the server actually uses.
```

4. HTML report paragraph: append `When the dataset came from a BrAPI server, the dataset summary names the variant set and server, and the per-line tables carry `call_set_db_id`and`sample_db_id`.`

---

## 5. Worker (`src/workers/analysis.worker.ts`)

1. Imports: `attachCallSetIds, fetchBrapiCallSets, fetchBrapiGenotypes, normaliseBaseUrl` and type `BrapiGenotypes` from `../io/brapi.ts`; type `DatasetSource` from `./protocol.ts`.
2. Module state: `let brapiAbort: AbortController | null = null;` and `const fetchImpl: FetchLike = (url, init) => fetch(url, init);` (never pass bare `fetch`).
3. Extract the `loaded` construction of `case 'load'` (lines 115-135) into
   `function loadedResult(id: number, out: { dataset: Dataset; warnings: string[] }, extra: { bytesInflated: number; peakBuilderBytes: number; source: DatasetSource }): WorkerResponse` which also assigns the module `dataset`, `classification`, `lastRpp = null`. `case 'load'` passes `source: { kind: 'files', genotypeFileName: p.genotypeFileName }`.
4. `case 'loadBrapi'`:
   ```ts
   const p = req.payload;
   const samples = parseSampleManifest(decoder.decode(p.samples)); // before any network
   const map = p.markers === undefined ? undefined : parseMarkerMap(decoder.decode(p.markers));
   brapiAbort = new AbortController();
   let parsed: BrapiGenotypes;
   try {
     parsed = await fetchBrapiGenotypes(p.source, fetchImpl, map, { signal: brapiAbort.signal });
   } finally {
     brapiAbort = null;
   }
   const out = assembleDataset(parsed, attachCallSetIds(samples, parsed.callSets), map);
   return loadedResult(req.id, out, {
     bytesInflated: 0,
     peakBuilderBytes: parsed.peakBuilderBytes,
     source: {
       kind: 'brapi',
       baseUrl: normaliseBaseUrl(p.source.baseUrl),
       variantSetDbId: p.source.variantSetDbId.trim(),
     },
   });
   ```
5. `case 'brapiCallSets'`: same abort handling; `const r = await fetchBrapiCallSets(req.payload.source, fetchImpl, { signal })`; result `{ type: 'brapiCallSets', callSets: r.callSets, warnings: r.warnings }`.
6. `case 'cancelBrapi'` inside `handle`: returns `{ id, ok: true, result: { type: 'cancelBrapi' } }` (reached only if it was queued; see 7).
7. `self.onmessage`: before queueing, `if (req.type === 'cancelBrapi') { brapiAbort?.abort(); self.postMessage({ id: req.id, ok: true, result: { type: 'cancelBrapi' } } satisfies WorkerResponse); return; }`.
8. `transferablesFor`: add `'brapiCallSets'` and `'cancelBrapi'` to the `return []` group.
9. Header comment: add the BrAPI path, the out-of-band cancel, and that `bytesInflated` is 0 for BrAPI.

`loaded` from BrAPI: `bytesInflated: 0`, `peakBuilderBytes` from the builder, `residentMatrixBytes` as for `load` (m3-phases:230).

---

## 6. UI

### 6.1 `src/ui/lines/LineActionBar.tsx`

Export `LineRadio` next to `LineCheckbox` (line 96): a `Radio` with `className="line-radio"`, `<CheckIndicator />` and `children`; the density radios use it. No CSS change (`lines.css:118-136` already styles `.line-radio`).

### 6.2 `src/ui/screens/UploadScreen.tsx`

State: `source: 'files' | 'brapi'` (default `'files'`), `baseUrl`, `variantSetDbId`, `token` (strings, default `''`), `callSetsError: string | null`, `callSetsWarnings: string[]`.

Markup order inside the `<section>`: heading and intro paragraph (unchanged) → Source group → (files) genotype picker | (brapi) the three text fields → samples.csv picker → markers.csv picker → (brapi) "Download call-set table" button line → parameter fieldsets (unchanged) → Load button, (brapi && brapiLoading) Cancel button → loaded summary (unchanged).

- Source: React Aria `RadioGroup` `className="source-group"`, `orientation="horizontal"`, `value={source}`, `isDisabled={busy}`, `<Label>Source</Label>`, two `LineRadio`s with values `files` / `brapi` and labels exactly `Files` and `BrAPI server`.
- BrAPI fields: three React Aria `TextField`s (`className="field"`, `isDisabled={busy}`), each `<Label>` then `<Input>`:
  - `Base URL` — `type="url"`, `autoComplete="url"`, `placeholder="https://host/brapi/v2"`.
  - `Variant set id` — `type="text"`, `autoComplete="off"`.
  - `Access token (optional)` — `type="password"`, `autoComplete="off"`.
    The token lives in component state only; never in `localStorage`, the URL, or `loaded`.
- `brapiSource(): BrapiSource` = `{ baseUrl, variantSetDbId, ...(token.trim() === '' ? {} : { token: token.trim() }) }`.
- `canFetchCallSets = source === 'brapi' && baseUrl.trim() !== '' && variantSetDbId.trim() !== '' && !busy`.
- "Download call-set table" button: `onFetchCallSets(brapiSource())` → `downloadText('brapi-callsets.csv', callSetsCsv(r.callSets), 'text/csv')`, `setCallSetsWarnings(r.warnings)`; catch → `setCallSetsError(message)` shown in a `<span role="alert">`. Helper text after the button: `Lists the variant set's call sets so samples.csv can be written from their ids.`
- `canLoad = samplesFile !== null && !busy && (source === 'files' ? genotypeFile !== null : baseUrl.trim() !== '' && variantSetDbId.trim() !== '')`.
- `handleLoad`: files → `onLoad({ type: 'load', payload })` as today; brapi → `onLoad({ type: 'loadBrapi', payload: { source: brapiSource(), samples, ...(markers === undefined ? {} : { markers }) } })`.
- Cancel button: `type="button"`, text `Cancel`, rendered only when `source === 'brapi' && brapiLoading`; `onClick={onCancelBrapi}`. Not disabled by `busy`.
- Header comment rewritten (currently says "three file pickers").

`screens.css` (token-only): `.source-group { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; margin-bottom: var(--space-2); }`. Nothing else.

### 6.3 `src/App.tsx`

- `runLoad(request: LoadRequest)`: transfer list = `[request.payload.samples]` plus `genotypes` when `type === 'load'` and an `ArrayBuffer`, plus `markers` if present. `if (request.type === 'loadBrapi') setBrapiLoading(true);` then
  `const loadRes = request.type === 'load' ? await client.request('load', request.payload, transfer) : await client.request('loadBrapi', request.payload, transfer);` Everything after `setLoaded(loadRes)` unchanged. `finally`: `if (requestSeqRef.current === seq) { setBusy(false); setBrapiLoading(false); }`.
- `fetchCallSets(source)`: not on the sequence counter (like `runCompare`); `setBusy(true)`; `return getClient().request('brapiCallSets', { source })` → `{ callSets, warnings }`; errors propagate to the screen; `finally setBusy(false)`.
- `cancelBrapi()`: `void getClient().request('cancelBrapi', {})`.
- New state `brapiLoading`. Props to `UploadScreen`: `onLoad={(r) => void runLoad(r)}`, `onFetchCallSets={fetchCallSets}`, `onCancelBrapi={cancelBrapi}`, `brapiLoading`.
- Header comment: BrAPI dispatch, cancel out of band.

### 6.4 `src/ui/screens/ExportScreen.tsx`

Import `downloadText` from `../download.ts` (delete the local `download`). Call sites: `lineSummaryCsv(rpp, loaded.chromosomeOrder, loaded.samples)`, `segmentsCsv(…, effectiveGapCriterion, loaded.samples)`, `targetsCsv(targets.checks, loaded.samples)`, `pairwiseCsv(diffs, loaded.chromosomeOrder, loaded.samples)`. Report: `dataset: { …, source: describeSource(loaded.source) }` with `describeSource` as in 4.3.

### 6.5 `src/export/report.ts`

`ReportDataset.source?: string`; dataset summary pushes `['Source', escapeHtml(source)]` first when defined; `hasExternalIds` as in 4.3; QC and Lines tables insert the two columns after `sample_id` with `escapeHtml(s.callSetDbId ?? '')` / `escapeHtml(s.sampleDbId ?? '')` looked up from `dataset.samples`.

---

## 7. Fixture: `scripts/make-fixture.mjs` additions

Append after the markers.csv block (before `expected.markerReasons`), writing to `tests/fixtures/brapi/` (mkdir recursive). Reuse `markers`, `samples`, `cell`. Every file is `JSON.stringify(obj, null, 1) + '\n'`.

Constants: `VS = 'variantset1'`, `CS_PAGE = 5`, `V_PAGE = 13`. `gm13 = markers.filter(m => m.chrom === 'Gm13')` (25, k = 1..25 in file order).

Envelope helper `page(data, currentPage, pageSize, totalCount)`:

```json
{ "metadata": { "datafiles": [], "pagination": { "currentPage": p, "pageSize": n, "totalCount": t, "totalPages": ceil(t/n) }, "status": [ { "message": "Request accepted, response successful", "messageType": "INFO" } ] }, "result": { "data": data } }
```

- Call sets: `samples.map((s, i) => ({ additionalInfo: {}, callSetDbId: `callset${i+1}`, callSetName: s, created: null, sampleDbId: `sample${i+1}`, studyDbId: 'study1', updated: null, variantSetDbIds: [VS] }))` → `callsets.p0.json` (5), `callsets.p1.json` (3).
- Variants: for `gm13[k-1]` (k = 1..25): `{ additionalInfo: {}, alternateBases: alts, ciend: null, cistart: null, created: null, end: pos, filtersApplied: false, filtersFailed: [], filtersPassed: true, referenceBases: ref, referenceDbId: 'ref_Gm13', referenceName: 'Gm13', referenceSetDbId: 'refset1', start: pos - 1, svlen: null, updated: null, variantDbId, variantNames, variantSetDbId: VS, variantType: 'SNP' }` where `alts = mk.extraAllele ? [mk.alt, mk.extraAllele] : [mk.alt]`; **k 1..24**: `variantDbId = `variant${k}``, `variantNames = [mk.id]`; **k 25**: `variantDbId = mk.id` (`syn_Gm13_25`), `variantNames = []` (exercises the DbId fallback). → `variants.p0.json` (13), `variants.p1.json` (12).
- `variants-nopos.p0.json`: the same 25 in one page (`pageSize 25`, `totalPages 1`) with `referenceName`, `referenceDbId`, `start`, `end`, `referenceBases`, `alternateBases` all `null`.
- Allele matrix: variant pages v0 = k 1..13, v1 = k 14..25; call-set pages c0 = samples 0..4, c1 = 5..7. Cell for `(mk, s)`: `c = cell(m, s)`; `null` → `"."`; else `i0 = alleles.indexOf(c[0])`, `i1 = alleles.indexOf(c[1])` with `alleles = [ref, ...alts]`; `i0 === i1` → `String(i0)` (collapsed homozygote, `expandHomozygotes: false`), else `` `${i0}/${i1}` ``. File `allelematrix.v{i}.c{j}.json`:

```json
{ "metadata": { "datafiles": [], "pagination": { "currentPage": 0, "pageSize": 1000, "totalCount": 1, "totalPages": 1 }, "status": [...] },
  "result": { "callSetDbIds": [...], "dataMatrices": [ { "dataMatrixAbbreviation": "GT", "dataMatrixName": "Genotype", "dataMatrix": [[...]], "dataType": "string" } ], "expandHomozygotes": false, "pagination": [ { "dimension": "VARIANTS", "page": i, "pageSize": 13, "totalCount": 25, "totalPages": 2 }, { "dimension": "CALLSETS", "page": j, "pageSize": 5, "totalCount": 8, "totalPages": 2 } ], "sepPhased": "/", "sepUnphased": "|", "unknownString": ".", "variantDbIds": [...], "variantSetDbIds": [ "variantset1" ] } }
```

(`sepPhased`/`sepUnphased` as the test server returns them, the reverse of VCF, so the loader assumes nothing.)

- Extend the final `console.log` with the brapi directory and its byte total.
- Header comment of the script: add the BrAPI outputs and that the shapes follow the BrAPI v2.1 Genotyping schemas and the test-server responses recorded with `scripts/brapi-record.mjs` (shape check only, never a data source).

Field names above follow the v2.1 schemas and m3-phases resolution 6; **step 1 of the doer's order is to run the recorder and diff shapes before writing the generator**, then adjust names to what the test server actually returns (names only; values stay synthetic).

---

## 8. `scripts/brapi-record.mjs` (decision 2)

```
usage: node scripts/brapi-record.mjs <baseUrl> <variantSetDbId> [--variants-page-size N] [--callsets-page-size N] [--max-pages N]
       BRAPI_TOKEN=<token> in the environment adds Authorization: Bearer (never a CLI argument)
```

- The usage line is bash syntax; the script's header comment also gives the PowerShell form, `$env:BRAPI_TOKEN = '<token>'`.
- Plain ESM, global `fetch`, imports nothing from `src/`.
- Writes to `data/brapi-recorded/<YYYYMMDD-HHMMSS>/`: `callsets.p<i>.json`, `variants.p<i>.json`, `allelematrix.v<i>.c<j>.json` (pretty-printed, 1-space, LF), `urls.txt` (one URL per line, no token), `shape.txt` (sorted top-level and `result` key lists per file, which is what the fixture generator is compared against).
- Defaults: page sizes 13 and 5, `--max-pages 2` per list dimension (so at most 2 + 2 + 4 files); `--max-pages 1` still fetches `(0,0)`.
- Exits non-zero on any non-2xx with the URL and status printed. `no-console` is off under `scripts/**`.
- `package.json` scripts: `"brapi:record": "node scripts/brapi-record.mjs"`. Not referenced by `ci.yml` or any test; `data/` is already gitignored.

---

## 9. Tests

### 9.1 `tests/support/brapi-fixture.ts` (shared resolver)

```ts
export const BRAPI_FIXTURE_DIR = join(import.meta.dirname, '..', 'fixtures', 'brapi');
export const BRAPI_FIXTURE_FILES = [
  'callsets.p0.json',
  'callsets.p1.json',
  'variants.p0.json',
  'variants.p1.json',
  'variants-nopos.p0.json',
  'allelematrix.v0.c0.json',
  'allelematrix.v0.c1.json',
  'allelematrix.v1.c0.json',
  'allelematrix.v1.c1.json',
] as const;
export const BRAPI_FIXTURE_PAGE_SIZE = { variants: 13, callSets: 5 } as const;
/** Fixture file for a BrAPI request path and query, or null (404). mode 'nopos' serves variants-nopos.p0.json for /variants page 0 and null for later pages. */
export function brapiFixtureFile(
  pathname: string,
  params: URLSearchParams,
  mode: 'pos' | 'nopos',
): string | null;
```

Rules: `/callsets` → `callsets.p${page}.json`; `/variants` → `variants.p${page}.json` or nopos; `/allelematrix` requires `dataMatrixAbbreviations === 'GT'` and maps `dimensionVariantPage`/`dimensionCallSetPage` → `allelematrix.v{}.c{}.json`; anything else null. Files not in `BRAPI_FIXTURE_FILES` → null.

### 9.2 `tests/brapi.test.ts` (node)

Setup: `BASE = 'https://brapi.test/brapi/v2'`; `source = { baseUrl: BASE, variantSetDbId: 'variantset1', pageSize: BRAPI_FIXTURE_PAGE_SIZE }`; `fixtureFetch(mode)` returns `{ fetchImpl, urls: string[], inits: RequestInit[] }` that records each URL, resolves through `brapiFixtureFile`, and answers `new Response(text, { status: 200, headers: { 'content-type': 'application/json' } })` or a 404. `samples = parseSampleManifest(readFixture('samples.csv'))`, `map = parseMarkerMap(readFixture('markers.csv'))`, `VERSION` read from `contract/VERSION`.
`vcfGm13(withMarkers)`: `normaliseDataset(loadDataset('genotypes.vcf','vcf',withMarkers), VERSION)` restricted: `idx` = indices of `markers` with `chrom === 'Gm13'`; `markers = idx.map(...)`; each `calls[s] = idx.map(i => calls[s][i])`; `chromosomeOrder = ['Gm13']`.
`loadBrapi(mode, withMarkers)`: `parsed = await fetchBrapiGenotypes(source, fetchImpl, withMarkers ? map : undefined)`; `assembleDataset(parsed, attachCallSetIds(samples, parsed.callSets), withMarkers ? map : undefined)`.

| acceptance criterion                                        | test name                                                                                        | assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BrAPI dataset equals the VCF-loaded fixture (m3-phases:265) | `equals the VCF-loaded fixture on Gm13 with markers.csv`                                         | `normaliseDataset(loadBrapi('pos', true).dataset, VERSION)` `toEqual(vcfGm13(true))`; `parsed.coded === false`; `warnings` has no `/differ from the genotype file/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| same without a map                                          | `equals the VCF-loaded fixture on Gm13 without markers.csv`                                      | `toEqual(vcfGm13(false))` (cm null)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| marker-id fallback                                          | `uses variantDbId when variantNames is empty`                                                    | `dataset.markers.ids` contains `'syn_Gm13_25'` and `'variant25'` is absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| pagination (m3-phases:266)                                  | `requests two call-set pages, two variant pages and exactly four GT matrix pages, in that order` | `urls` `toEqual` the 8 exact URLs of section 3.1 in order: callsets p0,p1; variants p0,p1; allelematrix v0c0, v0c1, v1c0, v1c1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| auth header                                                 | `sends Accept always and Authorization: Bearer only with a token`                                | with `token: 'secret-token'` every `inits[i].headers` has `Authorization: 'Bearer secret-token'`; without, none has the key; `credentials === 'omit'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| token never leaks                                           | `never puts the token in an error message`                                                       | fetchImpl returning HTTP 401 with the token set: `rejects` with kind `brapi.http`, message matches `/HTTP 401/` and `/token/` and does not contain `secret-token`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| null positions with map (m3-phases:267)                     | `nopos: loads with markers.csv; markers equal the map and allele symbols are indices`            | `normalise(...).markers` `toEqual` the 25 map entries `{id, chrom:'Gm13', posBp, cm}` sorted by pos; every `dataset.markers.alleles[m]` is `['0','1']` or `['0','1','2']`; the null pattern of `calls[s]` equals that of `vcfGm13(true).calls[s]`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| null positions without map                                  | `nopos without markers.csv rejects naming the first marker without a position`                   | `rejects.toThrow(/syn_Gm13_01/)`; `kind === 'brapi.no_position'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| map missing one marker                                      | `nopos with markers.csv lacking one marker rejects naming it`                                    | map without `syn_Gm13_07` → `/syn_Gm13_07/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| absent moved-warning                                        | `does not warn that positions differ when start+1 equals markers.csv`                            | covered in row 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `parseBrapiCall` grammar (m3-phases:268)                    | `parseBrapiCall: table`                                                                          | `('1\|0','/','\|','.')→[0,1]`; `('.', …)→[255,255]`; `('1', …)→[1,1]`; `('0/1','/','\|','.')→[0,1]`; `('2/0',…)→[0,2]`; `('./1',…)` and `('1/.',…)` → `[255,255]`; `('',…)`→missing; `('NA','/','\|','NA')`→missing; `(' 0/1 ',…)→[0,1]`; `('0/1/2',…)` throws `/diploid/`; `('0\|1/2',…)` throws `/both separators/`; `('A/T',…)` throws `/invalid GT token/`; `('0\|1','/','\|','.')` → `[0,1]` (unphased separator is the pipe here)                                                                                                                                                                                                                                 |
| sample-id rule                                              | `assignSampleIds: unique names, missing names, collisions, post-fallback duplicate`              | `[{A,cs1},{'',cs2},{dup,cs3},{dup,cs4}]` → sampleIds `['A','cs2','cs3','cs4']`, warnings `toEqual(['BrAPI: 2 call sets share the name "dup"; their sample_id is the callSetDbId: cs3, cs4'])`; `[{cs2,cs1},{x,cs2},{x,cs3}]` throws kind `brapi.bad_shape` `/not unique/`; `' B '` → `'B'`                                                                                                                                                                                                                                                                                                                                                                              |
| collision end to end                                        | `loads a variant set with colliding call-set names under their DbIds`                            | in-memory server (2 variants × 4 call sets `A, dup, dup, D`; 1 page each): `genotypes.sampleIds` `toEqual(['A','cs2','cs3','D'])`; `warnings` contains the collision string; `attachCallSetIds(manifest, callSets)` sets `callSetDbId`/`sampleDbId` on matched records and `'callSetDbId' in unmatched === false`                                                                                                                                                                                                                                                                                                                                                       |
| errors                                                      | `maps failures to BrapiError kinds`                                                              | one `it` per row: fetch throws `TypeError('Failed to fetch')` → `brapi.network`, message contains the URL and `Access-Control-Allow-Origin`; HTTP 500 → `brapi.http`; body `'<html>'` → `brapi.not_json`; `{}` → `brapi.bad_shape`; `dataMatrices` with only `AD` → `brapi.no_gt_matrix`; matrix naming `variantX` → `brapi.unknown_id` `/variantX/`; naming `csX` → `brapi.unknown_id`; 3×2 matrix for 2 variants → `brapi.bad_shape` `/is 3 x 2, expected 2 x 4/`; `referenceBases 'A'`, `alternateBases ['T']`, cell `'2/2'` → `brapi.invalid_call` `/allele index 2 but only 2/`; empty `/callsets` → `brapi.no_call_sets`; empty `/variants` → `brapi.no_variants` |
| timeout                                                     | `rejects with brapi.timeout when a request exceeds requestTimeoutMs`                             | fetchImpl returns a promise that rejects with `init.signal.reason` on `abort`; `requestTimeoutMs: 20` → kind `brapi.timeout` `/did not respond within 0.02 s/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| cancel                                                      | `rejects with brapi.cancelled when the signal aborts`                                            | `AbortController` aborted from inside the first fetchImpl call → `brapi.cancelled`; no further URLs recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| base URL                                                    | `normalises the base URL and rejects non-http schemes`                                           | `'https://h/brapi/v2/'` → first URL starts `https://h/brapi/v2/callsets?`; `'ftp://h'` and `''` → `brapi.bad_url`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| totalPages absent                                           | `treats a response without totalPages as a single page`                                          | one URL per list endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| absent variant                                              | `warns and leaves calls missing for a variant no matrix page names`                              | warning `/1 variant\(s\) absent from every \/allelematrix page/`; that marker's calls all `null` after normalise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| separators per page                                         | `honours sepPhased, sepUnphased and unknownString from the response`                             | in-memory page with `sepUnphased: ':'`, `unknownString: 'NN'`, cells `'0:1'`, `'NN'` → `[0,1]` and missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| memory accounting                                           | `reports peakBuilderBytes from the builder`                                                      | `parsed.peakBuilderBytes > 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| fixture size and reproducibility (m3-phases:269)            | `tests/fixtures/brapi is exactly the nine generated files and under 64 KB`                       | `readdirSync` sorted `toEqual([...BRAPI_FIXTURE_FILES].sort())`; `sum(statSync(f).size) < 65_536`. (Reproducibility is the CI gate `npm run fixture && git diff --exit-code -- tests/fixtures contract`, `ci.yml:38-42`.)                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 9.3 `tests/export-ids.test.ts` (node)

Dataset from `loadDataset('genotypes.vcf','vcf')`; `withIds = dataset.samples.map((s, i) => ({ ...s, callSetDbId: `cs${i}`, sampleDbId: `smp${i}` }))`; `plain = dataset.samples`.

| test                                           | assertion                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `every CSV header is the documented one`       | header line of each of the five exporters `toBe` the exact strings of 4.3 (summary: `startsWith('sample_id,call_set_db_id,sample_db_id,n_informative,')` and `endsWith('rpp_count_Gm20')`)                                                              |
| `writes the ids after the sample id column(s)` | with `withIds`: summary row for NIL_01 starts `NIL_01,cs2,smp2,`; segments/targets likewise; pairwise row starts `NIL_01,NIL_02,cs2,smp2,cs3,smp3,informative,`; discordant (dataset with `samples: withIds`) row starts the same six cells then `syn_` |
| `writes empty cells for a file-loaded dataset` | with `plain`: rows start `NIL_01,,,`; pairwise `NIL_01,NIL_02,,,,,informative,`                                                                                                                                                                         |
| `quotes ids that need it`                      | id `'a,b'` → `"a,b"`                                                                                                                                                                                                                                    |
| `callSetsCsv`                                  | header `sample_id,call_set_name,call_set_db_id,sample_db_id`; row order; name with comma quoted; empty name → empty cell; trailing `\n`                                                                                                                 |

Existing assertions to update: `tests/smoke.test.ts:106-109` (add `dataset.samples`; `startsWith('sample_id,call_set_db_id,sample_db_id,n_informative,')`), `tests/fixture-segments.test.ts:92-96` (new header; `startsWith('NIL_01,')` and the tail regexes still hold), `tests/fixture-targets.test.ts:102-112` (rows become `NIL_01,,,gm13core,Gm13,…` and `NIL_03,,,gm13core,Gm13,…,rp,3,NA,NA,NA,NA`), `tests/fixture-compare.test.ts:98-106` (both headers).

`tests/report.test.ts` additions: `adds call_set_db_id and sample_db_id to the Lines and QC tables only when a sample carries them` (base input: `<th scope="col">call_set_db_id</th>` absent; with `withIds`: present and `<td>cs2</td>` appears); `states the source without a URL scheme` (`source: 'BrAPI variant set variantset1 from host/brapi/v2'` → `<dt>Source</dt>` present; the existing no-`https://` test still passes).

### 9.4 `tests/browser/brapi-upload.test.tsx` (browser mode, Chromium and Firefox)

Mock server: `tests/support/brapi-mock-plugin.ts` exports `brapiMockPlugin(): Plugin` with `configureServer(server)` mounting `server.middlewares.use('/__brapi__', handler)`; the handler parses `req.url`, calls `brapiFixtureFile(pathname, params, 'pos')`, serves the file with `content-type: application/json` or 404. Registered in `vite.config.ts` top-level `plugins: [react(), brapiMockPlugin()]` (no build hook, so `vite build` is unaffected; `npm run dev` also serves it, which is harmless). Same origin, so no CORS is involved; the worker's real `fetch` runs.

`tests/support/app-harness.tsx` gains `loadBrapi(files: { samples: File; markers?: File }, source: { baseUrl: string; variantSetDbId: string }): Promise<void>`: click radio `BrAPI server`, fill `Base URL` and `Variant set id` (`page.getByLabelText`), upload samples/markers, click `Load`, await the `Dataset summary and QC` heading.

| test                                                                     | assertion                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `switches the inputs with the Source radio`                              | after clicking `BrAPI server`: `page.getByLabelText(/^Genotype file/)` not in document, `Base URL`, `Variant set id`, `Access token (optional)` present, the token input has `type="password"`; `Download call-set table` disabled until Base URL and Variant set id are filled; clicking `Files` restores the genotype input |
| `loads a variant set through the worker from the mock server`            | `loadBrapi(fixture samples+markers, { baseUrl: `${location.origin}/**brapi**`, variantSetDbId: 'variantset1' })`; `page.getByText('25 markers', { exact: false })` present; `goTo('3. Lines')` shows `/^Lines: 6,/`; no `[role="alert"]`                                                                                      |
| `reports a BrAPI failure in the alert without leaving the Upload screen` | variant set id `nosuchset` (resolver returns 404 for page 0) → `[role="alert"]` text matches `/BrAPI: GET .* returned HTTP 404/`; Upload heading still shown                                                                                                                                                                  |

The bench (`tests/bench/**`) is unchanged.

---

## 10. Docs

### 10.1 `docs/adr/0015-brapi-allele-matrix-loader.md` (MADR 4.0.0, status accepted, date = commit date)

Title: `BrAPI allele-matrix loader: fetch inside the worker through GenotypeBuilder, call-set names as sample ids, call-set ids in every export`.

- Context: PLAN.md names BrAPI Genotyping as the intended second source; ADR 0001's worker ownership; contract 1.1/1.2 fixed cells and positions; Q3.
- Decision record: questions B1–B7 were delegated by the maintainer to Fable research on 2026-09-15, with the criterion of what serves academic and open-source plant-breeding users. State this, with the sources listed in section B.
- Drivers: no genotype on the main thread; one `Dataset` for every source; `samples.csv` still declares roles; ids stable under renames; no real data in the repo; the public test server returns null positions and bases.
- Options: (1) fetch on the main thread and transfer; (2) fetch in the worker, `GenotypeBuilder` (chosen); (3) a server-side proxy. Sample id: `callSetName` / `callSetDbId` / `sampleDbId` / name-else-DbId (chosen). Fixture: recorded real responses / synthetic pages generated with the synthetic fixture (chosen). Positions: `start+1` only / markers.csv fallback (chosen).
- Decision outcome, numbered: endpoints and order; join by ids; `start+1`; markers.csv fallback and error; allele symbols from bases else indices; `parseBrapiCall` grammar and diploid rule; `sample_id` rule with warning; `callSetDbId`/`sampleDbId` on `SampleRecord` and in every export with the column placement of 4.3 and the empty value; call-set table CSV from the Upload screen before load; bearer token in the header only; per-request timeout and out-of-band cancel; CORS wording; fixture generated by `make-fixture.mjs`, recorder in `data/`.
- Consequences: good (same Dataset, no main-thread genotype, exports traceable to server ids); bad (CORS must be configured server-side; Gigwa auto-named call sets; every CSV gains two columns, positional readers break); neutral (no contract change).
- Revisit when: `/samples`–`/germplasm` naming is needed, another auth scheme, or a variant set larger than the page loop handles in one worker request.

### 10.2 `CHANGELOG.md` under `[Unreleased]`

Added: `Load a variant set from a BrAPI v2.1 server (`/callsets`, `/variants`, `/allelematrix`) from the Upload screen, fetched inside the worker so genotypes still never reach the main thread. Roles still come from samples.csv, whose `sample_id`is the call set's name (or its`callSetDbId` when names collide, with a warning); a call-set table download (`brapi-callsets.csv`) gives the ids to build samples.csv from; positions are `start + 1` or come from markers.csv; an optional bearer token; each request times out after 60 s and a load can be cancelled (docs/adr/0015).`

Changed: `Every CSV export and the HTML report now carry the BrAPI `call_set_db_id`and`sample_db_id` of each sample, immediately after the sample id column(s) (`_a`/`_b` in the pairwise tables); the cells are empty for a dataset loaded from a file. Readers that pick columns by position must be updated; docs/data-formats.md lists every header.`

### 10.3 Other edits

- `docs/m3-phases.md:239`: `docs/adr/0014-…` → `docs/adr/0015-brapi-allele-matrix-loader.md`; add one line under the table: `2026-09-15: file table completed by docs/m3-phase4-brapi.md (exports, call-set download, cancel); ADR is 0015.`
- `CLAUDE.md:13` State: M3 phases 1–4 done, phase 5 next (main session writes the final wording). `CLAUDE.md:38`: `0015` is the most recent. `CLAUDE.md:59` Layout: append `src/io/brapi.ts is the only module that calls fetch, and only the worker calls it.`
- `PLAN.md:23`: `… is the intended future data source but is not implemented in the scaffold` → `… is a second data source since M3 phase 4 (docs/adr/0015)`. Mermaid (`PLAN.md:27-42`): add `B[BrAPI v2.1 server<br/>callsets, variants, allelematrix] -- fetched inside the worker --> W`.
- `docs/reference-repos.md:13-15`: heading `## plantbreeding/BrAPI (BrAPI specification)`; note the former `plantbreeding/API` paths return 404; cite the Variant schema (`start` 0-based) and the test-server fetches of 2026-09-12 from m3-phases resolution 6; "Borrowed: the Genotyping vocabulary and the `/allelematrix` paging model. Not borrowed: code."
- Header comments kept current: `UploadScreen.tsx`, `App.tsx`, `ExportScreen.tsx`, `protocol.ts`, `analysis.worker.ts`, `pairwise-csv.ts`, `report.ts`, `LineActionBar.tsx`, `make-fixture.mjs`.

---

## 11. Implementation phases (each is one doer hand-off; the doer never runs git)

### Phase 4.1 — record and shape-check (sections 7, 8)

1. Write `scripts/brapi-record.mjs`; add the `brapi:record` script.
2. Run `node scripts/brapi-record.mjs https://test-server.brapi.org/brapi/v2 variantset1` once; read `shape.txt`; reconcile the field names in section 7 with what the server returns (names only). Report any difference in the doer's report.
3. Extend `scripts/make-fixture.mjs`; run `npm run fixture`; confirm `tests/fixtures/synthetic/` is byte-identical and `tests/fixtures/brapi/` has the nine files under 64 KB.

### Phase 4.2 — `src/io/brapi.ts` and its node tests (sections 2.2, 3, 4.1, 9.1, 9.2)

4. `src/core/types.ts` optional fields; `src/io/brapi.ts`; `tests/support/brapi-fixture.ts`; `tests/brapi.test.ts`. Gates: lint, typecheck, `npm test`.

### Phase 4.3 — protocol, worker, client (sections 2.3–2.4, 5)

5. `protocol.ts`, `client.ts`, `analysis.worker.ts` (including the `loadedResult` refactor and out-of-band cancel).

### Phase 4.4 — exports, CLI, docs/data-formats (sections 2.5, 4.2–4.4, 6.5, 9.3)

6. `sample-ids.ts`, `callsets-csv.ts`, the five exporters, `report.ts`, `cli.ts`; update the five existing header assertions; add `tests/export-ids.test.ts` and the two `report.test.ts` cases; edit `docs/data-formats.md` exactly as 4.4.

### Phase 4.5 — UI and browser test (sections 2.6–2.7, 6.1–6.4, 9.4)

7. `download.ts`, `LineRadio`, `UploadScreen.tsx`, `screens.css`, `App.tsx`, `ExportScreen.tsx`; `brapi-mock-plugin.ts`, `vite.config.ts`, `app-harness.tsx`, `tests/browser/brapi-upload.test.tsx`. Gates: all five plus `npm run test:browser`.

### Phase 4.6 — records (section 10)

8. ADR 0015, CHANGELOG, PLAN.md, CLAUDE.md, m3-phases.md, reference-repos.md, header comments. Main session: adversarial review of `src/io/brapi.ts` (sample-id rule, half-missing tokens, unpositioned variants, unknown ids, token leakage), then commit `feat(io): load a BrAPI v2.1 variant set inside the worker` with the CHANGELOG entries.

---

## A. Conflicts found (plan vs ADRs vs code), with locations

1. `docs/m3-phases.md:239` names `docs/adr/0014-brapi-allele-matrix-loader.md`; `docs/adr/0014-contract-1.1-alignment.md` exists and `docs/handoff-m3-phases-4-5.md:25` fixes the BrAPI ADR at 0015; `CLAUDE.md:38` still says 0014 is the most recent. Spec uses 0015 and edits both files.
2. `docs/m3-phases.md:229` says `sample_id = callSetName` outright; `docs/m3-phases.md:304` (Q3, settled) and handoff decision 1 add uniqueness and the DbId fallback. Q3 governs (section 4.1).
3. `docs/m3-phases.md:227-240` file table omits the export columns, the call-set download and cancel; handoff decision 1 says the planner adds them. Added (sections 4, 5, 6).
4. `src/export/pairwise-csv.ts:9-10` ("These column names are a published contract; do not add, rename or reorder a column") contradicts decision 1. Comment rewritten (4.3). `PLAN.md:128` and `PLAN.md:309` record header-for-header and `readr` checks against the old headers; they are historical verification blocks and stay, but the M3 block must state that the readr check has not been re-run on the new headers (or re-run it).
5. `docs/m3-phases.md:251-254` `fetchBrapiGenotypes(source, fetchImpl)` cannot implement `:229` "positions come from markers.csv … error naming the marker": `applyMarkerMap` runs inside `assembleDataset` (`loaders.ts:162`) and `GenotypeBuilder.push` (`builder.ts:60`) rejects a placeholder. Spec adds the optional `markerMap` parameter (2.2, 3.5); applying it at push time also avoids the misleading `markers.ts:82-85` "differ from the genotype file" warning.
6. `docs/m3-phases.md:229` "allele table is `['0','1',…]` up to the highest index seen" is unknowable at push time; spec relies on `builder.ts:66` storing the array by reference and fills it at finish (3.7). `tests/support/normalise.ts:53` throws on a missing symbol, so this is required for the nopos test.
7. `docs/m3-phases.md:230` says the result "is the existing `loaded`"; decision 1 needs the origin of each sample downstream. Spec adds `loaded.source` and the two optional `SampleRecord` fields carried through `loaded.samples` (additive).
8. `docs/m3-phases.md:232` "Labels and errors through tokens; no literal values (lint gate)": `eslint/ui-literal-selectors.json` bans colour and px literals only; every label in `UploadScreen.tsx` is a string literal. Read as: no colour or px literal.
9. `docs/m3-phases.md:229` "each variant is `push`ed once, at call-set page 0": spec pushes every variant after `/variants`, before the matrix (3.5); same offsets, same behaviour.
10. `src/workers/client.ts:26` maps only `'load'` → `'loaded'`; `loadBrapi` would type as a `WorkerResult` of type `'loadBrapi'`, which does not exist. Fixed in 2.4.
11. `src/io/loaders.ts:184` message "absent from the genotype file" is what a BrAPI load reports for a `samples.csv` id that is not a call set; `tests/support/normalise.ts` / `contract-cases.test.ts:34` depend on that wording. Kept; documented in 4.4 item 2.
12. `src/workers/analysis.worker.ts:329-334` queues every request, so a cancel posted normally would wait behind the load it cancels. Spec handles `cancelBrapi` in `onmessage` (5.7).
13. `docs/data-formats.md:3` says the input contract is shared verbatim "see CONTRIBUTING.md"; since ADR 0013 the contract lives in `contract/`. Rewritten (4.4 item 1).
14. `PLAN.md:23` and `docs/reference-repos.md:13-15` say BrAPI is not implemented and cite `plantbreeding/API`; `docs/m3-phases.md:238` says the repository is `plantbreeding/BrAPI`. Both edited (10.3).
15. `docs/m3-phases.md:234` requires field names "exactly as the test server's responses fetched today", but those responses are not in the repository and the spec could not fetch them; section 7 follows the v2.1 schemas and resolution 6, and phase 4.1 step 2 reconciles names against a live recording before the generator is written.
16. `tests/report.test.ts:77-78` asserts no `http://`/`https://` in the report; a BrAPI Source line with the base URL would fail it. Spec strips the scheme (4.3).
17. `docs/m3-phases.md:12` (invariant 4) says `tests/fixtures/brapi/` is under 64 KB; the task prompt says the synthetic dir under 200 KB. Both hold; not a contradiction.
18. `src/ui/screens/UploadScreen.tsx:4` header says "three file pickers"; CLAUDE.md:61 requires headers current. Rewritten in 6.2.

## B. Questions for the maintainer (each with the answer this spec assumes)

**Resolved 2026-09-15.** The maintainer delegated all seven to Fable research ("ask fable"), with the criterion of what best serves academic and open-source plant-breeding users: reproducible with standard tools, tolerant of spreadsheet, pandas and R exports, never silently wrong. Every assumed answer below was confirmed. Four edits followed: sections 3.5 (scalar `variantNames`, `.` as absent), 4.2 (wording about `role`), 4.3 (bare empty cell) and 8 (PowerShell token form). Sources: the BrAPI v2.1 Variant schema; Gigwa `Mgdb2BrapiV2Impl`; `germinate-brapi`; Breedbase `CXGN/BrAPI/v2/Variants.pm`; the readr, data.table and pandas reader docs; and `test-server.brapi.org`, where `/variants` returns `variantNames: ["M1"]`, checked directly. ADR 0015 records the delegation and the criterion.

1. **Column placement.** Immediately after the sample id column(s): `sample_id,call_set_db_id,sample_db_id,…` and, in the two pairwise tables, `…,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,…`. Recommended because the summary CSV ends with the variable `rpp_count_<chrom>` block, so appending would put fixed columns after variable ones. Alternative: append at the end of every table.
2. **Empty value for file-loaded datasets.** The empty string (recommended: `readr` reads `""` as `NA` by default, and `NA` stays the marker for numeric NaN). Alternative: `NA`.
3. **HTML report.** Two columns in the Lines and QC tables only when the dataset came from BrAPI, plus a `Source` row always (recommended: the report is read by people, the CSVs by code). Alternative: always show the columns, empty.
4. **Call-set table.** (a) Include the derived `sample_id` as the first column, so the file is usable for `samples.csv` as is (recommended; the decision names three columns, this adds one). (b) Offer it **before** load from the Upload screen through a `brapiCallSets` worker request that pages `/callsets` only (recommended; `samples.csv` is required to load, so a post-load download cannot serve its purpose the first time).
5. **Marker id.** First entry of `variantNames`, else `variantDbId` (recommended: Gigwa and Germinate put the VCF ID in `variantNames` and an opaque key in `variantDbId`, and markers.csv is keyed by the VCF ID). Alternative: `variantDbId` only.
6. **Cancel in phase 4.** A `Cancel` button on the Upload screen during a BrAPI load, implemented as an out-of-band abort in the worker (recommended; small, and a stuck server otherwise blocks the worker for the request timeout per page). Alternative: defer, per-request timeout only.
7. **Recorder token.** `BRAPI_TOKEN` environment variable only, never a CLI flag (recommended; the test server needs none).
