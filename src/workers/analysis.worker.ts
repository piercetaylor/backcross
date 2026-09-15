/**
 * Analysis Web Worker.
 *
 * Responsibility: keep parsing and computation off the main thread. The UI
 * posts the genotype `File` itself (a Blob, cloned by reference), the two
 * small CSVs as ArrayBuffers (transferred, not copied) and analysis
 * parameters. 'load' reads the genotype Blob as a stream (`blobBytes`), or
 * an ArrayBuffer through `bytesOf`, and awaits `parseGenotypesSource`, so
 * a bgzipped VCF is inflated and parsed chunk by chunk and its inflated text
 * is never held (docs/adr/0012). The worker parses, assembles the Dataset, classifies, computes
 * RPP/QC/segments/targets/compare/markerDetail, and posts results back. Typed-array
 * results are transferred: arrays that alias resident state (the dataset,
 * the classification matrix) are copied first with `.slice()` so the copy's
 * buffer can be handed over without disturbing what the worker still needs;
 * arrays allocated fresh for one response (informativeGapsBp, the QC marker
 * arrays, chromLengthsBp, compare's discordantMarkers) are transferred
 * directly. `dataset`, `classification`
 * and the last computed `LineRpp[]` stay resident in the worker for
 * follow-up requests so the main thread never holds the genotype matrix.
 *
 * 'loadBrapi' fetches a BrAPI v2.1 variant set through `fetchBrapiGenotypes`
 * (src/io/brapi.ts, the only module that calls fetch) and assembles it with
 * samples.csv and markers.csv exactly as 'load' does; its `loaded` reports
 * `bytesInflated` 0 and the builder's `peakBuilderBytes`. 'brapiCallSets'
 * pages /callsets only. Both keep an AbortController for the in-flight fetch;
 * 'cancelBrapi' is handled out of band in onmessage, not queued, so it
 * reaches the worker while the load it cancels is still running.
 *
 * `handle` is async because 'load' is. Requests are queued and handled one
 * at a time in arrival order, as the synchronous handler did, so a request
 * posted while a load is still reading never sees a half-replaced dataset.
 *
 * Protocol (src/workers/protocol.ts): request {id, type, payload} ->
 * response {id, ok: true, result} | {id, ok: false, error}.
 */
import {
  CALL_CLASS_LABEL,
  DEFAULT_RPP_PARAMS,
  MISSING_ALLELE,
  callSegments,
  checkTargets,
  classifyDataset,
  compareLines,
  computeQc,
  computeRpp,
  countInformative,
  parseTargetSpec,
  segmentGapCriterion,
} from '../core/index.ts';
import { classAt, resolveSample } from '../core/compare.ts';
import type { Classification, Dataset, LineRpp } from '../core/types.ts';
import {
  attachCallSetIds,
  explainAssembleError,
  fetchBrapiCallSets,
  fetchBrapiGenotypes,
  normaliseBaseUrl,
} from '../io/brapi.ts';
import type { BrapiGenotypes, FetchLike } from '../io/brapi.ts';
import { assembleDataset, parseGenotypesSource } from '../io/loaders.ts';
import { blobBytes, bytesOf } from '../io/stream.ts';
import { parseSampleManifest } from '../io/manifest.ts';
import { parseMarkerMap } from '../io/markers.ts';
import { discordantMarkersCsv } from '../export/pairwise-csv.ts';
import type { DatasetSource, WorkerRequest, WorkerResponse, WorkerResult } from './protocol.ts';

let dataset: Dataset | null = null;
let classification: Classification | null = null;
let lastRpp: LineRpp[] | null = null;
let brapiAbort: AbortController | null = null;
const fetchImpl: FetchLike = (url, init) => fetch(url, init);

const decoder = new TextDecoder();

/** Sorted ascending gaps (bp) between consecutive informative markers on the same chromosome. */
function computeInformativeGaps(ds: Dataset, cls: Classification): Float64Array {
  const { chromIndex, sortedMarkerOrder, markers } = ds;
  const gaps: number[] = [];
  let prevChrom = -1;
  let prevPos = NaN;
  for (let k = 0; k < sortedMarkerOrder.length; k++) {
    const m = sortedMarkerOrder[k] as number;
    if (cls.informative[m] === 0) continue;
    const c = chromIndex[m] as number;
    const pos = markers.posBp[m] as number;
    if (c === prevChrom) gaps.push(pos - prevPos);
    prevChrom = c;
    prevPos = pos;
  }
  gaps.sort((a, b) => a - b);
  return Float64Array.from(gaps);
}

/** Max marker position per chromosome, in chromosomeOrder, bp. */
function computeChromLengthsBp(ds: Dataset): Float64Array {
  const lengths = new Float64Array(ds.chromosomeOrder.length);
  const { chromIndex, markers } = ds;
  for (let m = 0; m < markers.posBp.length; m++) {
    const c = chromIndex[m] as number;
    const pos = markers.posBp[m] as number;
    if (pos > (lengths[c] as number)) lengths[c] = pos;
  }
  return lengths;
}

/** Row index into a candidate-major matrix (classes, segments) for a sample id. */
function candidateRowForSample(ds: Dataset, cls: Classification, sampleId: string): number {
  const col = ds.genotypes.sampleIds.indexOf(sampleId);
  if (col < 0) throw new Error(`unknown sample: ${sampleId}`);
  const row = Array.from(cls.candidateCols).indexOf(col);
  if (row < 0) throw new Error(`sample is not a candidate: ${sampleId}`);
  return row;
}

function requireLoaded(): { dataset: Dataset; classification: Classification } {
  if (dataset === null || classification === null) throw new Error('no dataset loaded');
  return { dataset, classification };
}

/** Makes `out` the resident dataset, classifies it and builds the 'loaded' response. */
function loadedResult(
  id: number,
  out: { dataset: Dataset; warnings: string[] },
  extra: { bytesInflated: number; peakBuilderBytes: number; source: DatasetSource },
): WorkerResponse {
  dataset = out.dataset;
  classification = classifyDataset(dataset);
  lastRpp = null;
  return {
    id,
    ok: true,
    result: {
      type: 'loaded',
      nMarkers: dataset.genotypes.nMarkers,
      nSamples: dataset.genotypes.nSamples,
      chromosomeOrder: dataset.chromosomeOrder,
      warnings: out.warnings,
      samples: dataset.samples,
      nInformative: countInformative(classification),
      hasCm: dataset.markers.cm !== undefined,
      gapCriterion: segmentGapCriterion(dataset),
      coded: dataset.coded,
      informativeGapsBp: computeInformativeGaps(dataset, classification),
      bytesInflated: extra.bytesInflated,
      peakBuilderBytes: extra.peakBuilderBytes,
      residentMatrixBytes:
        dataset.genotypes.allele1.byteLength + dataset.genotypes.allele2.byteLength,
      source: extra.source,
    },
  };
}

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  switch (req.type) {
    case 'load': {
      const p = req.payload;
      const source =
        p.genotypes instanceof Blob ? blobBytes(p.genotypes) : bytesOf(new Uint8Array(p.genotypes));
      const parsed = await parseGenotypesSource(p.genotypeFileName, source);
      const samples = parseSampleManifest(decoder.decode(p.samples));
      const map = p.markers === undefined ? undefined : parseMarkerMap(decoder.decode(p.markers));
      const out = assembleDataset(parsed, samples, map);
      return loadedResult(req.id, out, {
        bytesInflated: parsed.bytesInflated,
        peakBuilderBytes: parsed.peakBuilderBytes,
        source: { kind: 'files', genotypeFileName: p.genotypeFileName },
      });
    }
    case 'loadBrapi': {
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
      let out: { dataset: Dataset; warnings: string[] };
      try {
        out = assembleDataset(parsed, attachCallSetIds(samples, parsed.callSets), map);
      } catch (e) {
        // A samples.csv id missing from the variant set may be a call set renamed to its DbId.
        throw explainAssembleError(e, parsed.warnings);
      }
      return loadedResult(req.id, out, {
        bytesInflated: 0,
        peakBuilderBytes: parsed.peakBuilderBytes,
        source: {
          kind: 'brapi',
          baseUrl: normaliseBaseUrl(p.source.baseUrl),
          variantSetDbId: p.source.variantSetDbId.trim(),
        },
      });
    }
    case 'brapiCallSets': {
      brapiAbort = new AbortController();
      const { signal } = brapiAbort;
      try {
        const r = await fetchBrapiCallSets(req.payload.source, fetchImpl, { signal });
        return {
          id: req.id,
          ok: true,
          result: { type: 'brapiCallSets', callSets: r.callSets, warnings: r.warnings },
        };
      } finally {
        brapiAbort = null;
      }
    }
    case 'cancelBrapi':
      return { id: req.id, ok: true, result: { type: 'cancelBrapi' } };
    case 'rpp': {
      const { dataset: ds, classification: cls } = requireLoaded();
      lastRpp = computeRpp(ds, cls, req.payload);
      return { id: req.id, ok: true, result: { type: 'rpp', lines: lastRpp } };
    }
    case 'qc': {
      const { dataset: ds, classification: cls } = requireLoaded();
      if (lastRpp === null) lastRpp = computeRpp(ds, cls, DEFAULT_RPP_PARAMS);
      const report = computeQc(ds, cls, lastRpp, req.payload);
      return { id: req.id, ok: true, result: { type: 'qc', report } };
    }
    case 'segments': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const row = candidateRowForSample(ds, cls, req.payload.sampleId);
      const segments = callSegments(ds, cls, row, req.payload.params, req.payload.includeShort);
      return {
        id: req.id,
        ok: true,
        result: {
          type: 'segments',
          sampleId: req.payload.sampleId,
          segments,
          gapCriterion: segmentGapCriterion(ds),
        },
      };
    }
    case 'segmentsAll': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const byCandidate = Array.from(cls.candidateCols, (_col, row) =>
        callSegments(ds, cls, row, req.payload.params, false),
      );
      return {
        id: req.id,
        ok: true,
        result: { type: 'segmentsAll', byCandidate, gapCriterion: segmentGapCriterion(ds) },
      };
    }
    case 'targets': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const regions = req.payload.specs.map((spec) => parseTargetSpec(spec, ds));
      const byCandidate = Array.from(cls.candidateCols, (_col, row) =>
        callSegments(ds, cls, row, req.payload.params, false),
      );
      const checks = checkTargets(ds, cls, byCandidate, regions);
      return { id: req.id, ok: true, result: { type: 'targets', regions, checks } };
    }
    case 'classes': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const nMarkers = cls.nMarkers;
      const rowByCol = new Map(Array.from(cls.candidateCols).map((col, row) => [col, row]));
      const lines = req.payload.sampleIds.map((sampleId) => {
        const col = ds.genotypes.sampleIds.indexOf(sampleId);
        const row = col >= 0 ? rowByCol.get(col) : undefined;
        if (row === undefined) throw new Error(`sample is not a candidate: ${sampleId}`);
        const base = row * nMarkers;
        return { sampleId, classes: cls.classes.slice(base, base + nMarkers) };
      });
      return {
        id: req.id,
        ok: true,
        result: {
          type: 'classes',
          chromosomeOrder: ds.chromosomeOrder,
          chromLengthsBp: computeChromLengthsBp(ds),
          markerChromIndex: ds.chromIndex.slice(),
          markerPosBp: ds.markers.posBp.slice(),
          sortedMarkerOrder: ds.sortedMarkerOrder.slice(),
          informative: cls.informative.slice(),
          lines,
        },
      };
    }
    case 'markerDetail': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const { markerIndex, sampleIds } = req.payload;
      const nMarkersTotal = ds.markers.ids.length;
      if (markerIndex < 0 || markerIndex >= nMarkersTotal) {
        throw new Error(`markerDetail: marker index out of range: ${markerIndex}`);
      }
      const markerId = ds.markers.ids[markerIndex] as string;
      const chrom = ds.chromosomeOrder[ds.chromIndex[markerIndex] as number] as string;
      const posBp = ds.markers.posBp[markerIndex] as number;
      const cm = ds.markers.cm === undefined ? NaN : (ds.markers.cm[markerIndex] as number);
      const informative = cls.informative[markerIndex] === 1;
      const alleles = ds.markers.alleles[markerIndex] as string[];
      const { allele1, allele2, nSamples } = ds.genotypes;

      const alleleSymbol = (idx: number): string =>
        idx === MISSING_ALLELE ? 'N' : (alleles[idx] ?? 'N');

      const calls = sampleIds.map((sampleId) => {
        const resolved = resolveSample(ds, cls, sampleId);
        const classLabel = CALL_CLASS_LABEL[classAt(ds, cls, resolved, markerIndex)];
        if (resolved.col < 0) {
          return { sampleId, allele1: 'N', allele2: 'N', classLabel };
        }
        const cell = markerIndex * nSamples + resolved.col;
        return {
          sampleId,
          allele1: alleleSymbol(allele1[cell] as number),
          allele2: alleleSymbol(allele2[cell] as number),
          classLabel,
        };
      });

      return {
        id: req.id,
        ok: true,
        result: {
          type: 'markerDetail',
          markerIndex,
          markerId,
          chrom,
          posBp,
          cm,
          informative,
          alleles,
          calls,
        },
      };
    }
    case 'compare': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const diff = compareLines(
        ds,
        cls,
        req.payload.sampleA,
        req.payload.sampleB,
        req.payload.mode,
      );
      return { id: req.id, ok: true, result: { type: 'compare', diff } };
    }
    case 'discordantMarkersCsv': {
      const { dataset: ds, classification: cls } = requireLoaded();
      const diff = compareLines(
        ds,
        cls,
        req.payload.sampleA,
        req.payload.sampleB,
        req.payload.mode,
      );
      return {
        id: req.id,
        ok: true,
        result: { type: 'discordantMarkersCsv', csv: discordantMarkersCsv([diff], ds, cls) },
      };
    }
  }
}

/** Buffers to transfer for a given result; every array here is either a fresh allocation or a `.slice()` copy. */
function transferablesFor(result: WorkerResult): Transferable[] {
  switch (result.type) {
    case 'loaded':
      return [result.informativeGapsBp.buffer as ArrayBuffer];
    case 'qc':
      return [
        result.report.markers.callRate.buffer as ArrayBuffer,
        result.report.markers.informative.buffer as ArrayBuffer,
        result.report.markers.lowCallRate.buffer as ArrayBuffer,
      ];
    case 'classes':
      return [
        result.chromLengthsBp.buffer as ArrayBuffer,
        result.markerChromIndex.buffer as ArrayBuffer,
        result.markerPosBp.buffer as ArrayBuffer,
        result.sortedMarkerOrder.buffer as ArrayBuffer,
        result.informative.buffer as ArrayBuffer,
        ...result.lines.map((l) => l.classes.buffer as ArrayBuffer),
      ];
    case 'compare':
      return [result.diff.discordantMarkers.buffer as ArrayBuffer];
    case 'rpp':
    case 'segments':
    case 'segmentsAll':
    case 'targets':
    case 'markerDetail':
    case 'discordantMarkersCsv':
    case 'brapiCallSets':
    case 'cancelBrapi':
      return [];
  }
}

async function respond(req: WorkerRequest): Promise<void> {
  try {
    const response = await handle(req);
    self.postMessage(response, response.ok ? transferablesFor(response.result) : []);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    self.postMessage({ id: req.id, ok: false, error } satisfies WorkerResponse);
  }
}

let queue: Promise<void> = Promise.resolve();

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type === 'cancelBrapi') {
    brapiAbort?.abort();
    self.postMessage({
      id: req.id,
      ok: true,
      result: { type: 'cancelBrapi' },
    } satisfies WorkerResponse);
    return;
  }
  queue = queue.then(() => respond(req));
};
