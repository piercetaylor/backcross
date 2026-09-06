/**
 * Main-thread <-> worker message contract.
 *
 * Responsibility: the discriminated unions for every request the UI can send
 * and every response the worker returns. Payload buffers are transferred
 * (zero-copy); results that contain typed arrays are likewise transferred.
 *
 * The 'classes' result carries the data the canvas renderer needs (marker
 * positions and per-line class arrays, never raw alleles); its shape is
 * defined here as GenotypeClassesData and imported by
 * src/ui/canvas/GraphicalGenotypeRenderer.ts, since this file is the
 * declared boundary between the worker and everything downstream of it.
 */
import type { GapCriterion } from '../core/segments.ts';
import type {
  DonorSegment,
  LineRpp,
  QcReport,
  QcThresholds,
  RppParams,
  SampleRecord,
  SegmentParams,
  TargetCheck,
  TargetRegion,
} from '../core/types.ts';

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
  | { id: number; type: 'qc'; payload: QcThresholds }
  | {
      id: number;
      type: 'segments';
      payload: { sampleId: string; params: SegmentParams; includeShort: boolean };
    }
  | { id: number; type: 'segmentsAll'; payload: { params: SegmentParams } }
  | { id: number; type: 'targets'; payload: { specs: string[]; params: SegmentParams } }
  | { id: number; type: 'classes'; payload: { sampleIds: string[] } }
  | {
      id: number;
      type: 'compare';
      payload: { sampleA: string; sampleB: string; mode: 'informative' | 'all' };
    };

export interface GenotypeClassesLine {
  sampleId: string;
  classes: Uint8Array;
}

/**
 * Shape of the 'classes' result: everything the renderer needs to draw
 * lines, and nothing else (no allele1/allele2). markerChromIndex,
 * markerPosBp, sortedMarkerOrder and informative are copies of the worker's
 * resident dataset/classification arrays, and each line's classes array is a
 * copy of one row of the resident classification matrix, so transferring
 * their buffers never disturbs state the worker keeps for later requests.
 */
export interface GenotypeClassesData {
  chromosomeOrder: string[];
  /** Max marker position per chromosome, in chromosomeOrder, bp. */
  chromLengthsBp: Float64Array;
  markerChromIndex: Int32Array;
  markerPosBp: Float64Array;
  sortedMarkerOrder: Int32Array;
  informative: Uint8Array;
  lines: GenotypeClassesLine[];
}

export type WorkerResult =
  | {
      type: 'loaded';
      nMarkers: number;
      nSamples: number;
      chromosomeOrder: string[];
      warnings: string[];
      samples: SampleRecord[];
      nInformative: number;
      hasCm: boolean;
      gapCriterion: GapCriterion;
      coded: boolean;
      /** Sorted ascending: every gap (bp) between consecutive informative markers on the same chromosome. */
      informativeGapsBp: Float64Array;
    }
  | { type: 'rpp'; lines: LineRpp[] }
  | { type: 'qc'; report: QcReport }
  | { type: 'segments'; sampleId: string; segments: DonorSegment[]; gapCriterion: GapCriterion }
  | { type: 'segmentsAll'; byCandidate: DonorSegment[][]; gapCriterion: GapCriterion }
  | { type: 'targets'; regions: TargetRegion[]; checks: TargetCheck[] }
  | ({ type: 'classes' } & GenotypeClassesData);

export type WorkerResponse =
  { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string };
