/**
 * Main-thread <-> worker message contract.
 *
 * Responsibility: the discriminated unions for every request the UI can send
 * and every response the worker returns. The genotype file travels as a
 * `Blob` (a `File` from the upload input), which is structured-cloned by
 * reference and read as a stream inside the worker, so the main thread never
 * reads it into memory; an `ArrayBuffer` is still accepted and is
 * transferred. samples.csv and markers.csv are ArrayBuffers, transferred
 * (zero-copy); results that contain typed arrays are likewise transferred.
 *
 * 'loaded' reports three memory-accounting figures for the streaming load
 * (docs/adr/0012): `bytesInflated`, the genotype file's size after
 * inflation; `peakBuilderBytes`, the parser's own peak allele-array
 * accounting (0 for HapMap and wide CSV); and `residentMatrixBytes`, the
 * assembled dataset's allele1 plus allele2 bytes.
 *
 * 'load' and 'loadBrapi' carry an optional token `profile` (a built-in id or a
 * validated custom object, contract 1.4.0), and 'loaded' reports its label as
 * `tokenProfile`. Both also carry an optional `crop` (a built-in crop scheme
 * id, contract 1.5.0; absent means soybean), and 'loaded' reports it as
 * `crop`.
 * 'loadBrapi' is the BrAPI counterpart of 'load' (docs/adr/0015): the payload
 * carries a BrapiSource instead of a genotype file, the worker fetches the
 * variant set itself, and samples.csv and markers.csv travel as for 'load'.
 * 'loadDemo' (docs/adr/0017) carries the URLs of the site's demo files; the
 * worker fetches them and then runs the 'load' path on the bytes, so a demo
 * is loaded exactly as the same files picked by hand would be.
 * 'brapiCallSets' pages /callsets only, so the Upload screen can offer the
 * call-set table before a samples.csv exists. 'cancelBrapi' is handled out of
 * band by the worker and aborts the in-flight BrAPI fetch, if any. 'loaded'
 * carries `source`, which names the genotype file or the BrAPI variant set and
 * server (never the token); `bytesInflated` is 0 for a BrAPI load.
 *
 * The 'classes' result carries the data the canvas renderer needs (marker
 * positions and per-line class arrays, never raw alleles); its shape is
 * defined here as GenotypeClassesData and imported by
 * src/ui/canvas/GraphicalGenotypeRenderer.ts, since this file is the
 * declared boundary between the worker and everything downstream of it.
 * Deliberately absent from GenotypeClassesData: marker ids and an allele
 * table. At 50K markers those would be a large structured clone per load for
 * data only a hover needs, and the renderer never reads them. 'markerDetail'
 * is the on-demand counterpart: one marker's id, cM, allele table and
 * per-sample calls, fetched only when a hover asks for it.
 */
import type { GapCriterion } from '../core/segments.ts';
import type {
  DonorSegment,
  LineRpp,
  PairwiseDiff,
  QcReport,
  QcThresholds,
  RppParams,
  SampleRecord,
  SegmentParams,
  TargetCheck,
  TargetRegion,
} from '../core/types.ts';
import type { BrapiCallSet, BrapiSource } from '../io/brapi.ts';
import type { TokenProfile } from '../io/profiles.ts';

export type WorkerRequest =
  | {
      id: number;
      type: 'load';
      payload: {
        genotypeFileName: string;
        genotypes: ArrayBuffer | Blob;
        samples: ArrayBuffer;
        markers?: ArrayBuffer;
        /** Token profile (contract 1.4.0): a built-in id or a validated custom object; absent means default. */
        profile?: string | TokenProfile;
        /** Crop scheme id (contract 1.5.0); absent means soybean. */
        crop?: string;
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
  | { id: number; type: 'markerDetail'; payload: { markerIndex: number; sampleIds: string[] } }
  | {
      id: number;
      type: 'compare';
      payload: { sampleA: string; sampleB: string; mode: 'informative' | 'all' };
    }
  | {
      id: number;
      /**
       * The discordant-marker table of docs/data-formats.md. Built here rather
       * than on the main thread because it names each marker and its parent-of-
       * origin classes, which needs the parsed dataset and the classification;
       * both stay in the worker (docs/adr/0001).
       */
      type: 'discordantMarkersCsv';
      payload: { sampleA: string; sampleB: string; mode: 'informative' | 'all' };
    }
  | {
      id: number;
      /** BrAPI load (docs/adr/0015): the worker fetches; samples.csv and markers.csv as for 'load'. */
      type: 'loadBrapi';
      payload: {
        source: BrapiSource;
        samples: ArrayBuffer;
        markers?: ArrayBuffer;
        /** Anything other than the default is rejected before any network (contract 1.4.0). */
        profile?: string | TokenProfile;
        /** Crop scheme id (contract 1.5.0); absent means soybean. */
        crop?: string;
      };
    }
  | {
      id: number;
      /**
       * Demo load (docs/adr/0017): the worker fetches the three same-origin
       * files, then loads them exactly as 'load' loads user-picked files.
       */
      type: 'loadDemo';
      payload: {
        genotypeFileName: string;
        genotypesUrl: string;
        samplesUrl: string;
        markersUrl: string;
      };
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
    };

export type DatasetSource =
  | { kind: 'files'; genotypeFileName: string }
  | { kind: 'brapi'; baseUrl: string; variantSetDbId: string }; // baseUrl normalised; never the token

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

export interface MarkerDetailCall {
  sampleId: string;
  /** Allele symbol, or 'N' for a missing call or a sample with no genotype column. */
  allele1: string;
  allele2: string;
  classLabel: string;
}

/**
 * Shape of the 'markerDetail' result: everything a hover needs for one
 * marker that GenotypeClassesData omits (marker id, cM, alleles), plus the
 * per-sample calls the caller asked for. No typed arrays, so no
 * transferablesFor entry is needed beyond an empty list.
 */
export interface MarkerDetailResult {
  markerIndex: number;
  markerId: string;
  chrom: string;
  posBp: number;
  /** NaN when the dataset has no genetic map, or this marker has none. */
  cm: number;
  informative: boolean;
  /** This marker's allele symbol table, e.g. ["A","T"]. */
  alleles: string[];
  calls: MarkerDetailCall[];
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
      bytesInflated: number;
      peakBuilderBytes: number;
      residentMatrixBytes: number;
      source: DatasetSource;
      /** The token profile the genotypes were read with: 'default', a built-in id, or `custom:<id>`. */
      tokenProfile: string;
      /** The crop scheme id the chromosome names were read under (contract 1.5.0). */
      crop: string;
    }
  | { type: 'rpp'; lines: LineRpp[] }
  | { type: 'qc'; report: QcReport }
  | { type: 'segments'; sampleId: string; segments: DonorSegment[]; gapCriterion: GapCriterion }
  | { type: 'segmentsAll'; byCandidate: DonorSegment[][]; gapCriterion: GapCriterion }
  | { type: 'targets'; regions: TargetRegion[]; checks: TargetCheck[] }
  | ({ type: 'classes' } & GenotypeClassesData)
  | ({ type: 'markerDetail' } & MarkerDetailResult)
  | { type: 'compare'; diff: PairwiseDiff }
  | { type: 'discordantMarkersCsv'; csv: string }
  | { type: 'brapiCallSets'; callSets: BrapiCallSet[]; warnings: string[] }
  | { type: 'cancelBrapi' };

export type WorkerResponse =
  { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string };
