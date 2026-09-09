/**
 * Pairwise comparison CSV export (docs/data-formats.md, "Pairwise comparison
 * CSV").
 *
 * Responsibility: serialize PairwiseDiff[] into the two tables of the
 * pairwise comparison contract: a summary table (`pairwiseCsv`) with one row
 * per chromosome plus an ALL totals row per comparison, and a discordant
 * marker table (`discordantMarkersCsv`) with one row per discordant marker
 * per comparison. These column names are a published contract; do not add,
 * rename or reorder a column.
 *
 * `discordantMarkersCsv` reports class_a/class_b using classAt, the same
 * class-resolution logic compareLines uses internally, so a parent reads
 * rp_hom/donor_hom rather than a raw allele pair. Known limitation of the
 * fixed column set: in mode 'all' a discordant marker can be uninformative
 * (residual heterozygosity or genotyping error away from any introgression),
 * in which case class_a and class_b both read uninformative even though the
 * raw alleles differ — the discordance is real, but the class columns do not
 * show it because classAt reports UNINFORMATIVE for every sample at an
 * uninformative marker.
 *
 * Interface: pairwiseCsv(diffs, chromosomeOrder) -> string.
 *            discordantMarkersCsv(diffs, dataset, cls) -> string.
 */
import { classAt, resolveSample } from '../core/compare.ts';
import { CALL_CLASS_LABEL } from '../core/types.ts';
import type { Classification, Dataset, PairwiseDiff } from '../core/types.ts';
import { csvField } from './csv-field.ts';

export const PAIRWISE_CSV_HEADER = [
  'sample_a',
  'sample_b',
  'mode',
  'chrom',
  'n_compared',
  'n_discordant',
] as const;

export const DISCORDANT_MARKERS_CSV_HEADER = [
  'sample_a',
  'sample_b',
  'marker_id',
  'chrom',
  'pos_bp',
  'class_a',
  'class_b',
] as const;

export function pairwiseCsv(diffs: PairwiseDiff[], chromosomeOrder: string[]): string {
  const rows: string[] = [];
  for (const diff of diffs) {
    const byChrom = new Map(diff.byChromosome.map((r) => [r.chrom, r]));
    for (const chrom of chromosomeOrder) {
      const r = byChrom.get(chrom);
      rows.push(
        [
          csvField(diff.sampleA),
          csvField(diff.sampleB),
          diff.mode,
          csvField(chrom),
          r === undefined ? 0 : r.nCompared,
          r === undefined ? 0 : r.nDiscordant,
        ].join(','),
      );
    }
    rows.push(
      [
        csvField(diff.sampleA),
        csvField(diff.sampleB),
        diff.mode,
        'ALL',
        diff.nCompared,
        diff.nDiscordant,
      ].join(','),
    );
  }
  return [PAIRWISE_CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}

export function discordantMarkersCsv(
  diffs: PairwiseDiff[],
  dataset: Dataset,
  cls: Classification,
): string {
  const { ids, chrom, posBp } = dataset.markers;
  const rows: string[] = [];
  for (const diff of diffs) {
    const a = resolveSample(dataset, cls, diff.sampleA);
    const b = resolveSample(dataset, cls, diff.sampleB);
    for (let i = 0; i < diff.discordantMarkers.length; i++) {
      const m = diff.discordantMarkers[i] as number;
      rows.push(
        [
          csvField(diff.sampleA),
          csvField(diff.sampleB),
          csvField(ids[m] as string),
          csvField(chrom[m] as string),
          Math.round(posBp[m] as number),
          CALL_CLASS_LABEL[classAt(dataset, cls, a, m)],
          CALL_CLASS_LABEL[classAt(dataset, cls, b, m)],
        ].join(','),
      );
    }
  }
  return [DISCORDANT_MARKERS_CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}
