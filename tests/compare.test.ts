/** Pairwise line comparison (algorithm 5): hand-built cases, no fixture files. */
import { describe, expect, it } from 'vitest';

import { compareLines } from '../src/core/compare.ts';
import type { CallClassValue, Classification, Dataset, SampleRole } from '../src/core/types.ts';
import { CallClass, MISSING_ALLELE } from '../src/core/types.ts';

interface MarkerSpec {
  chrom: string;
  pos: number;
  informative: boolean;
}

interface SampleSpec {
  sampleId: string;
  role: SampleRole;
  /** Sorted allele pair per marker; omit the whole sample to model "no genotype column". */
  alleles?: [number, number][];
  /** Per-marker call class; present for candidates only. */
  classes?: CallClassValue[];
}

/**
 * Builds a Dataset + Classification from a flat, already genome-ordered list
 * of marker specs (grouped by chromosome, as tests/segments.test.ts does)
 * and a list of sample specs. A sample with `alleles` gets a genotype
 * column; a sample with `classes` becomes a candidate row in
 * `cls.classes`. `informative` and `sortedMarkerOrder` are taken from the
 * specs directly so callers control exactly what compareLines sees, the
 * same way makeCase in tests/segments.test.ts hands classes to callSegments
 * without going through classifyDataset.
 */
function makeCase(
  markerSpecs: MarkerSpec[],
  sampleSpecs: SampleSpec[],
): { dataset: Dataset; cls: Classification } {
  const nMarkers = markerSpecs.length;
  const chromosomeOrder: string[] = [];
  const chromIndexArr: number[] = [];
  for (const spec of markerSpecs) {
    let ci = chromosomeOrder.indexOf(spec.chrom);
    if (ci < 0) {
      ci = chromosomeOrder.length;
      chromosomeOrder.push(spec.chrom);
    }
    chromIndexArr.push(ci);
  }

  const ids = markerSpecs.map((s, i) => `${s.chrom}_${i}`);
  const chrom = markerSpecs.map((s) => s.chrom);
  const posBp = Float64Array.from(markerSpecs.map((s) => s.pos));
  const informative = Uint8Array.from(markerSpecs.map((s) => (s.informative ? 1 : 0)));

  const genotypeSamples = sampleSpecs.filter((s) => s.alleles !== undefined);
  const sampleIds = genotypeSamples.map((s) => s.sampleId);
  const nSamples = sampleIds.length;
  const allele1 = new Uint8Array(nMarkers * nSamples).fill(MISSING_ALLELE);
  const allele2 = new Uint8Array(nMarkers * nSamples).fill(MISSING_ALLELE);
  genotypeSamples.forEach((s, col) => {
    const pairs = s.alleles as [number, number][];
    for (let m = 0; m < nMarkers; m++) {
      const pair = pairs[m] as [number, number];
      allele1[m * nSamples + col] = pair[0];
      allele2[m * nSamples + col] = pair[1];
    }
  });

  const rec = sampleSpecs.find((s) => s.role === 'recurrent_parent');
  const don = sampleSpecs.find((s) => s.role === 'donor_parent');
  const recurrentParentCol = rec === undefined ? -1 : sampleIds.indexOf(rec.sampleId);
  const donorParentCol = don === undefined ? -1 : sampleIds.indexOf(don.sampleId);

  const dataset: Dataset = {
    markers: { ids, chrom, posBp, alleles: ids.map(() => ['A', 'B']) },
    genotypes: { nMarkers, nSamples, sampleIds, allele1, allele2 },
    samples: sampleSpecs.map((s) => ({
      sampleId: s.sampleId,
      lineName: s.sampleId,
      role: s.role,
      generation: '',
      familyId: '',
      notes: '',
    })),
    recurrentParentCol,
    donorParentCol,
    coded: recurrentParentCol < 0 || donorParentCol < 0,
    chromosomeOrder,
    chromIndex: Int32Array.from(chromIndexArr),
    sortedMarkerOrder: Int32Array.from({ length: nMarkers }, (_, i) => i),
  };

  const candidateSamples = sampleSpecs.filter((s) => s.classes !== undefined);
  const candidateCols = Int32Array.from(candidateSamples.map((s) => sampleIds.indexOf(s.sampleId)));
  const classes = new Uint8Array(candidateSamples.length * nMarkers);
  candidateSamples.forEach((s, row) => {
    const cs = s.classes as CallClassValue[];
    for (let m = 0; m < nMarkers; m++) classes[row * nMarkers + m] = cs[m] as CallClassValue;
  });

  // Mirror classifyDataset: at an informative marker rpAllele and donorAllele
  // are the parents' own homozygous alleles, or 0 and 1 for a coded matrix
  // with no parent columns. Leaving them zeroed would make every parent look
  // recurrent and quietly hide real discordance.
  const rpAllele = new Uint8Array(nMarkers).fill(MISSING_ALLELE);
  const donorAllele = new Uint8Array(nMarkers).fill(MISSING_ALLELE);
  for (let m = 0; m < nMarkers; m++) {
    if (informative[m] === 0) continue;
    if (recurrentParentCol < 0 || donorParentCol < 0) {
      rpAllele[m] = 0;
      donorAllele[m] = 1;
      continue;
    }
    rpAllele[m] = allele1[m * nSamples + recurrentParentCol] as number;
    donorAllele[m] = allele1[m * nSamples + donorParentCol] as number;
  }

  const cls: Classification = {
    candidateCols,
    classes,
    informative,
    rpAllele,
    donorAllele,
    nMarkers,
  };

  return { dataset, cls };
}

/** n repeats of the sorted allele pair [a1, a2], typed for SampleSpec.alleles. */
function fillPair(n: number, a1: number, a2: number): [number, number][] {
  return Array.from({ length: n }, () => [a1, a2] as [number, number]);
}

const R = CallClass.RP_HOM;
const D = CallClass.DONOR_HOM;
const H = CallClass.HET;
const M = CallClass.MISSING;
const N = CallClass.NONPARENTAL;

describe('compareLines mode informative', () => {
  it('is discordant exactly at the candidate calls that are not RP_HOM, skipping MISSING/NONPARENTAL', () => {
    const { dataset, cls } = makeCase(
      [
        { chrom: 'Gm01', pos: 100, informative: true },
        { chrom: 'Gm01', pos: 200, informative: true },
        { chrom: 'Gm01', pos: 300, informative: true },
        { chrom: 'Gm01', pos: 400, informative: true },
        { chrom: 'Gm01', pos: 500, informative: true },
        { chrom: 'Gm01', pos: 600, informative: true },
      ],
      [
        { sampleId: 'RP', role: 'recurrent_parent', alleles: fillPair(6, 0, 0) },
        { sampleId: 'DONOR', role: 'donor_parent', alleles: fillPair(6, 1, 1) },
        {
          sampleId: 'C1',
          role: 'candidate',
          alleles: fillPair(6, 0, 0),
          classes: [R, D, H, M, N, R],
        },
      ],
    );

    const diff = compareLines(dataset, cls, 'C1', 'RP', 'informative');
    expect(diff.nCompared).toBe(4); // positions 0,1,2,5 (M and N excluded)
    expect(diff.nDiscordant).toBe(2); // positions 1 (D) and 2 (H)
    expect(Array.from(diff.discordantMarkers)).toEqual([1, 2]);
    expect(Number.isNaN(diff.ibs)).toBe(true);
    expect(diff.sampleA).toBe('C1');
    expect(diff.sampleB).toBe('RP');
    expect(diff.mode).toBe('informative');
  });

  it('every informative marker is discordant between the recurrent parent and the donor parent', () => {
    const markers: MarkerSpec[] = Array.from({ length: 5 }, (_, i) => ({
      chrom: 'Gm01',
      pos: (i + 1) * 100,
      informative: true,
    }));
    const { dataset, cls } = makeCase(markers, [
      { sampleId: 'RP', role: 'recurrent_parent', alleles: fillPair(5, 0, 0) },
      { sampleId: 'DONOR', role: 'donor_parent', alleles: fillPair(5, 1, 1) },
    ]);

    const diff = compareLines(dataset, cls, 'RP', 'DONOR', 'informative');
    expect(diff.nCompared).toBe(5);
    expect(diff.nDiscordant).toBe(5);
    expect(Array.from(diff.discordantMarkers)).toEqual([0, 1, 2, 3, 4]);
  });

  it('reports a parent with no call as missing rather than inventing a parental call', () => {
    // A coded A/B/H matrix keeps a marker informative even where the parent
    // column itself is uncalled, because the symbols carry parent of origin.
    // The parent's own class there must still be MISSING: a comparison that
    // synthesised rp_hom would export a call the file does not contain.
    const markers: MarkerSpec[] = [
      { chrom: 'Gm01', pos: 100, informative: true },
      { chrom: 'Gm01', pos: 200, informative: true },
    ];
    const { dataset, cls } = makeCase(markers, [
      {
        sampleId: 'RP',
        role: 'recurrent_parent',
        alleles: [
          [0, 0],
          [MISSING_ALLELE, MISSING_ALLELE],
        ],
      },
      {
        sampleId: 'DONOR',
        role: 'donor_parent',
        alleles: [
          [1, 1],
          [1, 1],
        ],
      },
      {
        sampleId: 'C1',
        role: 'candidate',
        alleles: [
          [1, 1],
          [1, 1],
        ],
        classes: [CallClass.DONOR_HOM, CallClass.DONOR_HOM],
      },
    ]);

    const diff = compareLines(dataset, cls, 'C1', 'RP', 'informative');
    // Only the first marker can be compared; the second is skipped as missing,
    // and counted so the smaller denominator is visible.
    expect(diff.nCompared).toBe(1);
    expect(diff.nDiscordant).toBe(1);
    expect(diff.nSkippedMissing).toBe(1);
    expect(diff.nSkippedNonparental).toBe(0);
  });

  it('counts a nonparental call as a skipped comparison, not a silent drop', () => {
    const markers: MarkerSpec[] = [
      { chrom: 'Gm01', pos: 100, informative: true },
      { chrom: 'Gm01', pos: 200, informative: true },
    ];
    const { dataset, cls } = makeCase(markers, [
      { sampleId: 'RP', role: 'recurrent_parent', alleles: fillPair(2, 0, 0) },
      { sampleId: 'DONOR', role: 'donor_parent', alleles: fillPair(2, 1, 1) },
      {
        sampleId: 'C1',
        role: 'candidate',
        alleles: fillPair(2, 0, 0),
        classes: [CallClass.RP_HOM, CallClass.NONPARENTAL],
      },
    ]);

    const diff = compareLines(dataset, cls, 'C1', 'RP', 'informative');
    expect(diff.nCompared).toBe(1);
    expect(diff.nDiscordant).toBe(0);
    expect(diff.nSkippedNonparental).toBe(1);
    expect(diff.nSkippedMissing).toBe(0);
  });

  it('a coded dataset with parentless columns works in mode informative', () => {
    const markers: MarkerSpec[] = [
      { chrom: 'Gm01', pos: 100, informative: true },
      { chrom: 'Gm01', pos: 200, informative: true },
    ];
    const { dataset, cls } = makeCase(markers, [
      { sampleId: 'RP', role: 'recurrent_parent' }, // no alleles: no genotype column
      { sampleId: 'DONOR', role: 'donor_parent' }, // no alleles: no genotype column
      {
        sampleId: 'C1',
        role: 'candidate',
        alleles: [
          [0, 0],
          [1, 1],
        ],
        classes: [R, D],
      },
    ]);

    expect(dataset.genotypes.sampleIds.indexOf('RP')).toBe(-1);

    const diff = compareLines(dataset, cls, 'C1', 'RP', 'informative');
    expect(diff.nCompared).toBe(2);
    expect(diff.nDiscordant).toBe(1);

    expect(() => compareLines(dataset, cls, 'C1', 'RP', 'all')).toThrow(/RP/);
  });

  it('throws naming an unknown sample id', () => {
    const { dataset, cls } = makeCase(
      [{ chrom: 'Gm01', pos: 100, informative: true }],
      [
        { sampleId: 'RP', role: 'recurrent_parent', alleles: [[0, 0]] },
        { sampleId: 'C1', role: 'candidate', alleles: [[0, 0]], classes: [R] },
      ],
    );
    expect(() => compareLines(dataset, cls, 'C1', 'GHOST', 'informative')).toThrow(/GHOST/);
  });

  it('reports a zero row for a chromosome where nothing was compared', () => {
    const { dataset, cls } = makeCase(
      [
        { chrom: 'Gm01', pos: 100, informative: true },
        { chrom: 'Gm01', pos: 200, informative: true },
        { chrom: 'Gm02', pos: 100, informative: true },
        { chrom: 'Gm02', pos: 200, informative: true },
      ],
      [
        { sampleId: 'RP', role: 'recurrent_parent', alleles: fillPair(4, 0, 0) },
        {
          sampleId: 'C1',
          role: 'candidate',
          alleles: fillPair(4, 0, 0),
          classes: [R, D, M, M], // Gm02 both MISSING: nothing comparable there
        },
      ],
    );

    const diff = compareLines(dataset, cls, 'C1', 'RP', 'informative');
    expect(diff.byChromosome).toHaveLength(2);
    expect(diff.byChromosome[0]).toEqual({ chrom: 'Gm01', nCompared: 2, nDiscordant: 1 });
    expect(diff.byChromosome[1]).toEqual({ chrom: 'Gm02', nCompared: 0, nDiscordant: 0 });
    expect(diff.nCompared).toBe(2);
    expect(diff.nDiscordant).toBe(1);
  });

  it('orders discordantMarkers in genome order across two chromosomes', () => {
    const { dataset, cls } = makeCase(
      [
        { chrom: 'Gm01', pos: 100, informative: true },
        { chrom: 'Gm01', pos: 200, informative: true },
        { chrom: 'Gm01', pos: 300, informative: true },
        { chrom: 'Gm02', pos: 100, informative: true },
        { chrom: 'Gm02', pos: 200, informative: true },
        { chrom: 'Gm02', pos: 300, informative: true },
      ],
      [
        { sampleId: 'RP', role: 'recurrent_parent', alleles: fillPair(6, 0, 0) },
        {
          sampleId: 'C1',
          role: 'candidate',
          alleles: fillPair(6, 0, 0),
          classes: [R, D, R, R, H, R],
        },
      ],
    );

    const diff = compareLines(dataset, cls, 'C1', 'RP', 'informative');
    expect(Array.from(diff.discordantMarkers)).toEqual([1, 4]);
  });
});

describe('compareLines mode all', () => {
  it('sees a difference at an UNINFORMATIVE marker that mode informative cannot', () => {
    const { dataset, cls } = makeCase(
      [{ chrom: 'Gm01', pos: 100, informative: false }],
      [
        { sampleId: 'A', role: 'candidate', alleles: [[0, 1]], classes: [CallClass.UNINFORMATIVE] },
        { sampleId: 'B', role: 'candidate', alleles: [[0, 0]], classes: [CallClass.UNINFORMATIVE] },
      ],
    );

    const infDiff = compareLines(dataset, cls, 'A', 'B', 'informative');
    expect(infDiff.nCompared).toBe(0);
    expect(infDiff.nDiscordant).toBe(0);

    const allDiff = compareLines(dataset, cls, 'A', 'B', 'all');
    expect(allDiff.nCompared).toBe(1);
    expect(allDiff.nDiscordant).toBe(1);
    expect(Array.from(allDiff.discordantMarkers)).toEqual([0]);
  });

  it('gives ibs 1 and nDiscordant 0 for a sample against itself', () => {
    const { dataset, cls } = makeCase(
      [
        { chrom: 'Gm01', pos: 100, informative: true },
        { chrom: 'Gm01', pos: 200, informative: true },
      ],
      [
        {
          sampleId: 'S',
          role: 'candidate',
          alleles: [
            [0, 1],
            [1, 1],
          ],
          classes: [H, D],
        },
      ],
    );

    const diff = compareLines(dataset, cls, 'S', 'S', 'all');
    expect(diff.nDiscordant).toBe(0);
    expect(diff.ibs).toBe(1);
  });

  it('computes the expected ibs fraction by hand', () => {
    // P vs Q allele pairs: (0,0)/(0,0) shared 2; (0,1)/(0,0) shared 1;
    // (0,1)/(1,1) shared 1; (0,0)/(1,1) shared 0. Mean shared/2 = (1+.5+.5+0)/4 = 0.5.
    const { dataset, cls } = makeCase(
      [
        { chrom: 'Gm01', pos: 100, informative: true },
        { chrom: 'Gm01', pos: 200, informative: true },
        { chrom: 'Gm01', pos: 300, informative: true },
        { chrom: 'Gm01', pos: 400, informative: true },
      ],
      [
        {
          sampleId: 'P',
          role: 'candidate',
          alleles: [
            [0, 0],
            [0, 1],
            [0, 1],
            [0, 0],
          ],
          classes: [R, H, H, R],
        },
        {
          sampleId: 'Q',
          role: 'candidate',
          alleles: [
            [0, 0],
            [0, 0],
            [1, 1],
            [1, 1],
          ],
          classes: [R, R, D, D],
        },
      ],
    );

    const diff = compareLines(dataset, cls, 'P', 'Q', 'all');
    expect(diff.nCompared).toBe(4);
    expect(diff.nDiscordant).toBe(3);
    expect(diff.ibs).toBe(0.5);
  });
});
