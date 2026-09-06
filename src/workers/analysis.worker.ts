/**
 * Analysis Web Worker. STUB: message protocol fixed, handlers partially wired (M1).
 *
 * Responsibility: keep parsing and computation off the main thread. The UI
 * posts raw file bytes (ArrayBuffers, transferred, not copied) and analysis
 * parameters; the worker parses, assembles the Dataset, classifies, computes
 * RPP, and posts typed-array results back (transferred). The Dataset stays
 * resident in the worker for follow-up requests (segments for one line,
 * pairwise comparison, target checks) so the main thread never holds the
 * genotype matrix.
 *
 * Protocol (src/workers/protocol.ts): request {id, type, payload} ->
 * response {id, ok: true, result} | {id, ok: false, error}.
 */
import { classifyDataset } from '../core/classify.ts';
import { computeRpp } from '../core/rpp.ts';
import type { Classification, Dataset } from '../core/types.ts';
import { assembleDataset, parseGenotypesBytes } from '../io/loaders.ts';
import { parseSampleManifest } from '../io/manifest.ts';
import { parseMarkerMap } from '../io/markers.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

let dataset: Dataset | null = null;
let classification: Classification | null = null;

const decoder = new TextDecoder();

function handle(req: WorkerRequest): WorkerResponse {
  switch (req.type) {
    case 'load': {
      const p = req.payload;
      const parsed = parseGenotypesBytes(p.genotypeFileName, new Uint8Array(p.genotypes));
      const samples = parseSampleManifest(decoder.decode(p.samples));
      const map = p.markers === undefined ? undefined : parseMarkerMap(decoder.decode(p.markers));
      const out = assembleDataset(parsed, samples, map);
      dataset = out.dataset;
      classification = classifyDataset(dataset);
      return {
        id: req.id,
        ok: true,
        result: {
          type: 'loaded',
          nMarkers: dataset.genotypes.nMarkers,
          nSamples: dataset.genotypes.nSamples,
          chromosomeOrder: dataset.chromosomeOrder,
          warnings: out.warnings,
        },
      };
    }
    case 'rpp': {
      if (dataset === null || classification === null) throw new Error('no dataset loaded');
      return {
        id: req.id,
        ok: true,
        result: { type: 'rpp', lines: computeRpp(dataset, classification, req.payload) },
      };
    }
    case 'segments':
    case 'compare':
    case 'targets':
    case 'qc':
      throw new Error(`${req.type}: not implemented (planned for milestone M1/M2)`);
  }
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  try {
    self.postMessage(handle(ev.data));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    self.postMessage({ id: ev.data.id, ok: false, error } satisfies WorkerResponse);
  }
};
