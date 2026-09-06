/**
 * Donor segment calling (algorithm 3).
 *
 * Responsibility: convert one candidate's per-marker classes into run-length
 * donor/het segments per chromosome.
 *
 * Rules:
 *   - Walk the informative markers on a chromosome, in position order. A run
 *     is a maximal sequence of consecutive non-RP calls (DONOR_HOM or HET).
 *   - Gap test (PLINK `--homozyg-gap` semantics, docs/adr/0008): applies to
 *     every pair of consecutive informative markers, regardless of either
 *     marker's call class, and is checked before that class is examined. The
 *     step is the cM distance when the dataset carries a genetic map and both
 *     markers have a finite cM value; otherwise it is the bp distance. A step
 *     exceeding `maxGapCm` (cM) or `maxGapBp` (bp) closes an open run.
 *   - MISSING and NONPARENTAL calls neither extend nor break a run by
 *     themselves, but count toward `maxMissingSpan`: once more than that many
 *     have accumulated since the run's last member, the run closes.
 *   - RP_HOM closes an open run.
 *   - Runs with fewer than `minMarkers` non-RP calls are dropped unless
 *     `includeShort` is true (the UI uses this to show suspected errors).
 *   - startBp/endBp are the outermost non-RP markers; leftFlankBp/rightFlankBp
 *     are the nearest RP_HOM informative markers outside the run, scanning
 *     past MISSING/NONPARENTAL and past other non-RP markers (NaN when none).
 *     A gap or missing-span split can leave two adjacent runs reporting the
 *     same flank.
 *   - class = 'donor' if every call is DONOR_HOM, 'het' if every call is HET,
 *     otherwise 'mixed'. startCm/endCm are NaN without a genetic map, or when
 *     the marker itself has no cM value.
 *
 * Interface: callSegments(dataset, classification, candidateIndex, params, includeShort?)
 * -> DonorSegment[] sorted by chromosome order then startBp.
 */
import { CallClass } from './types.ts';
import type {
  Classification,
  Dataset,
  DonorSegment,
  SegmentClass,
  SegmentParams,
} from './types.ts';

export const DEFAULT_SEGMENT_PARAMS: SegmentParams = {
  minMarkers: 2,
  maxGapBp: 10_000_000,
  maxGapCm: 10,
  maxMissingSpan: 3,
};

export type GapCriterion = 'cm' | 'bp';

/** 'cm' when the dataset carries a genetic map, else 'bp'. */
export function segmentGapCriterion(dataset: Dataset): GapCriterion {
  return dataset.markers.cm !== undefined ? 'cm' : 'bp';
}

export function callSegments(
  dataset: Dataset,
  cls: Classification,
  candidateIndex: number,
  params: SegmentParams = DEFAULT_SEGMENT_PARAMS,
  includeShort = false,
): DonorSegment[] {
  const { markers, chromosomeOrder, chromIndex, sortedMarkerOrder } = dataset;
  const nMarkers = cls.nMarkers;
  const criterion = segmentGapCriterion(dataset);
  const cm = markers.cm;
  const sampleId = dataset.genotypes.sampleIds[
    cls.candidateCols[candidateIndex] as number
  ] as string;
  const base = candidateIndex * nMarkers;

  // Per chromosome, the informative marker indices in position order (mirrors
  // computeRpp's `perChrom`, restricted to markers this candidate can walk).
  const perChrom: number[][] = chromosomeOrder.map(() => []);
  for (let k = 0; k < nMarkers; k++) {
    const m = sortedMarkerOrder[k] as number;
    if (cls.informative[m] === 0) continue;
    (perChrom[chromIndex[m] as number] as number[]).push(m);
  }

  // Each step picks its own unit: cM when the dataset uses that criterion and
  // both markers have a finite map position, bp otherwise (including the
  // per-marker NaN fallback) — so the threshold it is checked against must
  // switch with it rather than being fixed once for the whole call.
  function gapExceeds(prev: number, m: number): boolean {
    if (criterion === 'cm' && cm !== undefined) {
      const a = cm[prev] as number;
      const b = cm[m] as number;
      // Absolute difference: a map need not be monotone in bp order.
      if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(b - a) > params.maxGapCm;
    }
    return (markers.posBp[m] as number) - (markers.posBp[prev] as number) > params.maxGapBp;
  }

  function segCm(m: number): number {
    return cm !== undefined ? (cm[m] as number) : NaN;
  }

  function segmentClass(nDonorHom: number, nHet: number): SegmentClass {
    if (nHet === 0) return 'donor';
    if (nDonorHom === 0) return 'het';
    return 'mixed';
  }

  const out: DonorSegment[] = [];

  for (let ci = 0; ci < chromosomeOrder.length; ci++) {
    const chrom = chromosomeOrder[ci] as string;
    const chromMarkers = perChrom[ci] as number[];

    // The run holds walk-indices into `chromMarkers`, so flank scans can walk
    // outward from it without re-searching for its position.
    let run: number[] = [];
    let skipped = 0;
    let prevIdx: number | undefined;

    const closeRun = (): void => {
      if (run.length === 0) return;
      if (run.length >= params.minMarkers || includeShort) {
        const firstIdx = run[0] as number;
        const lastIdx = run[run.length - 1] as number;
        const first = chromMarkers[firstIdx] as number;
        const last = chromMarkers[lastIdx] as number;
        let nDonorHom = 0;
        let nHet = 0;
        for (const idx of run) {
          const k = cls.classes[base + (chromMarkers[idx] as number)] as number;
          if (k === CallClass.DONOR_HOM) nDonorHom++;
          else nHet++;
        }

        // Nearest RP_HOM marker outside the run, scanning past
        // MISSING/NONPARENTAL and other non-RP markers.
        let leftFlankBp = NaN;
        for (let j = firstIdx - 1; j >= 0; j--) {
          const cand = chromMarkers[j] as number;
          if ((cls.classes[base + cand] as number) === CallClass.RP_HOM) {
            leftFlankBp = markers.posBp[cand] as number;
            break;
          }
        }
        let rightFlankBp = NaN;
        for (let j = lastIdx + 1; j < chromMarkers.length; j++) {
          const cand = chromMarkers[j] as number;
          if ((cls.classes[base + cand] as number) === CallClass.RP_HOM) {
            rightFlankBp = markers.posBp[cand] as number;
            break;
          }
        }

        out.push({
          sampleId,
          chrom,
          startBp: markers.posBp[first] as number,
          endBp: markers.posBp[last] as number,
          leftFlankBp,
          rightFlankBp,
          nMarkers: run.length,
          nDonorHom,
          nHet,
          class: segmentClass(nDonorHom, nHet),
          startCm: segCm(first),
          endCm: segCm(last),
        });
      }
      run = [];
      skipped = 0;
    };

    for (let i = 0; i < chromMarkers.length; i++) {
      const m = chromMarkers[i] as number;
      if (run.length > 0 && prevIdx !== undefined) {
        if (gapExceeds(chromMarkers[prevIdx] as number, m)) closeRun();
      }
      const k = cls.classes[base + m] as number;
      if (k === CallClass.MISSING || k === CallClass.NONPARENTAL) {
        if (run.length > 0) {
          skipped++;
          if (skipped > params.maxMissingSpan) closeRun();
        }
      } else if (k === CallClass.RP_HOM) {
        closeRun();
      } else {
        run.push(i);
        skipped = 0;
      }
      prevIdx = i;
    }
    closeRun();
  }

  return out;
}
