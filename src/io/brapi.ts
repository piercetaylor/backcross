/**
 * BrAPI v2.1 allele-matrix loader (docs/m3-phase4-brapi.md sections 2.2, 3, 4.1).
 *
 * Responsibility: fetch a variant set's call sets, variants and GT allele
 * matrix from a BrAPI v2.1 server into a `ParsedGenotypes` through
 * `GenotypeBuilder`, inside the worker. This is the only module that calls
 * `fetch` (through the injected `fetchImpl`). It never routes cells through
 * `calls.ts` nor positions through `position.ts`: GT tokens are read by
 * `parseBrapiCall`, and positions are `start + 1` or come from markers.csv.
 * The access token goes into the Authorization header only, never into a URL,
 * error message, warning, result or log.
 *
 * Interface:
 *   BrapiSource, BRAPI_DEFAULT_PAGE_SIZE, BRAPI_REQUEST_TIMEOUT_MS, FetchLike,
 *   BrapiFetchOptions, BrapiCallSet, BrapiGenotypes, BrapiErrorKind, BrapiError;
 *   normaliseBaseUrl(raw) -> string (rejects userinfo);
 *   explainAssembleError(error, warnings) -> error (adds call-set name collisions to a
 *     "absent from the genotype file" failure, for the worker's loadBrapi path);
 *   parseBrapiCall(token, sepPhased, sepUnphased, unknown) -> [a, b] (sorted, 255 = missing);
 *   assignSampleIds(raw) -> { callSets, warnings };
 *   attachCallSetIds(samples, callSets) -> SampleRecord[];
 *   fetchBrapiCallSets(source, fetchImpl, options?) -> Promise<{ callSets, warnings }>;
 *   fetchBrapiGenotypes(source, fetchImpl, markerMap?, options?) -> Promise<BrapiGenotypes>.
 */
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
  constructor(kind: BrapiErrorKind, message: string) {
    super(message);
    this.name = 'BrapiError';
    this.kind = kind;
  }
}

type Json = Record<string, unknown>;

const isObject = (x: unknown): x is Json =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const nonEmptyString = (x: unknown): string | undefined =>
  typeof x === 'string' && x !== '' ? x : undefined;
const trimmedString = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const totalPagesOf = (x: unknown): number =>
  typeof x === 'number' && Number.isInteger(x) && x >= 1 ? x : 1;

export function normaliseBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(base)) {
    throw new BrapiError('brapi.bad_url', 'BrAPI: base URL must start with http:// or https://');
  }
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new BrapiError('brapi.bad_url', 'BrAPI: base URL must start with http:// or https://');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new BrapiError(
      'brapi.bad_url',
      'BrAPI: base URL must not contain a user name or password; use the token field',
    );
  }
  return base;
}

const COLLISION_WARNING = /^BrAPI: \d+ call sets share the name /;

/**
 * For the loadBrapi path: when assembling the dataset failed because samples.csv
 * names a sample the variant set lacks, and call-set names collided (so those
 * call sets are under their DbIds), append the collision warnings to the message.
 * Any other error is returned unchanged.
 */
export function explainAssembleError(error: unknown, warnings: string[]): unknown {
  if (!(error instanceof Error) || !error.message.includes('absent from the genotype file')) {
    return error;
  }
  const collisions = warnings.filter((w) => COLLISION_WARNING.test(w));
  if (collisions.length === 0) return error;
  return new Error(`${error.message}; note: ${collisions.join('; ')}`, { cause: error });
}

export function parseBrapiCall(
  token: string,
  sepPhased: string,
  sepUnphased: string,
  unknown: string,
): [number, number] {
  const t = token.trim();
  if (t === '' || t === unknown) return [MISSING_ALLELE, MISSING_ALLELE];
  const hasP = sepPhased !== '' && t.includes(sepPhased);
  const hasU = sepUnphased !== '' && t.includes(sepUnphased);
  if (hasP && hasU) throw new Error(`invalid GT token "${t}": both separators present`);
  const parts = hasP ? t.split(sepPhased) : hasU ? t.split(sepUnphased) : [t];
  if (parts.length > 2) throw new Error(`invalid GT token "${t}": calls are diploid`);
  const alleles = parts.map((part) => {
    if (part === unknown || part === '.') return MISSING_ALLELE;
    if (!/^\d+$/.test(part)) throw new Error(`invalid GT token "${t}"`);
    const index = Number(part);
    if (index >= MISSING_ALLELE) {
      throw new Error(`invalid GT token "${t}": allele index ${part} is out of range`);
    }
    return index;
  });
  const x = alleles[0] as number;
  const y = alleles.length === 2 ? (alleles[1] as number) : x;
  if (x === MISSING_ALLELE || y === MISSING_ALLELE) return [MISSING_ALLELE, MISSING_ALLELE];
  return x <= y ? [x, y] : [y, x];
}

export function assignSampleIds(
  raw: { callSetName: string; callSetDbId: string; sampleDbId: string }[],
): { callSets: BrapiCallSet[]; warnings: string[] } {
  const dbIdsByName = new Map<string, string[]>();
  for (const r of raw) {
    const name = r.callSetName.trim();
    if (name === '') continue;
    const list = dbIdsByName.get(name);
    if (list === undefined) dbIdsByName.set(name, [r.callSetDbId]);
    else list.push(r.callSetDbId);
  }
  const callSets = raw.map((r) => {
    const name = r.callSetName.trim();
    const unique = name !== '' && dbIdsByName.get(name)?.length === 1;
    return {
      sampleId: unique ? name : r.callSetDbId,
      callSetName: name,
      callSetDbId: r.callSetDbId,
      sampleDbId: r.sampleDbId,
    };
  });
  const warnings: string[] = [];
  for (const [name, dbIds] of dbIdsByName) {
    if (dbIds.length < 2) continue;
    warnings.push(
      `BrAPI: ${dbIds.length} call sets share the name "${name}"; their sample_id is the callSetDbId: ${dbIds.join(', ')}`,
    );
  }
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of callSets) {
    if (seen.has(c.sampleId) && !dups.includes(c.sampleId)) dups.push(c.sampleId);
    seen.add(c.sampleId);
  }
  if (dups.length > 0) {
    throw new BrapiError(
      'brapi.bad_shape',
      `BrAPI: sample ids are not unique after falling back to callSetDbId: ${dups.join(', ')}`,
    );
  }
  return { callSets, warnings };
}

export function attachCallSetIds(
  samples: SampleRecord[],
  callSets: BrapiCallSet[],
): SampleRecord[] {
  const byId = new Map(callSets.map((c) => [c.sampleId, c] as const));
  return samples.map((s) => {
    const c = byId.get(s.sampleId);
    return c === undefined ? s : { ...s, callSetDbId: c.callSetDbId, sampleDbId: c.sampleDbId };
  });
}

interface Session {
  base: string;
  variantSetDbId: string;
  pageSize: { variants: number; callSets: number };
  getJson: (url: string) => Promise<Json>;
}

function openSession(
  source: BrapiSource,
  fetchImpl: FetchLike,
  options: BrapiFetchOptions | undefined,
): Session {
  const base = normaliseBaseUrl(source.baseUrl);
  const variantSetDbId = source.variantSetDbId.trim();
  if (variantSetDbId === '') {
    throw new BrapiError('brapi.bad_url', 'BrAPI: variant set id is required');
  }
  const token = (source.token ?? '').trim();
  const requestTimeoutMs = options?.requestTimeoutMs ?? BRAPI_REQUEST_TIMEOUT_MS;
  // Text a server or runtime echoes back (an error message, a status text) never carries the token.
  const redact = (text: string): string => (token === '' ? text : text.split(token).join('***'));
  const getJson = async (url: string): Promise<Json> => {
    // A load cancelled between requests never issues the next one.
    if (options?.signal?.aborted) throw new BrapiError('brapi.cancelled', 'BrAPI: load cancelled');
    const timeout = AbortSignal.timeout(requestTimeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        mode: 'cors',
        credentials: 'omit',
        signal,
      });
    } catch (e) {
      if (options?.signal?.aborted)
        throw new BrapiError('brapi.cancelled', 'BrAPI: load cancelled');
      if (timeout.aborted) {
        throw new BrapiError(
          'brapi.timeout',
          `BrAPI: GET ${url} did not respond within ${requestTimeoutMs / 1000} s`,
        );
      }
      const message = redact(e instanceof Error ? e.message : String(e));
      throw new BrapiError(
        'brapi.network',
        `BrAPI: could not reach ${url} (${message}). Either the server is unreachable or it does not allow this app's origin: it must answer with Access-Control-Allow-Origin for this origin and, when an access token is used, allow the Authorization header in its CORS preflight.`,
      );
    }
    if (!response.ok) {
      const { status, statusText } = response;
      throw new BrapiError(
        'brapi.http',
        `BrAPI: GET ${url} returned HTTP ${status}${statusText ? ' ' + redact(statusText) : ''}` +
          (status === 401 || status === 403 ? '; check the access token' : ''),
      );
    }
    let body: unknown;
    let onAbort: (() => void) | undefined;
    try {
      // The body is read under the same signals as the request: a cancel or a
      // timeout while it is still arriving is that, not a JSON error.
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error('aborted'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      });
      body = await Promise.race([response.json(), aborted]);
    } catch {
      if (options?.signal?.aborted) {
        throw new BrapiError('brapi.cancelled', 'BrAPI: load cancelled');
      }
      if (timeout.aborted) {
        throw new BrapiError(
          'brapi.timeout',
          `BrAPI: GET ${url} did not respond within ${requestTimeoutMs / 1000} s`,
        );
      }
      throw new BrapiError('brapi.not_json', `BrAPI: GET ${url} did not return JSON`);
    } finally {
      if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
    }
    if (!isObject(body) || !isObject(body['result'])) {
      throw new BrapiError('brapi.bad_shape', `BrAPI: GET ${url}: response has no result object`);
    }
    return body;
  };
  return {
    base,
    variantSetDbId,
    pageSize: source.pageSize ?? BRAPI_DEFAULT_PAGE_SIZE,
    getJson,
  };
}

/**
 * Pages a list endpoint (section 3.3). /callsets pages by `page`. /variants
 * follows the token rule, because some servers (test-server.brapi.org) ignore
 * `page` there: page 0 sends no token; a later page sends
 * `pageToken=<nextPageToken>` when the previous response gave a non-empty one,
 * otherwise `page=N&pageToken=N`; a page whose first variantDbId was already
 * seen means the server ignored paging.
 */
async function fetchList(session: Session, endpoint: 'callsets' | 'variants', pageSize: number) {
  const rows: unknown[] = [];
  /** variantDbIds of the pages already read (/variants only). */
  const seenIds = new Set<string>();
  let totalPages = 1;
  let nextPageToken = '';
  for (let p = 0; p < totalPages; p++) {
    const params: [string, string][] = [['variantSetDbId', session.variantSetDbId]];
    if (endpoint === 'variants' && p > 0 && nextPageToken !== '') {
      params.push(['pageToken', nextPageToken]);
    } else {
      params.push(['page', String(p)]);
      if (endpoint === 'variants' && p > 0) params.push(['pageToken', String(p)]);
    }
    params.push(['pageSize', String(pageSize)]);
    const url = `${session.base}/${endpoint}?${new URLSearchParams(params).toString()}`;
    const body = await session.getJson(url);
    const metadata = body['metadata'];
    const pagination = isObject(metadata) ? metadata['pagination'] : undefined;
    if (p === 0) {
      totalPages = totalPagesOf(isObject(pagination) ? pagination['totalPages'] : undefined);
    }
    const token = isObject(pagination) ? pagination['nextPageToken'] : undefined;
    nextPageToken = typeof token === 'string' ? token.trim() : '';
    const data = (body['result'] as Json)['data'];
    if (!Array.isArray(data)) {
      throw new BrapiError('brapi.bad_shape', `BrAPI: GET ${url}: result.data is not an array`);
    }
    if (p > 0 && data.length === 0) break;
    if (endpoint === 'variants') {
      const first = data[0] as unknown;
      const firstId = isObject(first) ? (nonEmptyString(first['variantDbId']) ?? '') : '';
      if (firstId !== '' && seenIds.has(firstId)) {
        throw new BrapiError(
          'brapi.bad_shape',
          `BrAPI: /variants page ${p} repeated an earlier page; the server ignored paging`,
        );
      }
      for (const row of data as unknown[]) {
        const id = isObject(row) ? (nonEmptyString(row['variantDbId']) ?? '') : '';
        if (id !== '') seenIds.add(id);
      }
    }
    rows.push(...(data as unknown[]));
  }
  return rows;
}

async function loadCallSets(
  session: Session,
): Promise<{ callSets: BrapiCallSet[]; warnings: string[] }> {
  const rows = await fetchList(session, 'callsets', session.pageSize.callSets);
  const seen = new Set<string>();
  const raw = rows.map((row, i) => {
    const r = isObject(row) ? row : {};
    const callSetDbId = nonEmptyString(trimmedString(r['callSetDbId']));
    if (callSetDbId === undefined) {
      throw new BrapiError('brapi.bad_shape', `BrAPI: /callsets row ${i} has no callSetDbId`);
    }
    if (seen.has(callSetDbId)) {
      throw new BrapiError(
        'brapi.bad_shape',
        `BrAPI: /callsets lists callSetDbId "${callSetDbId}" more than once`,
      );
    }
    seen.add(callSetDbId);
    return {
      callSetName: trimmedString(r['callSetName']),
      callSetDbId,
      sampleDbId: trimmedString(r['sampleDbId']),
    };
  });
  if (raw.length === 0) {
    throw new BrapiError(
      'brapi.no_call_sets',
      `BrAPI: variant set ${session.variantSetDbId} has no call sets`,
    );
  }
  return assignSampleIds(raw);
}

export async function fetchBrapiCallSets(
  source: BrapiSource,
  fetchImpl: FetchLike,
  options?: BrapiFetchOptions,
): Promise<{ callSets: BrapiCallSet[]; warnings: string[] }> {
  return loadCallSets(openSession(source, fetchImpl, options));
}

function markerIdOf(r: Json, variantDbId: string): string {
  const names = r['variantNames'];
  const usable = (x: unknown): string | undefined => {
    const t = trimmedString(x);
    return t !== '' && t !== '.' ? t : undefined;
  };
  if (typeof names === 'string') return usable(names) ?? variantDbId;
  if (Array.isArray(names)) {
    for (const n of names as unknown[]) {
      const id = usable(n);
      if (id !== undefined) return id;
    }
  }
  return variantDbId;
}

export async function fetchBrapiGenotypes(
  source: BrapiSource,
  fetchImpl: FetchLike,
  markerMap?: MarkerMap,
  options?: BrapiFetchOptions,
): Promise<BrapiGenotypes> {
  const session = openSession(source, fetchImpl, options);
  const { callSets, warnings: sampleWarnings } = await loadCallSets(session);
  const builder = new GenotypeBuilder(callSets.map((c) => c.sampleId));
  const colByCallSetDbId = new Map(callSets.map((c, i) => [c.callSetDbId, i] as const));

  // ---- variants (section 3.5) ----
  const variantRows = await fetchList(session, 'variants', session.pageSize.variants);
  const offsetByVariantDbId = new Map<string, number>();
  const markerIdByOffset = new Map<number, string>();
  const symbolsByOffset = new Map<number, string[]>();
  const basesKnownByOffset = new Map<number, boolean>();
  const maxIndexByOffset = new Map<number, number>();
  const variantDbIdByOffset = new Map<number, string>();
  const seenInMatrix = new Set<string>();
  variantRows.forEach((row, i) => {
    const r = isObject(row) ? row : {};
    const variantDbId = nonEmptyString(r['variantDbId']);
    if (variantDbId === undefined) {
      throw new BrapiError('brapi.bad_shape', `BrAPI: /variants row ${i} has no variantDbId`);
    }
    if (offsetByVariantDbId.has(variantDbId)) {
      throw new BrapiError(
        'brapi.bad_shape',
        `BrAPI: /variants lists variantDbId "${variantDbId}" more than once`,
      );
    }
    const markerId = markerIdOf(r, variantDbId);
    const referenceName = nonEmptyString(r['referenceName']);
    const start = r['start'];
    if (typeof start === 'string' || (typeof start === 'number' && !Number.isInteger(start))) {
      throw new BrapiError(
        'brapi.bad_shape',
        `BrAPI: variant "${markerId}" has a non-integer start`,
      );
    }
    let chrom: string;
    let pos: number;
    if (
      referenceName !== undefined &&
      typeof start === 'number' &&
      Number.isInteger(start) &&
      start >= 0
    ) {
      chrom = referenceName;
      pos = start + 1;
    } else {
      const entry = markerMap?.get(markerId);
      if (entry === undefined) {
        throw new BrapiError(
          'brapi.no_position',
          `BrAPI: variant "${markerId}" (${variantDbId}) has no referenceName or start; supply its chrom and pos_bp in markers.csv`,
        );
      }
      chrom = entry.chrom;
      pos = entry.posBp;
    }
    const referenceBases = nonEmptyString(r['referenceBases']);
    const alternateBases = r['alternateBases'];
    const basesKnown = referenceBases !== undefined;
    // Positions are kept: an empty or non-string alternate becomes its index as
    // text, the placeholder the finish step uses when no bases are known.
    const symbols: string[] = basesKnown
      ? [
          referenceBases,
          ...(Array.isArray(alternateBases)
            ? (alternateBases as unknown[]).map((b, k) => nonEmptyString(b) ?? String(k + 1))
            : []),
        ]
      : [];
    let offset: number;
    try {
      offset = builder.push(markerId, chrom, pos, symbols);
    } catch (e) {
      throw new Error(
        `BrAPI: variant ${variantDbId}: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
    offsetByVariantDbId.set(variantDbId, offset);
    markerIdByOffset.set(offset, markerId);
    variantDbIdByOffset.set(offset, variantDbId);
    symbolsByOffset.set(offset, symbols);
    basesKnownByOffset.set(offset, basesKnown);
    maxIndexByOffset.set(offset, -1);
  });
  if (variantRows.length === 0) {
    throw new BrapiError(
      'brapi.no_variants',
      `BrAPI: variant set ${session.variantSetDbId} has no variants`,
    );
  }

  // ---- allele matrix (section 3.6) ----
  const matrixUrl = (v: number, c: number): string => {
    const query = new URLSearchParams({
      variantSetDbId: session.variantSetDbId,
      dataMatrixAbbreviations: 'GT',
      dimensionVariantPage: String(v),
      dimensionVariantPageSize: String(session.pageSize.variants),
      dimensionCallSetPage: String(c),
      dimensionCallSetPageSize: String(session.pageSize.callSets),
    });
    return `${session.base}/allelematrix?${query.toString()}`;
  };
  const readPage = (result: Json, v: number, c: number): void => {
    const matrices = Array.isArray(result['dataMatrices'])
      ? (result['dataMatrices'] as unknown[])
      : [];
    const gt = matrices.find((m): m is Json => isObject(m) && m['dataMatrixAbbreviation'] === 'GT');
    if (gt === undefined) {
      throw new BrapiError(
        'brapi.no_gt_matrix',
        `BrAPI: /allelematrix page ${v},${c} has no GT data matrix`,
      );
    }
    const sepPhased = nonEmptyString(result['sepPhased']) ?? '|';
    const sepUnphased = nonEmptyString(result['sepUnphased']) ?? '/';
    const unknown = nonEmptyString(result['unknownString']) ?? '.';
    const stringArray = (key: string): string[] => {
      const x = result[key];
      if (!Array.isArray(x) || !(x as unknown[]).every((s) => typeof s === 'string')) {
        throw new BrapiError(
          'brapi.bad_shape',
          `BrAPI: /allelematrix page ${v},${c}: ${key} is not an array of strings`,
        );
      }
      return x as string[];
    };
    const variantDbIds = stringArray('variantDbIds');
    const callSetDbIds = stringArray('callSetDbIds').map((id) => id.trim());
    for (const ids of [variantDbIds, callSetDbIds]) {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) {
          throw new BrapiError('brapi.bad_shape', `BrAPI: /allelematrix page repeats id "${id}"`);
        }
        seen.add(id);
      }
    }
    const dataMatrix = Array.isArray(gt['dataMatrix']) ? (gt['dataMatrix'] as unknown[]) : [];
    const rows = dataMatrix.length;
    const firstRow = dataMatrix[0];
    const cols = Array.isArray(firstRow) ? firstRow.length : 0;
    const rectangular =
      Array.isArray(gt['dataMatrix']) &&
      rows === variantDbIds.length &&
      dataMatrix.every((row) => Array.isArray(row) && row.length === callSetDbIds.length);
    if (!rectangular) {
      throw new BrapiError(
        'brapi.bad_shape',
        `BrAPI: /allelematrix page ${v},${c}: dataMatrix is ${rows} x ${cols}, expected ${variantDbIds.length} x ${callSetDbIds.length}`,
      );
    }
    variantDbIds.forEach((variantDbId, i) => {
      const offset = offsetByVariantDbId.get(variantDbId);
      if (offset === undefined) {
        throw new BrapiError(
          'brapi.unknown_id',
          `BrAPI: /allelematrix names variant "${variantDbId}" that /variants did not list`,
        );
      }
      seenInMatrix.add(variantDbId);
      const markerId = markerIdByOffset.get(offset) as string;
      const symbols = symbolsByOffset.get(offset) as string[];
      const basesKnown = basesKnownByOffset.get(offset) as boolean;
      const row = dataMatrix[i] as unknown[];
      row.forEach((cell, j) => {
        const callSetDbId = callSetDbIds[j] as string;
        const col = colByCallSetDbId.get(callSetDbId);
        if (col === undefined) {
          throw new BrapiError(
            'brapi.unknown_id',
            `BrAPI: /allelematrix names call set "${callSetDbId}" that /callsets did not list`,
          );
        }
        if (cell === null || cell === undefined) return;
        if (typeof cell !== 'string') {
          throw new BrapiError(
            'brapi.bad_shape',
            `BrAPI: /allelematrix page ${v},${c}: variant "${markerId}", call set "${callSetDbId}" is not a string`,
          );
        }
        let x: number;
        let y: number;
        try {
          [x, y] = parseBrapiCall(cell, sepPhased, sepUnphased, unknown);
        } catch (e) {
          const inner = e instanceof Error ? e.message : String(e);
          throw new BrapiError(
            'brapi.invalid_call',
            `BrAPI: variant "${markerId}", call set "${callSetDbId}": ${inner}`,
          );
        }
        if (x === MISSING_ALLELE) return;
        if (basesKnown && y >= symbols.length) {
          throw new BrapiError(
            'brapi.invalid_call',
            `BrAPI: variant "${markerId}": allele index ${y} but only ${symbols.length} allele(s) listed`,
          );
        }
        if (y > (maxIndexByOffset.get(offset) as number)) maxIndexByOffset.set(offset, y);
        try {
          builder.setCall(offset, col, x, y);
        } catch (e) {
          throw new Error(
            `BrAPI: variant "${markerId}" (${variantDbId}): ${e instanceof Error ? e.message : String(e)}`,
            { cause: e },
          );
        }
      });
    });
  };

  const first = (await session.getJson(matrixUrl(0, 0)))['result'] as Json;
  const pagination = Array.isArray(first['pagination']) ? (first['pagination'] as unknown[]) : [];
  const dimensionPages = (dimension: string): number => {
    const entry = pagination.find((p): p is Json => isObject(p) && p['dimension'] === dimension);
    return totalPagesOf(entry?.['totalPages']);
  };
  const pv = dimensionPages('VARIANTS');
  const pc = dimensionPages('CALLSETS');
  for (let v = 0; v < pv; v++) {
    for (let c = 0; c < pc; c++) {
      const result =
        v === 0 && c === 0 ? first : ((await session.getJson(matrixUrl(v, c)))['result'] as Json);
      readPage(result, v, c);
    }
  }

  // ---- finish (section 3.7) ----
  for (const [offset, symbols] of symbolsByOffset) {
    if (basesKnownByOffset.get(offset) === true) continue;
    const maxIndex = maxIndexByOffset.get(offset) as number;
    symbols.push(...Array.from({ length: maxIndex + 1 }, (_, k) => String(k)));
  }
  const matrixWarnings: string[] = [];
  const unseen = [...variantDbIdByOffset.entries()]
    .filter(([, variantDbId]) => !seenInMatrix.has(variantDbId))
    .map(([offset]) => markerIdByOffset.get(offset) as string);
  if (unseen.length > 0) {
    matrixWarnings.push(
      `BrAPI: ${unseen.length} variant(s) absent from every /allelematrix page were loaded with all calls missing: ${unseen.slice(0, 5).join(', ')}${unseen.length > 5 ? ', ...' : ''}`,
    );
  }
  const parsed = builder.finish();
  return {
    ...parsed,
    coded: false,
    warnings: [...sampleWarnings, ...parsed.warnings, ...matrixWarnings],
    callSets,
    peakBuilderBytes: builder.peakBytes,
  };
}
