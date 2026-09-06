/**
 * Main-thread <-> worker message contract.
 *
 * Responsibility: the discriminated unions for every request the UI can send
 * and every response the worker returns. Payload buffers are transferred
 * (zero-copy); results that contain typed arrays are likewise transferred.
 */
import type { LineRpp, RppParams, SegmentParams, TargetRegion } from '../core/types.ts';

export type WorkerRequest =
  | {
      id: number;
      type: 'load';
      payload: {
        genotypeFileName: string;
        genotypes: ArrayBuffer;
        samples: ArrayBuffer;
        markers?: ArrayBuffer;
      };
    }
  | { id: number; type: 'rpp'; payload: RppParams }
  | { id: number; type: 'segments'; payload: { sampleId: string; params: SegmentParams } }
  | {
      id: number;
      type: 'compare';
      payload: { sampleA: string; sampleB: string; mode: 'informative' | 'all' };
    }
  | { id: number; type: 'targets'; payload: { regions: TargetRegion[]; params: SegmentParams } }
  | { id: number; type: 'qc'; payload: Record<string, never> };

export type WorkerResult =
  | {
      type: 'loaded';
      nMarkers: number;
      nSamples: number;
      chromosomeOrder: string[];
      warnings: string[];
    }
  | { type: 'rpp'; lines: LineRpp[] };

export type WorkerResponse =
  { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string };
