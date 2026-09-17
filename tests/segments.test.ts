/** Donor segment calling (algorithm 3): hand-built cases, no fixture files. */
import { describe, expect, it } from 'vitest';

import { DEFAULT_SEGMENT_PARAMS, callSegments, segmentGapCriterion } from '../src/core/segments.ts';
import type { CallClassValue, Classification, Dataset, SegmentParams } from '../src/core/types.ts';
import { CallClass } from '../src/core/types.ts';

interface MarkerSpec {
  pos: number;
  cm?: number;
  cls: CallClassValue;
}

interface ChromSpec {
  chrom: string;
  markers: MarkerSpec[];
}

/**
 * Builds a one-candidate Dataset + Classification from a per-chromosome list
 * of {pos, cm?, cls} marker specs. UNINFORMATIVE markers get informative = 0;
 * every other class is informative. Genotype allele arrays are zero-filled:
 * callSegments must never read them, since classes come from `cls` directly.
 */
function makeCase(chroms: ChromSpec[]): { dataset: Dataset; cls: Classification } {
  const chromosomeOrder = chroms.map((c) => c.chrom);
  const ids: string[] = [];
  const chrom: string[] = [];
  const posBpArr: number[] = [];
  const cmArr: number[] = [];
  const chromIndexArr: number[] = [];
  const classesArr: number[] = [];
  const informativeArr: number[] = [];
  let hasAnyCm = false;

  chroms.forEach((c, ci) => {
    c.markers.forEach((spec, mi) => {
      ids.push(`${c.chrom}_${mi}`);
      chrom.push(c.chrom);
      posBpArr.push(spec.pos);
      cmArr.push(spec.cm ?? NaN);
      if (spec.cm !== undefined) hasAnyCm = true;
      chromIndexArr.push(ci);
      classesArr.push(spec.cls);
      informativeArr.push(spec.cls === CallClass.UNINFORMATIVE ? 0 : 1);
    });
  });

  const nMarkers = ids.length;
  const sortedMarkerOrder = Int32Array.from({ length: nMarkers }, (_, i) => i);

  const dataset: Dataset = {
    markers: {
      ids,
      chrom,
      posBp: Float64Array.from(posBpArr),
      ...(hasAnyCm ? { cm: Float64Array.from(cmArr) } : {}),
      alleles: ids.map(() => ['A', 'T']),
    },
    genotypes: {
      nMarkers,
      nSamples: 1,
      sampleIds: ['X'],
      allele1: new Uint8Array(nMarkers),
      allele2: new Uint8Array(nMarkers),
    },
    samples: [
      { sampleId: 'X', lineName: 'X', role: 'candidate', generation: '', familyId: '', notes: '' },
    ],
    recurrentParentCol: -1,
    donorParentCol: -1,
    coded: true,
    chromosomeOrder,
    chromIndex: Int32Array.from(chromIndexArr),
    sortedMarkerOrder,
    tokenProfile: 'default',
  };

  const cls: Classification = {
    candidateCols: Int32Array.of(0),
    classes: Uint8Array.from(classesArr),
    informative: Uint8Array.from(informativeArr),
    rpAllele: new Uint8Array(nMarkers),
    donorAllele: new Uint8Array(nMarkers),
    nMarkers,
  };

  return { dataset, cls };
}

/** A single-chromosome shortcut for the common one-chromosome cases. */
function makeSingleChrom(
  markers: MarkerSpec[],
  chrom = 'Gm01',
): { dataset: Dataset; cls: Classification } {
  return makeCase([{ chrom, markers }]);
}

const R = CallClass.RP_HOM;
const D = CallClass.DONOR_HOM;
const H = CallClass.HET;
const M = CallClass.MISSING;
const N = CallClass.NONPARENTAL;
const U = CallClass.UNINFORMATIVE;

const MB = 1_000_000;

describe('segmentGapCriterion', () => {
  it('is bp when the dataset has no genetic map', () => {
    const { dataset } = makeSingleChrom([{ pos: 0, cls: R }]);
    expect(segmentGapCriterion(dataset)).toBe('bp');
  });

  it('is cm when the dataset carries a genetic map', () => {
    const { dataset } = makeSingleChrom([{ pos: 0, cm: 0, cls: R }]);
    expect(segmentGapCriterion(dataset)).toBe('cm');
  });
});

describe('callSegments: basic run shapes', () => {
  it('case 1: R R D D D R R yields one donor segment flanked by the adjacent RP calls', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 1 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 3 * MB, cls: D },
      { pos: 4 * MB, cls: D },
      { pos: 5 * MB, cls: R },
      { pos: 6 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      startBp: 2 * MB,
      endBp: 4 * MB,
      leftFlankBp: 1 * MB,
      rightFlankBp: 5 * MB,
      nMarkers: 3,
      nDonorHom: 3,
      nHet: 0,
      class: 'donor',
    });
  });

  it('case 2a: R H H R is class het', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: H },
      { pos: 2 * MB, cls: H },
      { pos: 3 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ class: 'het', nDonorHom: 0, nHet: 2 });
  });

  it('case 2b: R D H D R is class mixed with nDonorHom 2, nHet 1', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: H },
      { pos: 3 * MB, cls: D },
      { pos: 4 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ class: 'mixed', nDonorHom: 2, nHet: 1, nMarkers: 3 });
  });
});

describe('callSegments: missing-span bridging (the case the old consecutive-non-RP-gap rule got wrong)', () => {
  it('case 3: R D D M M D D R at 2 Mb spacing bridges the two M calls into one 4-marker segment', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: D },
      { pos: 6 * MB, cls: M },
      { pos: 8 * MB, cls: M },
      { pos: 10 * MB, cls: D },
      { pos: 12 * MB, cls: D },
      { pos: 14 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // The D-to-D span across the two M calls is 6 Mb (4 Mb to 10 Mb), which
    // would have failed the old rule (gap measured between consecutive
    // non-RP calls). The gap test here only looks at consecutive informative
    // markers (each step is 2 Mb, under maxSegmentGapBp), and 2 skipped markers is
    // within maxMissingSpan (3), so the run bridges the missing pair.
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 12 * MB, nMarkers: 4 });
  });

  it('case 4: R D M M M M D R drops both length-1 runs at default minMarkers, keeps both with includeShort', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: M },
      { pos: 6 * MB, cls: M },
      { pos: 8 * MB, cls: M },
      { pos: 10 * MB, cls: M },
      { pos: 12 * MB, cls: D },
      { pos: 14 * MB, cls: R },
    ]);
    expect(callSegments(dataset, cls, 0)).toEqual([]);
    const short = callSegments(dataset, cls, 0, DEFAULT_SEGMENT_PARAMS, true);
    expect(short).toHaveLength(2);
    expect(short[0]).toMatchObject({ nMarkers: 1, startBp: 2 * MB, endBp: 2 * MB });
    expect(short[1]).toMatchObject({ nMarkers: 1, startBp: 12 * MB, endBp: 12 * MB });
  });
});

describe('callSegments: physical gap splitting', () => {
  it('case 5: a 40 Mb jump between two D runs splits them, and both report the same flanks', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: D },
      { pos: 44 * MB, cls: D },
      { pos: 46 * MB, cls: D },
      { pos: 48 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 4 * MB });
    expect(segs[1]).toMatchObject({ startBp: 44 * MB, endBp: 46 * MB });
    // Documented consequence of "nearest RP_HOM outside the run": the only
    // RP_HOM markers in this chromosome are the ones flanking the whole
    // cluster, so the gap-split neighbors both point at them.
    expect(segs[0]?.leftFlankBp).toBe(0);
    expect(segs[1]?.leftFlankBp).toBe(0);
    expect(segs[0]?.rightFlankBp).toBe(48 * MB);
    expect(segs[1]?.rightFlankBp).toBe(48 * MB);
  });

  it('case 6: the gap fires on a MISSING marker, which ends up in neither segment', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: D },
      { pos: 44 * MB, cls: M },
      { pos: 46 * MB, cls: D },
      { pos: 48 * MB, cls: D },
      { pos: 50 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 4 * MB, nMarkers: 2 });
    expect(segs[1]).toMatchObject({ startBp: 46 * MB, endBp: 48 * MB, nMarkers: 2 });
  });
});

describe('callSegments: genetic-map gap criterion', () => {
  it('case 7a: a 40 Mb / 3 cM jump does not split when cm is present (criterion is cm)', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cm: 0, cls: R },
      { pos: 2 * MB, cm: 1, cls: D },
      { pos: 4 * MB, cm: 2, cls: D },
      { pos: 44 * MB, cm: 5, cls: D },
      { pos: 46 * MB, cm: 6, cls: D },
      { pos: 48 * MB, cm: 7, cls: R },
    ]);
    expect(segmentGapCriterion(dataset)).toBe('cm');
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 46 * MB, nMarkers: 4 });
  });

  it('case 7b: a 2 Mb / 12 cM step splits, even though the physical distance is small', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cm: 0, cls: R },
      { pos: 1 * MB, cm: 1, cls: D },
      { pos: 2 * MB, cm: 2, cls: D },
      { pos: 4 * MB, cm: 14, cls: D },
      { pos: 5 * MB, cm: 15, cls: D },
      { pos: 6 * MB, cm: 16, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // The physical step between the two D pairs is only 2 Mb (2 Mb to 4 Mb),
    // well under maxSegmentGapBp, but the criterion is cm here and the cm step (2
    // to 14) is 12, over maxSegmentGapCm (10), so it splits anyway.
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startBp: 1 * MB, endBp: 2 * MB, nMarkers: 2 });
    expect(segs[1]).toMatchObject({ startBp: 4 * MB, endBp: 5 * MB, nMarkers: 2 });
  });
});

describe('callSegments: NaN cM falls back to bp for that step', () => {
  it('case 8a: NaN cm at one marker of the step, and the bp step is 40 Mb, so it splits', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cm: 0, cls: R },
      { pos: 2 * MB, cm: 1, cls: D },
      { pos: 4 * MB, cm: 2, cls: D },
      { pos: 44 * MB, cls: D }, // no cm supplied: NaN
      { pos: 46 * MB, cm: 6, cls: D },
      { pos: 48 * MB, cm: 7, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // The step into the NaN-cm marker falls back to bp (44 - 4 = 40 Mb, over
    // maxSegmentGapBp) and splits; the step out of it also falls back to bp (46 -
    // 44 = 2 Mb, under maxSegmentGapBp) and does not.
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 4 * MB, nMarkers: 2 });
    expect(segs[1]).toMatchObject({ startBp: 44 * MB, endBp: 46 * MB, nMarkers: 2 });
  });

  it('case 8b: NaN cm at one marker of the step, but the bp step is only 2 Mb, so no split', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cm: 0, cls: R },
      { pos: 2 * MB, cm: 1, cls: D },
      { pos: 4 * MB, cls: D }, // no cm supplied: NaN
      { pos: 6 * MB, cm: 6, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 4 * MB, nMarkers: 2 });
  });
});

describe('callSegments: chromosome ends', () => {
  it('case 9a: a run starting at the first marker has leftFlankBp NaN', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: D },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.leftFlankBp).toBeNaN();
    expect(segs[0]?.rightFlankBp).toBe(2 * MB);
  });

  it('case 9b: a run ending at the last marker has rightFlankBp NaN', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: D },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.leftFlankBp).toBe(0);
    expect(segs[0]?.rightFlankBp).toBeNaN();
  });

  it('case 9c: a chromosome that is entirely donor has both flanks NaN and one segment', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: D },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: D },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.leftFlankBp).toBeNaN();
    expect(segs[0]?.rightFlankBp).toBeNaN();
  });
});

describe('callSegments: nonparental and uninformative markers', () => {
  it('case 10: R D N D R treats NONPARENTAL like MISSING, so the run has nMarkers 2', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: N },
      { pos: 3 * MB, cls: D },
      { pos: 4 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startBp: 1 * MB, endBp: 3 * MB, nMarkers: 2 });
  });

  it('case 11a: UNINFORMATIVE markers between two D calls are invisible to the walk, within maxSegmentGapBp', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: U },
      { pos: 3 * MB, cls: U },
      { pos: 4 * MB, cls: U },
      { pos: 5 * MB, cls: U },
      { pos: 6 * MB, cls: U },
      { pos: 7 * MB, cls: D },
      { pos: 8 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // The U markers are not in the informative walk, so the gap test compares
    // the two D calls directly: 7 Mb - 1 Mb = 6 Mb, under maxSegmentGapBp (10 Mb).
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startBp: 1 * MB, endBp: 7 * MB, nMarkers: 2 });
  });

  it('case 11b: the same layout splits once the D-to-D distance across the U stretch exceeds maxSegmentGapBp', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: D },
      { pos: 3 * MB, cls: U },
      { pos: 4 * MB, cls: U },
      { pos: 15 * MB, cls: U },
      { pos: 16 * MB, cls: U },
      { pos: 17 * MB, cls: U },
      { pos: 18 * MB, cls: D },
      { pos: 19 * MB, cls: D },
      { pos: 20 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // Consecutive informative markers: D@2Mb then D@18Mb, a 16 Mb step, over
    // maxSegmentGapBp (10 Mb), even though every marker in between is invisible.
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startBp: 1 * MB, endBp: 2 * MB });
    expect(segs[1]).toMatchObject({ startBp: 18 * MB, endBp: 19 * MB });
  });
});

describe('callSegments: multiple chromosomes', () => {
  it('case 12: segments come out in chromosomeOrder order and never cross a chromosome boundary', () => {
    const { dataset, cls } = makeCase([
      {
        chrom: 'Gm01',
        markers: [
          { pos: 0, cls: R },
          { pos: 1 * MB, cls: D },
          { pos: 2 * MB, cls: D },
        ],
      },
      {
        chrom: 'Gm02',
        markers: [
          { pos: 0, cls: D },
          { pos: 1 * MB, cls: D },
          { pos: 2 * MB, cls: R },
        ],
      },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.chrom).toBe('Gm01');
    expect(segs[0]).toMatchObject({ startBp: 1 * MB, endBp: 2 * MB });
    expect(segs[0]?.rightFlankBp).toBeNaN();
    expect(segs[1]?.chrom).toBe('Gm02');
    expect(segs[1]).toMatchObject({ startBp: 0, endBp: 1 * MB });
    expect(segs[1]?.leftFlankBp).toBeNaN();
  });
});

describe('callSegments: empty inputs', () => {
  it('case 13a: an all-RP candidate yields no segments', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: R },
      { pos: 2 * MB, cls: R },
    ]);
    expect(callSegments(dataset, cls, 0)).toEqual([]);
  });

  it('case 13b: a dataset with zero markers returns no segments without throwing', () => {
    const { dataset, cls } = makeCase([{ chrom: 'Gm01', markers: [] }]);
    expect(() => callSegments(dataset, cls, 0)).not.toThrow();
    expect(callSegments(dataset, cls, 0)).toEqual([]);
  });
});

describe('callSegments: startCm/endCm', () => {
  it('are NaN when the dataset has no genetic map', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: D },
      { pos: 3 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs[0]?.startCm).toBeNaN();
    expect(segs[0]?.endCm).toBeNaN();
  });

  it('equal the map values when a genetic map is present', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cm: 0, cls: R },
      { pos: 1 * MB, cm: 1.5, cls: D },
      { pos: 2 * MB, cm: 2.5, cls: D },
      { pos: 3 * MB, cm: 3.5, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs[0]?.startCm).toBe(1.5);
    expect(segs[0]?.endCm).toBe(2.5);
  });
});

// Explicit type check that the params argument shape matches SegmentParams,
// exercised via a custom minMarkers/maxMissingSpan to be sure defaults are
// not hardcoded inside callSegments.
describe('callSegments: custom params', () => {
  it('honors a lower minMarkers', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: R },
    ]);
    const params: SegmentParams = { ...DEFAULT_SEGMENT_PARAMS, minMarkers: 1 };
    const segs = callSegments(dataset, cls, 0, params);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ nMarkers: 1 });
  });
});

describe('callSegments: edge cases from review', () => {
  it('review 1: R D M M M D R at the default maxMissingSpan (3) bridges the run into one 2-marker segment', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: M },
      { pos: 6 * MB, cls: M },
      { pos: 8 * MB, cls: M },
      { pos: 10 * MB, cls: D },
      { pos: 12 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // 3 skipped markers equals maxMissingSpan (3), not over it, so the run
    // bridges the gap instead of closing. (The 4-M case, one skip more than
    // this, is case 4 above and drops both resulting singletons.)
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ nMarkers: 2, startBp: 2 * MB, endBp: 10 * MB });
  });

  it('review 2: with maxMissingSpan = 0, R D M D R splits at the single M into two dropped singletons (two with includeShort)', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: M },
      { pos: 6 * MB, cls: D },
      { pos: 8 * MB, cls: R },
    ]);
    const params: SegmentParams = { ...DEFAULT_SEGMENT_PARAMS, maxMissingSpan: 0 };
    expect(callSegments(dataset, cls, 0, params)).toEqual([]);
    const short = callSegments(dataset, cls, 0, params, true);
    expect(short).toHaveLength(2);
    expect(short[0]).toMatchObject({ nMarkers: 1, startBp: 2 * MB, endBp: 2 * MB });
    expect(short[1]).toMatchObject({ nMarkers: 1, startBp: 6 * MB, endBp: 6 * MB });
  });

  it('review 3: a big gap fires on the RP marker that closes the first run, and the RP call itself closes nothing further', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: D },
      { pos: 44 * MB, cls: R },
      { pos: 46 * MB, cls: D },
      { pos: 48 * MB, cls: D },
      { pos: 50 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // The gap test runs before the class of the current marker (the R at 44
    // Mb) is examined, so it is the 40 Mb step into that R that closes the
    // first run; the R being RP_HOM then closes an already-empty run, a no-op.
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startBp: 2 * MB, endBp: 4 * MB, rightFlankBp: 44 * MB });
    expect(segs[1]).toMatchObject({ startBp: 46 * MB, endBp: 48 * MB, leftFlankBp: 44 * MB });
  });

  it('review 4: a big gap with no run open does nothing, so R [40 Mb] R D D R is one segment', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 40 * MB, cls: R },
      { pos: 42 * MB, cls: D },
      { pos: 44 * MB, cls: D },
      { pos: 46 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      startBp: 42 * MB,
      endBp: 44 * MB,
      leftFlankBp: 40 * MB,
      rightFlankBp: 46 * MB,
    });
  });

  it('review 5a: a bp step of exactly maxSegmentGapBp (10 Mb) does not split', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1 * MB, cls: D },
      { pos: 2 * MB, cls: D },
      { pos: 12 * MB, cls: D }, // 10,000,000 bp step from 2 Mb: exactly maxSegmentGapBp
      { pos: 13 * MB, cls: D },
      { pos: 14 * MB, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ nMarkers: 4 });
  });

  it('review 5b: one bp above maxSegmentGapBp splits', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cls: R },
      { pos: 1_000_000, cls: D },
      { pos: 2_000_000, cls: D },
      { pos: 12_000_001, cls: D }, // 10,000,001 bp step: one over maxSegmentGapBp
      { pos: 13_000_001, cls: D },
      { pos: 14_000_001, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ nMarkers: 2 });
    expect(segs[1]).toMatchObject({ nMarkers: 2 });
  });

  it('review 5c: a cM step of exactly maxSegmentGapCm (10) does not split', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cm: 0, cls: R },
      { pos: 1 * MB, cm: 1, cls: D },
      { pos: 2 * MB, cm: 2, cls: D },
      { pos: 3 * MB, cm: 12, cls: D }, // 10 cM step from cm 2: exactly maxSegmentGapCm
      { pos: 4 * MB, cm: 13, cls: D },
      { pos: 5 * MB, cm: 14, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ nMarkers: 4 });
  });

  it('review 5d: one cM above maxSegmentGapCm splits', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0, cm: 0, cls: R },
      { pos: 1 * MB, cm: 1, cls: D },
      { pos: 2 * MB, cm: 2, cls: D },
      { pos: 3 * MB, cm: 13, cls: D }, // 11 cM step from cm 2: over maxSegmentGapCm
      { pos: 4 * MB, cm: 14, cls: D },
      { pos: 5 * MB, cm: 15, cls: R },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ nMarkers: 2 });
    expect(segs[1]).toMatchObject({ nMarkers: 2 });
  });

  it('review 6: a negative cM step splits via Math.abs, since |cm(-20) - cm(2)| = 22 > maxSegmentGapCm', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cm: 0, cls: D },
      { pos: 2 * MB, cm: 1, cls: D },
      { pos: 4 * MB, cm: 2, cls: D },
      { pos: 6 * MB, cm: -20, cls: D },
      { pos: 8 * MB, cm: -19, cls: D },
      { pos: 10 * MB, cm: -18, cls: D },
    ]);
    const segs = callSegments(dataset, cls, 0);
    // The raw difference (-20 - 2 = -22) is negative; the gap test uses
    // Math.abs, so |-22| = 22 > maxSegmentGapCm (10) and the run splits.
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ nMarkers: 3, startBp: 0, endBp: 4 * MB });
    expect(segs[1]).toMatchObject({ nMarkers: 3, startBp: 6 * MB, endBp: 10 * MB });
  });

  it('review 7: a chromosome with all-NaN cm falls back to bp per step, while a sibling chromosome with finite cm uses the cm criterion', () => {
    const { dataset, cls } = makeCase([
      {
        chrom: 'Gm01',
        markers: [
          { pos: 0 * MB, cls: R }, // no cm anywhere on this chromosome: NaN throughout
          { pos: 2 * MB, cls: D },
          { pos: 4 * MB, cls: D },
          { pos: 44 * MB, cls: D },
          { pos: 46 * MB, cls: D },
          { pos: 48 * MB, cls: R },
        ],
      },
      {
        chrom: 'Gm02',
        markers: [
          { pos: 0 * MB, cm: 0, cls: R },
          { pos: 2 * MB, cm: 1, cls: D },
          { pos: 4 * MB, cm: 2, cls: D },
          { pos: 44 * MB, cm: 5, cls: D },
          { pos: 46 * MB, cm: 6, cls: D },
          { pos: 48 * MB, cm: 7, cls: R },
        ],
      },
    ]);
    // The dataset carries a genetic map overall (Gm02 supplies cm), so the
    // criterion is 'cm' everywhere, but every one of Gm01's markers has NaN
    // cm, so every one of its steps falls back to bp.
    expect(segmentGapCriterion(dataset)).toBe('cm');
    const segs = callSegments(dataset, cls, 0);
    const gm01 = segs.filter((s) => s.chrom === 'Gm01');
    const gm02 = segs.filter((s) => s.chrom === 'Gm02');
    // Gm01: the 40 Mb step (4 -> 44 Mb) splits (bp fallback); the 2 Mb steps do not.
    expect(gm01).toHaveLength(2);
    expect(gm01[0]).toMatchObject({ startBp: 2 * MB, endBp: 4 * MB, nMarkers: 2 });
    expect(gm01[1]).toMatchObject({ startBp: 44 * MB, endBp: 46 * MB, nMarkers: 2 });
    // Gm02: the same 40 Mb step is only 3 cM, under maxSegmentGapCm, so it does not split.
    expect(gm02).toHaveLength(1);
    expect(gm02[0]).toMatchObject({ startBp: 2 * MB, endBp: 46 * MB, nMarkers: 4 });
  });

  it('review 8: the missing-span counter and any open run reset at the chromosome boundary', () => {
    const { dataset, cls } = makeCase([
      {
        chrom: 'Gm01',
        markers: [
          { pos: 0 * MB, cls: R },
          { pos: 2 * MB, cls: D },
          { pos: 4 * MB, cls: D },
          { pos: 6 * MB, cls: M },
          { pos: 8 * MB, cls: M },
          { pos: 10 * MB, cls: M }, // 3 skipped (== maxMissingSpan): run stays open to chromosome end
        ],
      },
      {
        chrom: 'Gm02',
        markers: [
          { pos: 0 * MB, cls: M },
          { pos: 2 * MB, cls: D },
          { pos: 4 * MB, cls: D },
          { pos: 6 * MB, cls: R },
        ],
      },
    ]);
    const segs = callSegments(dataset, cls, 0);
    expect(segs).toHaveLength(2);
    const gm01 = segs.find((s) => s.chrom === 'Gm01');
    const gm02 = segs.find((s) => s.chrom === 'Gm02');
    // Gm01's run is force-closed by the unconditional closeRun() at the end of
    // the chromosome loop, still holding its 2 D's (the skip count of 3 never
    // exceeded maxMissingSpan): nMarkers 2, and no RP marker follows it on
    // this chromosome, so rightFlankBp is NaN (the boundary side).
    expect(gm01).toMatchObject({ nMarkers: 2, startBp: 2 * MB, endBp: 4 * MB, leftFlankBp: 0 });
    expect(gm01?.rightFlankBp).toBeNaN();
    // Gm02's run/skipped state starts fresh (these are chromosome-scoped
    // locals), so its leading M does not inherit Gm01's skip count of 3:
    // nMarkers 2, and no RP marker precedes it on this chromosome, so
    // leftFlankBp is NaN (the boundary side).
    expect(gm02).toMatchObject({
      nMarkers: 2,
      startBp: 2 * MB,
      endBp: 4 * MB,
      rightFlankBp: 6 * MB,
    });
    expect(gm02?.leftFlankBp).toBeNaN();
  });

  it('review 9: NONPARENTAL beyond maxMissingSpan behaves exactly like MISSING and splits the run', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: N },
      { pos: 6 * MB, cls: N },
      { pos: 8 * MB, cls: N },
      { pos: 10 * MB, cls: N },
      { pos: 12 * MB, cls: D },
      { pos: 14 * MB, cls: R },
    ]);
    expect(callSegments(dataset, cls, 0)).toEqual([]);
    const short = callSegments(dataset, cls, 0, DEFAULT_SEGMENT_PARAMS, true);
    expect(short).toHaveLength(2);
    expect(short[0]).toMatchObject({ nMarkers: 1, startBp: 2 * MB });
    expect(short[1]).toMatchObject({ nMarkers: 1, startBp: 12 * MB });
  });

  it('review 10: both singleton segments from a missing-span split report the same leading/trailing flanks', () => {
    const { dataset, cls } = makeSingleChrom([
      { pos: 0 * MB, cls: R },
      { pos: 2 * MB, cls: D },
      { pos: 4 * MB, cls: M },
      { pos: 6 * MB, cls: M },
      { pos: 8 * MB, cls: M },
      { pos: 10 * MB, cls: M },
      { pos: 12 * MB, cls: D },
      { pos: 14 * MB, cls: R },
    ]);
    const short = callSegments(dataset, cls, 0, DEFAULT_SEGMENT_PARAMS, true);
    expect(short).toHaveLength(2);
    // Both singletons' flank scans pass over the other run (not RP_HOM) and
    // land on the same pair of flanking RP_HOM markers.
    expect(short[0]).toMatchObject({ leftFlankBp: 0, rightFlankBp: 14 * MB });
    expect(short[1]).toMatchObject({ leftFlankBp: 0, rightFlankBp: 14 * MB });
  });
});
