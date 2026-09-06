/**
 * Self-contained HTML report. STUB (M2).
 *
 * Responsibility: render dataset summary, QC table, per-line table, and one
 * graphical genotype image (inline SVG or PNG data URI drawn by the canvas
 * renderer) per candidate into a single HTML string with no external
 * resources, so it can be attached to an email or archived. PDF is produced
 * by the browser's print dialog from this page (print stylesheet), not by a
 * server.
 *
 * Interface: buildHtmlReport(input: ReportInput) -> string.
 */
import type { Dataset, LineRpp, QcReport, TargetCheck } from '../core/types.ts';

export interface ReportInput {
  dataset: Dataset;
  lineRpp: LineRpp[];
  qc: QcReport | null;
  targets: TargetCheck[];
  /** Data URIs of pre-rendered genotype images keyed by sample_id. */
  images: Map<string, string>;
  generatedAt: Date;
}

export function buildHtmlReport(_input: ReportInput): string {
  throw new Error('buildHtmlReport: not implemented (planned for milestone M2)');
}
