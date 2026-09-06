/**
 * Runtime configuration (twelve-factor: read from the environment at build time).
 *
 * Responsibility: the only module that reads import.meta.env. Every VITE_*
 * variable in .env.example is parsed here into a typed, defaulted object;
 * the rest of the app imports `config` and never touches env directly.
 *
 * Interface: config (frozen object), plus the AppConfig type.
 */
import { DEFAULT_QC_THRESHOLDS } from './core/qc.ts';
import { DEFAULT_RPP_PARAMS } from './core/rpp.ts';
import { DEFAULT_SEGMENT_PARAMS } from './core/segments.ts';
import type { QcThresholds, RppParams, SegmentParams } from './core/types.ts';

export interface AppConfig {
  basePath: string;
  rpp: RppParams;
  segments: SegmentParams;
  qc: QcThresholds;
}

function num(key: string, fallback: number): number {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  const v = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

export const config: Readonly<AppConfig> = Object.freeze({
  basePath: import.meta.env.BASE_URL,
  rpp: {
    maxGapBp: num('VITE_DEFAULT_MAX_GAP_BP', DEFAULT_RPP_PARAMS.maxGapBp),
    maxGapCm: num('VITE_DEFAULT_MAX_GAP_CM', DEFAULT_RPP_PARAMS.maxGapCm),
  },
  segments: {
    minMarkers: num('VITE_DEFAULT_MIN_SEGMENT_MARKERS', DEFAULT_SEGMENT_PARAMS.minMarkers),
    maxGapBp: num('VITE_DEFAULT_MAX_GAP_BP', DEFAULT_SEGMENT_PARAMS.maxGapBp),
    maxMissingSpan: num('VITE_DEFAULT_MAX_MISSING_SPAN', DEFAULT_SEGMENT_PARAMS.maxMissingSpan),
  },
  qc: {
    lineMissingMax: num('VITE_QC_LINE_MISSING_MAX', DEFAULT_QC_THRESHOLDS.lineMissingMax),
    lineHetMax: num('VITE_QC_LINE_HET_MAX', DEFAULT_QC_THRESHOLDS.lineHetMax),
    markerCallRateMin: num('VITE_QC_MARKER_CALLRATE_MIN', DEFAULT_QC_THRESHOLDS.markerCallRateMin),
    parentHetMax: num('VITE_QC_PARENT_HET_MAX', DEFAULT_QC_THRESHOLDS.parentHetMax),
  },
});
