/**
 * Public surface of the compute core. Everything here is pure, UI-free and
 * runs unchanged in the browser main thread, a Web Worker, or Node (CLI).
 */
export * from './types.ts';
export * from './chromosomes.ts';
export { classifyDataset, countInformative } from './classify.ts';
export { computeRpp, weightedSums, DEFAULT_RPP_PARAMS } from './rpp.ts';
export { callSegments, segmentGapCriterion, DEFAULT_SEGMENT_PARAMS } from './segments.ts';
export type { GapCriterion } from './segments.ts';
export { checkTargets, parseTargetSpec } from './targets.ts';
export { compareLines } from './compare.ts';
export { computeQc, DEFAULT_QC_THRESHOLDS } from './qc.ts';
export {
  CLASS_COLORS,
  OKABE_ITO,
  classColor,
  TEXTURE_INK,
  CLASS_TEXTURES,
  classSwatchCss,
} from './palette.ts';
export type { TextureKind, ClassTexture } from './palette.ts';
export { relativeLuminance, contrastRatio } from './contrast.ts';
