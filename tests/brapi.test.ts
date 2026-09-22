/**
 * BrAPI allele-matrix loader (src/io/brapi.ts; docs/m3-phase4-brapi.md section 9.2).
 * Every request is answered from tests/fixtures/brapi/ or an in-memory server;
 * nothing here touches the network.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MISSING_ALLELE } from '../src/core/types.ts';
import type { SampleRecord } from '../src/core/types.ts';
import { classifyDataset } from '../src/core/classify.ts';
import { computeRpp } from '../src/core/rpp.ts';
import { lineSummaryCsv } from '../src/export/summary-csv.ts';
import {
  BrapiError,
  explainAssembleError,
  assignSampleIds,
  attachCallSetIds,
  fetchBrapiGenotypes,
  parseBrapiCall,
} from '../src/io/brapi.ts';
import type { BrapiErrorKind, BrapiSource, FetchLike } from '../src/io/brapi.ts';
import { resolveCrop } from '../src/io/crops.ts';
import { assembleDataset } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import type { MarkerMap } from '../src/io/markers.ts';
import {
  BRAPI_FIXTURE_DIR,
  BRAPI_FIXTURE_FILES,
  BRAPI_FIXTURE_PAGE_SIZE,
  brapiFixtureFile,
} from './support/brapi-fixture.ts';
import { normaliseDataset } from './support/normalise.ts';
import type { ContractExpect } from './support/normalise.ts';
import { loadDataset, readFixture } from './helpers.ts';

const BASE = 'https://brapi.test/brapi/v2';
const source: BrapiSource = {
  baseUrl: BASE,
  variantSetDbId: 'variantset1',
  pageSize: BRAPI_FIXTURE_PAGE_SIZE,
};
const samples = parseSampleManifest(readFixture('samples.csv'));
const map = parseMarkerMap(readFixture('markers.csv'));
const VERSION = readFileSync(join(import.meta.dirname, '..', 'contract', 'VERSION'), 'utf8').trim();

const json = (body: unknown, status = 200): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fixtureFetch(mode: 'pos' | 'nopos') {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    urls.push(url);
    inits.push(init ?? {});
    const u = new URL(url);
    const file = brapiFixtureFile(u.pathname, u.searchParams, mode);
    if (file === null) return Promise.resolve(new Response('not found', { status: 404 }));
    return Promise.resolve(json(readFileSync(join(BRAPI_FIXTURE_DIR, file), 'utf8')));
  };
  return { fetchImpl, urls, inits };
}

/** The markers the BrAPI fixture carries (scripts/make-fixture.mjs): Gm13, plus hets, half-missing calls and a third allele. */
const EXTRA_MARKERS = new Set(['syn_Gm02_03', 'syn_Gm02_04', 'syn_Gm02_05', 'syn_Gm07_04']);
const inBrapiFixture = (id: string, chrom: string): boolean =>
  chrom === 'Gm13' || EXTRA_MARKERS.has(id);

function vcfBrapiMarkers(withMarkers: boolean): ContractExpect {
  const full = normaliseDataset(loadDataset('genotypes.vcf', 'vcf', withMarkers), VERSION);
  const idx = full.markers.flatMap((m, i) => (inBrapiFixture(m.id, m.chrom) ? [i] : []));
  const calls: ContractExpect['calls'] = {};
  for (const [s, row] of Object.entries(full.calls)) calls[s] = idx.map((i) => row[i] ?? null);
  return {
    ...full,
    markers: idx.map((i) => full.markers[i] as ContractExpect['markers'][number]),
    calls,
    chromosomeOrder: ['Gm02', 'Gm07', 'Gm13'],
  };
}

async function loadBrapi(mode: 'pos' | 'nopos', withMarkers: boolean, markerMap: MarkerMap = map) {
  const { fetchImpl } = fixtureFetch(mode);
  const m = withMarkers ? markerMap : undefined;
  const parsed = await fetchBrapiGenotypes(source, fetchImpl, m);
  const assembled = assembleDataset(parsed, attachCallSetIds(samples, parsed.callSets), m);
  return { parsed, ...assembled };
}

async function brapiErrorOf(p: Promise<unknown>): Promise<BrapiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof BrapiError) return e;
    throw e;
  }
  throw new Error('expected a BrapiError');
}

// ---- in-memory server ------------------------------------------------------
interface MemVariant {
  variantDbId: string;
  variantNames?: string[];
  referenceName?: string | null;
  start?: number | null;
  referenceBases?: string | null;
  alternateBases?: unknown[] | null;
}
interface MemServer {
  callSets: { callSetDbId: string; callSetName?: string; sampleDbId?: string }[];
  variants: MemVariant[];
  /** The /allelematrix result object (single page); defaults to a GT matrix of '0/0' cells. */
  matrix?: Record<string, unknown>;
  /** Omit metadata.pagination entirely. */
  noPagination?: boolean;
}

const posVariant = (id: string, i: number): MemVariant => ({
  variantDbId: id,
  variantNames: [id],
  referenceName: 'Gm01',
  start: 1000 * (i + 1),
  referenceBases: 'A',
  alternateBases: ['T'],
});

function memFetch(server: MemServer) {
  const urls: string[] = [];
  const envelope = (result: Record<string, unknown>) =>
    server.noPagination
      ? { metadata: {}, result }
      : { metadata: { pagination: { currentPage: 0, totalPages: 1 } }, result };
  const fetchImpl: FetchLike = (url) => {
    urls.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith('/callsets'))
      return Promise.resolve(json(envelope({ data: server.callSets })));
    if (u.pathname.endsWith('/variants'))
      return Promise.resolve(json(envelope({ data: server.variants })));
    if (u.pathname.endsWith('/allelematrix')) {
      const matrix = server.matrix ?? {
        callSetDbIds: server.callSets.map((c) => c.callSetDbId),
        variantDbIds: server.variants.map((v) => v.variantDbId),
        dataMatrices: [
          {
            dataMatrixAbbreviation: 'GT',
            dataMatrix: server.variants.map(() => server.callSets.map(() => '0/0')),
          },
        ],
      };
      return Promise.resolve(json(envelope(matrix)));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetchImpl, urls };
}

const fourCallSets = [
  { callSetDbId: 'cs1', callSetName: 'A', sampleDbId: 's1' },
  { callSetDbId: 'cs2', callSetName: 'dup', sampleDbId: 's2' },
  { callSetDbId: 'cs3', callSetName: 'dup', sampleDbId: 's3' },
  { callSetDbId: 'cs4', callSetName: 'D', sampleDbId: 's4' },
];
const twoVariants = [posVariant('v1', 0), posVariant('v2', 1)];
const memSource: BrapiSource = { baseUrl: BASE, variantSetDbId: 'vs' };

function record(sampleId: string, role: SampleRecord['role']): SampleRecord {
  return { sampleId, lineName: sampleId, role, generation: '', familyId: '', notes: '' };
}

// ---- tests ---------------------------------------------------------------------
describe('the crop scheme reaches the BrAPI builder (contract 1.5.0)', () => {
  // Maize, never soybean: soybean is the default and cannot distinguish
  // a threaded scheme from the fallback.
  const server: MemServer = {
    callSets: [{ callSetDbId: 'cs1', callSetName: 'RP' }],
    variants: [
      {
        variantDbId: 'v1',
        variantNames: ['r1'],
        referenceName: '2',
        start: 1000,
        referenceBases: 'A',
        alternateBases: ['T'],
      },
    ],
  };

  it('reads a referenceName of 2 as chr2 under maize and Gm02 by default', async () => {
    const { fetchImpl } = memFetch(server);
    const maize = await fetchBrapiGenotypes(memSource, fetchImpl, undefined, {
      scheme: resolveCrop('maize'),
    });
    expect(maize.markers.chrom).toEqual(['chr2']);
    const { fetchImpl: plainFetch } = memFetch(server);
    const soybean = await fetchBrapiGenotypes(memSource, plainFetch);
    expect(soybean.markers.chrom).toEqual(['Gm02']);
  });
});

describe('fetchBrapiGenotypes against the generated fixture', () => {
  it('equals the VCF-loaded fixture on the BrAPI markers with markers.csv', async () => {
    const { parsed, dataset, warnings } = await loadBrapi('pos', true);
    expect(normaliseDataset(dataset, VERSION)).toEqual(vcfBrapiMarkers(true));
    expect(parsed.coded).toBe(false);
    expect(warnings.some((w) => /differ from the genotype file/.test(w))).toBe(false);
  });

  it('equals the VCF-loaded fixture on the BrAPI markers without markers.csv', async () => {
    const { dataset } = await loadBrapi('pos', false);
    expect(normaliseDataset(dataset, VERSION)).toEqual(vcfBrapiMarkers(false));
  });

  it('uses variantDbId when variantNames is empty', async () => {
    const { dataset } = await loadBrapi('pos', true);
    expect(dataset.markers.ids).toContain('syn_Gm13_25');
    expect(dataset.markers.ids).not.toContain('variant29');
  });

  it('requests two call-set pages, two variant pages and exactly four GT matrix pages, in that order', async () => {
    const { fetchImpl, urls } = fixtureFetch('pos');
    await fetchBrapiGenotypes(source, fetchImpl);
    const matrix = (v: number, c: number) =>
      `${BASE}/allelematrix?variantSetDbId=variantset1&dataMatrixAbbreviations=GT&dimensionVariantPage=${v}&dimensionVariantPageSize=15&dimensionCallSetPage=${c}&dimensionCallSetPageSize=5`;
    expect(urls).toEqual([
      `${BASE}/callsets?variantSetDbId=variantset1&page=0&pageSize=5`,
      `${BASE}/callsets?variantSetDbId=variantset1&page=1&pageSize=5`,
      `${BASE}/variants?variantSetDbId=variantset1&page=0&pageSize=15`,
      `${BASE}/variants?variantSetDbId=variantset1&page=1&pageToken=1&pageSize=15`,
      matrix(0, 0),
      matrix(0, 1),
      matrix(1, 0),
      matrix(1, 1),
    ]);
  });

  it('sends Accept always and Authorization: Bearer only with a token', async () => {
    const withToken = fixtureFetch('pos');
    await fetchBrapiGenotypes({ ...source, token: 'secret-token' }, withToken.fetchImpl);
    expect(withToken.inits.length).toBe(8);
    for (const init of withToken.inits) {
      const headers = init.headers as Record<string, string>;
      expect(headers['Accept']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer secret-token');
      expect(init.credentials).toBe('omit');
    }
    const without = fixtureFetch('pos');
    await fetchBrapiGenotypes(source, without.fetchImpl);
    for (const init of without.inits) {
      const headers = init.headers as Record<string, string>;
      expect(headers['Accept']).toBe('application/json');
      expect('Authorization' in headers).toBe(false);
      expect(init.credentials).toBe('omit');
    }
  });

  it('never puts the token in an error message', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(new Response('no', { status: 401, statusText: 'Unauthorized' }));
    const err = await brapiErrorOf(
      fetchBrapiGenotypes({ ...source, token: 'secret-token' }, fetchImpl),
    );
    expect(err.kind).toBe('brapi.http');
    expect(err.message).toMatch(/HTTP 401/);
    expect(err.message).toMatch(/token/);
    expect(err.message).not.toContain('secret-token');
  });

  it('nopos: loads with markers.csv; markers equal the map and allele symbols are indices', async () => {
    const { dataset } = await loadBrapi('nopos', true);
    const normalised = normaliseDataset(dataset, VERSION);
    const expectedMarkers = [...map.entries()]
      .filter(([id, e]) => inBrapiFixture(id, e.chrom))
      .map(([id, e]) => ({ id, chrom: e.chrom, posBp: e.posBp, cm: e.cm }))
      .sort((a, b) => (a.chrom === b.chrom ? a.posBp - b.posBp : a.chrom < b.chrom ? -1 : 1));
    expect(expectedMarkers.length).toBe(29);
    expect(normalised.markers).toEqual(expectedMarkers);
    dataset.markers.ids.forEach((id, m) => {
      // syn_Gm07_04 carries the index-2 allele (NIL_03 "2/2"); every other marker two.
      expect(dataset.markers.alleles[m]).toEqual(
        id === 'syn_Gm07_04' ? ['0', '1', '2'] : ['0', '1'],
      );
    });
    const vcf = vcfBrapiMarkers(true);
    for (const [s, row] of Object.entries(vcf.calls)) {
      expect(normalised.calls[s]?.map((c) => c === null)).toEqual(row.map((c) => c === null));
    }
  });

  it('nopos without markers.csv rejects naming the first marker without a position', async () => {
    const { fetchImpl } = fixtureFetch('nopos');
    const err = await brapiErrorOf(fetchBrapiGenotypes(source, fetchImpl));
    expect(err.message).toMatch(/syn_Gm02_03/);
    expect(err.kind).toBe('brapi.no_position');
  });

  it('nopos with markers.csv lacking one marker rejects naming it', async () => {
    const partial = new Map(map);
    partial.delete('syn_Gm13_07');
    await expect(loadBrapi('nopos', true, partial)).rejects.toThrow(/syn_Gm13_07/);
  });

  it('reports peakBuilderBytes from the builder', async () => {
    const { parsed } = await loadBrapi('pos', true);
    expect(parsed.peakBuilderBytes).toBeGreaterThan(0);
  });

  it('tests/fixtures/brapi is exactly the nine generated files and under 64 KB', () => {
    const files = readdirSync(BRAPI_FIXTURE_DIR).sort();
    expect(files).toEqual([...BRAPI_FIXTURE_FILES].sort());
    const total = files.reduce((sum, f) => sum + statSync(join(BRAPI_FIXTURE_DIR, f)).size, 0);
    expect(total).toBeLessThan(65_536);
  });
});

describe('parseBrapiCall', () => {
  it('parseBrapiCall: table', () => {
    const M = MISSING_ALLELE;
    expect(parseBrapiCall('1|0', '/', '|', '.')).toEqual([0, 1]);
    expect(parseBrapiCall('.', '/', '|', '.')).toEqual([M, M]);
    expect(parseBrapiCall('1', '/', '|', '.')).toEqual([1, 1]);
    expect(parseBrapiCall('0/1', '/', '|', '.')).toEqual([0, 1]);
    expect(parseBrapiCall('2/0', '/', '|', '.')).toEqual([0, 2]);
    expect(parseBrapiCall('./1', '/', '|', '.')).toEqual([M, M]);
    expect(parseBrapiCall('1/.', '/', '|', '.')).toEqual([M, M]);
    expect(parseBrapiCall('', '/', '|', '.')).toEqual([M, M]);
    expect(parseBrapiCall('NA', '/', '|', 'NA')).toEqual([M, M]);
    expect(parseBrapiCall(' 0/1 ', '/', '|', '.')).toEqual([0, 1]);
    expect(() => parseBrapiCall('0/1/2', '/', '|', '.')).toThrow(/diploid/);
    expect(() => parseBrapiCall('0|1/2', '/', '|', '.')).toThrow(/both separators/);
    expect(() => parseBrapiCall('A/T', '/', '|', '.')).toThrow(/invalid GT token/);
    expect(parseBrapiCall('0|1', '/', '|', '.')).toEqual([0, 1]);
  });
});

describe('sample ids', () => {
  it('assignSampleIds: unique names, missing names, collisions, post-fallback duplicate', () => {
    const { callSets, warnings } = assignSampleIds([
      { callSetName: 'A', callSetDbId: 'cs1', sampleDbId: '' },
      { callSetName: '', callSetDbId: 'cs2', sampleDbId: '' },
      { callSetName: 'dup', callSetDbId: 'cs3', sampleDbId: '' },
      { callSetName: 'dup', callSetDbId: 'cs4', sampleDbId: '' },
    ]);
    expect(callSets.map((c) => c.sampleId)).toEqual(['A', 'cs2', 'cs3', 'cs4']);
    expect(warnings).toEqual([
      'BrAPI: 2 call sets share the name "dup"; their sample_id is the callSetDbId: cs3, cs4',
    ]);
    let thrown: unknown;
    try {
      assignSampleIds([
        { callSetName: 'cs2', callSetDbId: 'cs1', sampleDbId: '' },
        { callSetName: 'x', callSetDbId: 'cs2', sampleDbId: '' },
        { callSetName: 'x', callSetDbId: 'cs3', sampleDbId: '' },
      ]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BrapiError);
    expect((thrown as BrapiError).kind).toBe('brapi.bad_shape');
    expect((thrown as BrapiError).message).toMatch(/not unique/);
    const trimmed = assignSampleIds([{ callSetName: ' B ', callSetDbId: 'cs1', sampleDbId: '' }]);
    expect(trimmed.callSets[0]?.sampleId).toBe('B');
  });

  it('loads a variant set with colliding call-set names under their DbIds', async () => {
    const { fetchImpl } = memFetch({ callSets: fourCallSets, variants: twoVariants });
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    expect(parsed.genotypes.sampleIds).toEqual(['A', 'cs2', 'cs3', 'D']);
    expect(parsed.warnings).toContain(
      'BrAPI: 2 call sets share the name "dup"; their sample_id is the callSetDbId: cs2, cs3',
    );
    const manifest = [
      record('A', 'recurrent_parent'),
      record('cs2', 'donor_parent'),
      record('unmatched', 'candidate'),
    ];
    const attached = attachCallSetIds(manifest, parsed.callSets);
    expect(attached[0]?.callSetDbId).toBe('cs1');
    expect(attached[0]?.sampleDbId).toBe('s1');
    expect(attached[1]?.callSetDbId).toBe('cs2');
    expect(attached[1]?.sampleDbId).toBe('s2');
    expect('callSetDbId' in (attached[2] as SampleRecord)).toBe(false);
  });
});

describe('maps failures to BrapiError kinds', () => {
  const expectKind = async (fetchImpl: FetchLike, kind: BrapiErrorKind, pattern?: RegExp) => {
    const err = await brapiErrorOf(fetchBrapiGenotypes(memSource, fetchImpl));
    expect(err.kind).toBe(kind);
    if (pattern) expect(err.message).toMatch(pattern);
    return err;
  };
  const gtMatrix = (overrides: Record<string, unknown>) => ({
    callSetDbIds: fourCallSets.map((c) => c.callSetDbId),
    variantDbIds: ['v1', 'v2'],
    dataMatrices: [
      { dataMatrixAbbreviation: 'GT', dataMatrix: [0, 1].map(() => fourCallSets.map(() => '0/0')) },
    ],
    ...overrides,
  });

  it('network failure', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    const err = await expectKind(fetchImpl, 'brapi.network');
    expect(err.message).toContain(`${BASE}/callsets?`);
    expect(err.message).toContain('Access-Control-Allow-Origin');
  });

  it('HTTP 500', async () => {
    await expectKind(() => Promise.resolve(new Response('boom', { status: 500 })), 'brapi.http');
  });

  it('body that is not JSON', async () => {
    await expectKind(() => Promise.resolve(json('<html>')), 'brapi.not_json');
  });

  it('body without a result object', async () => {
    await expectKind(() => Promise.resolve(json({})), 'brapi.bad_shape');
  });

  it('no GT data matrix', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      matrix: gtMatrix({ dataMatrices: [{ dataMatrixAbbreviation: 'AD', dataMatrix: [] }] }),
    });
    await expectKind(fetchImpl, 'brapi.no_gt_matrix');
  });

  it('matrix naming an unlisted variant', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      matrix: gtMatrix({ variantDbIds: ['v1', 'variantX'] }),
    });
    await expectKind(fetchImpl, 'brapi.unknown_id', /variantX/);
  });

  it('matrix naming an unlisted call set', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      matrix: gtMatrix({ callSetDbIds: ['cs1', 'cs2', 'cs3', 'csX'] }),
    });
    await expectKind(fetchImpl, 'brapi.unknown_id', /csX/);
  });

  it('matrix of the wrong dimensions', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      matrix: gtMatrix({
        dataMatrices: [
          {
            dataMatrixAbbreviation: 'GT',
            dataMatrix: [
              ['0/0', '0/0'],
              ['0/0', '0/0'],
              ['0/0', '0/0'],
            ],
          },
        ],
      }),
    });
    await expectKind(fetchImpl, 'brapi.bad_shape', /is 3 x 2, expected 2 x 4/);
  });

  it('allele index beyond the listed bases', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      matrix: gtMatrix({
        dataMatrices: [
          {
            dataMatrixAbbreviation: 'GT',
            dataMatrix: [
              ['2/2', '0/0', '0/0', '0/0'],
              ['0/0', '0/0', '0/0', '0/0'],
            ],
          },
        ],
      }),
    });
    await expectKind(fetchImpl, 'brapi.invalid_call', /allele index 2 but only 2/);
  });

  it('no call sets', async () => {
    const { fetchImpl } = memFetch({ callSets: [], variants: twoVariants });
    await expectKind(fetchImpl, 'brapi.no_call_sets');
  });

  it('no variants', async () => {
    const { fetchImpl } = memFetch({ callSets: fourCallSets, variants: [] });
    await expectKind(fetchImpl, 'brapi.no_variants');
  });
});

describe('request control', () => {
  it('rejects with brapi.timeout when a request exceeds requestTimeoutMs', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(signal.reason as Error));
      });
    const err = await brapiErrorOf(
      fetchBrapiGenotypes(memSource, fetchImpl, undefined, { requestTimeoutMs: 20 }),
    );
    expect(err.kind).toBe('brapi.timeout');
    expect(err.message).toMatch(/did not respond within 0.02 s/);
  });

  it('rejects with brapi.cancelled when the signal aborts', async () => {
    const controller = new AbortController();
    const urls: string[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      urls.push(url);
      controller.abort();
      return Promise.reject((init?.signal?.reason as Error | undefined) ?? new Error('aborted'));
    };
    const err = await brapiErrorOf(
      fetchBrapiGenotypes(memSource, fetchImpl, undefined, { signal: controller.signal }),
    );
    expect(err.kind).toBe('brapi.cancelled');
    expect(urls.length).toBe(1);
  });

  it('rejects with brapi.cancelled without fetching when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl, urls } = memFetch({ callSets: fourCallSets, variants: twoVariants });
    const err = await brapiErrorOf(
      fetchBrapiGenotypes(memSource, fetchImpl, undefined, { signal: controller.signal }),
    );
    expect(err.kind).toBe('brapi.cancelled');
    expect(urls).toEqual([]);
  });

  it('normalises the base URL and rejects non-http schemes', async () => {
    const { fetchImpl, urls } = memFetch({ callSets: fourCallSets, variants: twoVariants });
    await fetchBrapiGenotypes({ ...memSource, baseUrl: 'https://h/brapi/v2/' }, fetchImpl);
    expect(urls[0]?.startsWith('https://h/brapi/v2/callsets?')).toBe(true);
    for (const baseUrl of ['ftp://h', '']) {
      const err = await brapiErrorOf(fetchBrapiGenotypes({ ...memSource, baseUrl }, fetchImpl));
      expect(err.kind).toBe('brapi.bad_url');
    }
  });

  it('treats a response without totalPages as a single page', async () => {
    const { fetchImpl, urls } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      noPagination: true,
    });
    await fetchBrapiGenotypes(memSource, fetchImpl);
    expect(urls.filter((u) => u.includes('/callsets?')).length).toBe(1);
    expect(urls.filter((u) => u.includes('/variants?')).length).toBe(1);
    expect(urls.filter((u) => u.includes('/allelematrix?')).length).toBe(1);
  });

  it('warns and leaves calls missing for a variant no matrix page names', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: twoVariants,
      matrix: {
        callSetDbIds: fourCallSets.map((c) => c.callSetDbId),
        variantDbIds: ['v1'],
        dataMatrices: [
          { dataMatrixAbbreviation: 'GT', dataMatrix: [['0/0', '1/1', '0/1', '0/0']] },
        ],
      },
    });
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    expect(
      parsed.warnings.some((w) => /1 variant\(s\) absent from every \/allelematrix page/.test(w)),
    ).toBe(true);
    const manifest = [
      record('A', 'recurrent_parent'),
      record('cs2', 'donor_parent'),
      record('cs3', 'candidate'),
      record('D', 'candidate'),
    ];
    const { dataset } = assembleDataset(parsed, attachCallSetIds(manifest, parsed.callSets));
    const normalised = normaliseDataset(dataset, VERSION);
    const m = normalised.markers.findIndex((mk) => mk.id === 'v2');
    expect(m).toBeGreaterThanOrEqual(0);
    for (const row of Object.values(normalised.calls)) expect(row[m]).toBeNull();
  });

  it('honours sepPhased, sepUnphased and unknownString from the response', async () => {
    const callSets = [
      { callSetDbId: 'cs1', callSetName: 'A' },
      { callSetDbId: 'cs2', callSetName: 'B' },
      { callSetDbId: 'cs3', callSetName: 'C' },
    ];
    const { fetchImpl } = memFetch({
      callSets,
      variants: [posVariant('v1', 0)],
      matrix: {
        callSetDbIds: ['cs1', 'cs2', 'cs3'],
        variantDbIds: ['v1'],
        sepPhased: '#',
        sepUnphased: ':',
        unknownString: 'NN',
        dataMatrices: [{ dataMatrixAbbreviation: 'GT', dataMatrix: [['0:1', 'NN', '1#0']] }],
      },
    });
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    const pair = (col: number) => [parsed.genotypes.allele1[col], parsed.genotypes.allele2[col]];
    expect(pair(0)).toEqual([0, 1]);
    expect(pair(1)).toEqual([MISSING_ALLELE, MISSING_ALLELE]);
    expect(pair(2)).toEqual([0, 1]);
  });
});

const gtMatrixOf = (variantDbIds: string[], callSetDbIds: string[]) => ({
  callSetDbIds,
  variantDbIds,
  dataMatrices: [
    {
      dataMatrixAbbreviation: 'GT',
      dataMatrix: variantDbIds.map(() => callSetDbIds.map(() => '0/0')),
    },
  ],
});
const csIds = fourCallSets.map((c) => c.callSetDbId);

describe('review fixes', () => {
  it('rejects an allelematrix page that repeats a call set or a variant id', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [gtMatrixOf(['v1', 'v2'], ['cs1', 'cs2', 'cs2', 'cs4']), 'cs2'],
      [gtMatrixOf(['v1', 'v1'], csIds), 'v1'],
    ];
    for (const [matrix, id] of cases) {
      const { fetchImpl } = memFetch({ callSets: fourCallSets, variants: twoVariants, matrix });
      const err = await brapiErrorOf(fetchBrapiGenotypes(memSource, fetchImpl));
      expect(err.kind).toBe('brapi.bad_shape');
      expect(err.message).toBe(`BrAPI: /allelematrix page repeats id "${id}"`);
    }
  });

  it('maps a cancel or a timeout while reading the body to cancelled or timeout, not not_json', async () => {
    const stalled = () =>
      new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const timedOut = await brapiErrorOf(
      fetchBrapiGenotypes(memSource, () => Promise.resolve(stalled()), undefined, {
        requestTimeoutMs: 20,
      }),
    );
    expect(timedOut.kind).toBe('brapi.timeout');
    const controller = new AbortController();
    const fetchImpl: FetchLike = () => {
      setTimeout(() => controller.abort(), 10);
      return Promise.resolve(stalled());
    };
    const cancelled = await brapiErrorOf(
      fetchBrapiGenotypes(memSource, fetchImpl, undefined, { signal: controller.signal }),
    );
    expect(cancelled.kind).toBe('brapi.cancelled');
  });

  it('rejects a /variants response that lists a variantDbId twice', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: [posVariant('v1', 0), posVariant('v1', 1)],
    });
    const err = await brapiErrorOf(fetchBrapiGenotypes(memSource, fetchImpl));
    expect(err.kind).toBe('brapi.bad_shape');
    expect(err.message).toBe('BrAPI: /variants lists variantDbId "v1" more than once');
  });

  it('adds call-set name collisions to an "absent from the genotype file" failure', async () => {
    const { fetchImpl } = memFetch({ callSets: fourCallSets, variants: twoVariants });
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    const manifest = [record('A', 'recurrent_parent'), record('dup', 'donor_parent')];
    let thrown: unknown;
    try {
      assembleDataset(parsed, attachCallSetIds(manifest, parsed.callSets));
    } catch (e) {
      thrown = explainAssembleError(e, parsed.warnings);
    }
    expect((thrown as Error).message).toBe(
      'samples.csv lists sample(s) absent from the genotype file: dup; note: BrAPI: 2 call sets share the name "dup"; their sample_id is the callSetDbId: cs2, cs3',
    );
    const other = new Error('something else');
    expect(explainAssembleError(other, parsed.warnings)).toBe(other);
  });

  it('rejects a base URL carrying a user name or password', async () => {
    const { fetchImpl, urls } = memFetch({ callSets: fourCallSets, variants: twoVariants });
    for (const baseUrl of ['https://user:pw@h/brapi/v2', 'https://user@h/brapi/v2']) {
      const err = await brapiErrorOf(fetchBrapiGenotypes({ ...memSource, baseUrl }, fetchImpl));
      expect(err.kind).toBe('brapi.bad_url');
      expect(err.message).toBe(
        'BrAPI: base URL must not contain a user name or password; use the token field',
      );
    }
    expect(urls).toEqual([]);
  });

  it('keeps allele positions when an alternate base is empty or not a string', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets.slice(0, 2),
      variants: [{ ...posVariant('v1', 0), alternateBases: ['', 7, 'G'] }],
      matrix: {
        callSetDbIds: ['cs1', 'cs2'],
        variantDbIds: ['v1'],
        dataMatrices: [{ dataMatrixAbbreviation: 'GT', dataMatrix: [['3/3', '0/1']] }],
      },
    });
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    expect(parsed.markers.alleles[0]).toEqual(['A', '1', '2', 'G']);
    expect([parsed.genotypes.allele1[0], parsed.genotypes.allele2[0]]).toEqual([3, 3]);
  });

  it('follows an opaque nextPageToken on /variants', async () => {
    const urls: string[] = [];
    const pages = [[posVariant('v1', 0)], [posVariant('v2', 1)]];
    const fetchImpl: FetchLike = (url) => {
      urls.push(url);
      const u = new URL(url);
      if (u.pathname.endsWith('/callsets')) {
        return Promise.resolve(json({ metadata: {}, result: { data: fourCallSets } }));
      }
      if (u.pathname.endsWith('/variants')) {
        const page = u.searchParams.get('pageToken') === 'opaque-2' ? 1 : 0;
        const nextPageToken = page === 0 ? 'opaque-2' : '';
        return Promise.resolve(
          json({
            metadata: { pagination: { totalPages: 2, nextPageToken } },
            result: { data: pages[page] },
          }),
        );
      }
      return Promise.resolve(json({ metadata: {}, result: gtMatrixOf(['v1', 'v2'], csIds) }));
    };
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    expect(parsed.markers.ids).toEqual(['v1', 'v2']);
    expect(urls.filter((u) => u.includes('/variants?'))).toEqual([
      `${BASE}/variants?variantSetDbId=vs&page=0&pageSize=1000`,
      `${BASE}/variants?variantSetDbId=vs&pageToken=opaque-2&pageSize=1000`,
    ]);
  });

  it('rejects /variants paging that returns an earlier page again', async () => {
    const fetchImpl: FetchLike = (url) => {
      if (new URL(url).pathname.endsWith('/callsets')) {
        return Promise.resolve(json({ metadata: {}, result: { data: fourCallSets } }));
      }
      // A server that ignores both page and pageToken.
      return Promise.resolve(
        json({ metadata: { pagination: { totalPages: 2 } }, result: { data: twoVariants } }),
      );
    };
    const err = await brapiErrorOf(fetchBrapiGenotypes(memSource, fetchImpl));
    expect(err.kind).toBe('brapi.bad_shape');
    expect(err.message).toBe(
      'BrAPI: /variants page 1 repeated an earlier page; the server ignored paging',
    );
  });

  it('never puts the token in a network error message', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.reject(new TypeError('Failed to fetch with Bearer secret-token'));
    const err = await brapiErrorOf(
      fetchBrapiGenotypes({ ...memSource, token: 'secret-token' }, fetchImpl),
    );
    expect(err.kind).toBe('brapi.network');
    expect(err.message).not.toContain('secret-token');
  });

  it('writes non-empty call_set_db_id and sample_db_id into an export of a BrAPI-loaded dataset', async () => {
    const { dataset } = await loadBrapi('pos', true);
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls, { maxGapBp: 2_000_000, maxGapCm: 10 });
    const csv = lineSummaryCsv(rpp, dataset.chromosomeOrder, dataset.samples, {
      tokenProfile: 'default',
    });
    const row = csv.split('\n').find((l) => l.startsWith('NIL_01,'));
    expect(row?.startsWith('NIL_01,callset3,sample3,')).toBe(true);
  });

  it('rejects a non-integer start and an allele index of 255 or more', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: [{ ...posVariant('v1', 0), start: 10.5 }],
    });
    const err = await brapiErrorOf(fetchBrapiGenotypes(memSource, fetchImpl));
    expect(err.message).toBe('BrAPI: variant "v1" has a non-integer start');
    expect(() => parseBrapiCall('255/0', '|', '/', '.')).toThrow(/out of range/);
  });

  it('prefixes a duplicate marker id from the builder with BrAPI and the variantDbId', async () => {
    const { fetchImpl } = memFetch({
      callSets: fourCallSets,
      variants: [
        { ...posVariant('v1', 0), variantNames: ['M'] },
        { ...posVariant('v2', 1), variantNames: ['M'] },
      ],
    });
    await expect(fetchBrapiGenotypes(memSource, fetchImpl)).rejects.toThrow(
      /^BrAPI: variant v2: duplicate marker id: M$/,
    );
  });

  it('trims callSetDbId as it trims names', async () => {
    const { fetchImpl } = memFetch({
      callSets: [
        { callSetDbId: ' cs1 ', callSetName: 'A' },
        { callSetDbId: 'cs2', callSetName: 'B' },
      ],
      variants: [posVariant('v1', 0)],
      matrix: {
        callSetDbIds: ['cs1', 'cs2'],
        variantDbIds: ['v1'],
        dataMatrices: [{ dataMatrixAbbreviation: 'GT', dataMatrix: [['0/1', '1/1']] }],
      },
    });
    const parsed = await fetchBrapiGenotypes(memSource, fetchImpl);
    expect(parsed.callSets[0]?.callSetDbId).toBe('cs1');
  });
});
