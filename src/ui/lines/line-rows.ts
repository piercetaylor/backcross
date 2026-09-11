/**
 * One row per candidate, assembled from results the worker already produced.
 *
 * Responsibility: turn `rpp`, `samples`, `segmentsByCandidate`, `targets`
 * and `qc` into the flat `LineRow[]` that the Lines table, the genotype
 * view and the action bar all read. This is the row-building logic that
 * used to live inside LineTableScreen, moved out unchanged so that two
 * screens can share one model rather than each deriving its own. It
 * computes nothing the worker has not already produced: every field is a
 * lookup or a formatting of an existing result.
 *
 * Rows come out in `rpp` order, which is the worker's candidate order
 * (classification.candidateCols), the same order `segmentsByCandidate` is
 * indexed by. Target columns are keyed by a region's position in
 * `targets.regions`, never by name, so a duplicate or re-typed spec can
 * never collide with another column.
 *
 * Interface: buildLineRows(input) -> LineRow[]. No DOM, no worker, no
 * React; it lives under src/ui/ rather than src/core/ because it shapes a
 * presentation model, not a genetics result.
 */
import type {
  DonorSegment,
  LineRpp,
  QcReport,
  SampleRecord,
  TargetCheck,
  TargetRegion,
} from '../../core/types.ts';

export interface LineRow {
  sampleId: string;
  lineName: string;
  generation: string;
  familyId: string;
  rppCount: number;
  rppBp: number;
  rppCm: number;
  nSegments: number;
  /** NaN when the line has no segment. */
  largestSegmentMb: number;
  /** Status per target region, indexed by position in `regions` (never by name); '' when unchecked. */
  targetStatus: string[];
  flags: string[];
}

export interface LineRowsInput {
  rpp: LineRpp[];
  samples: SampleRecord[];
  segmentsByCandidate: DonorSegment[][] | null;
  targets: { regions: TargetRegion[]; checks: TargetCheck[] } | null;
  qc: QcReport | null;
}

/** One row per candidate in `rpp` order (the worker's candidate order). */
export function buildLineRows(input: LineRowsInput): LineRow[] {
  const { rpp, samples, segmentsByCandidate, targets, qc } = input;
  const sampleById = new Map(samples.map((s) => [s.sampleId, s]));
  const flagsById = new Map((qc?.lines ?? []).map((l) => [l.sampleId, l.flags]));

  // checkTargets emits candidate-major rows with regions in input order, so
  // each sample's checks, collected in arrival order, line up with
  // `regions` by index; names are not unique and are never used as keys.
  const checksBySample = new Map<string, TargetCheck[]>();
  for (const c of targets?.checks ?? []) {
    let inner = checksBySample.get(c.sampleId);
    if (inner === undefined) {
      inner = [];
      checksBySample.set(c.sampleId, inner);
    }
    inner.push(c);
  }
  const regions = targets?.regions ?? [];

  return rpp.map((r, i) => {
    const segments = segmentsByCandidate?.[i] ?? [];
    const largestSegmentMb =
      segments.length === 0
        ? NaN
        : Math.max(...segments.map((s) => s.endBp - s.startBp)) / 1_000_000;
    const checks = checksBySample.get(r.sampleId);
    const sample = sampleById.get(r.sampleId);
    return {
      sampleId: r.sampleId,
      lineName: sample?.lineName ?? r.sampleId,
      generation: sample?.generation ?? '',
      familyId: sample?.familyId ?? '',
      rppCount: r.overall.rppCount,
      rppBp: r.overall.rppBp,
      rppCm: r.overall.rppCm,
      nSegments: segments.length,
      largestSegmentMb,
      targetStatus: regions.map((_region, ri) => checks?.[ri]?.status ?? ''),
      flags: flagsById.get(r.sampleId) ?? [],
    };
  });
}
