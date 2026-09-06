/** Quality-control flags (algorithm 6): planted-fixture assertions. */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { computeRpp } from '../src/core/rpp.ts';
import { DEFAULT_QC_THRESHOLDS, computeQc } from '../src/core/qc.ts';
import { MISSING_ALLELE } from '../src/core/types.ts';
import type { Dataset } from '../src/core/types.ts';
import { loadDataset, loadExpected } from './helpers.ts';

/** Allele pair [allele1, allele2], sorted so allele1 <= allele2 per docs/adr/0005. */
type Pair = [number, number];

function hom(x: number): Pair {
  return [x, x];
}
function het(x: number, y: number): Pair {
  return x <= y ? [x, y] : [y, x];
}
const MISS: Pair = [MISSING_ALLELE, MISSING_ALLELE];

interface QcMarkerRow {
  /** Recurrent-parent call; defaults to MISSING when omitted. */
  rp?: Pair;
  /** Donor-parent call; defaults to MISSING when omitted. */
  donor?: Pair;
  /** One call per candidate, in the order candidateNames lists them. */
  candidates: Pair[];
}

/**
 * Builds a non-coded, single-chromosome Dataset with 2 parent columns (RP,
 * DONOR) plus one genotype column per candidate, from explicit allele-index
 * pairs, so a case can plant parent heterozygosity, parent/candidate
 * missingness, and nonparental candidate calls directly rather than through
 * the fixture file.
 */
function makeCase(rows: QcMarkerRow[], candidateNames?: string[]): { dataset: Dataset } {
  const nCandidates = rows[0]?.candidates.length ?? 0;
  const names = candidateNames ?? Array.from({ length: nCandidates }, (_, i) => `CAND${i}`);
  const nMarkers = rows.length;
  const ids = rows.map((_, i) => `m${i}`);
  const chrom = rows.map(() => 'Gm01');
  const posBp = Float64Array.from(rows.map((_, i) => (i + 1) * 1000));
  const alleles = rows.map(() => ['A', 'B', 'C']);

  const sampleIds = ['RP', 'DONOR', ...names];
  const nSamples = sampleIds.length;
  const allele1 = new Uint8Array(nMarkers * nSamples);
  const allele2 = new Uint8Array(nMarkers * nSamples);
  for (let m = 0; m < nMarkers; m++) {
    const row = rows[m] as QcMarkerRow;
    const setCell = (col: number, pair: Pair): void => {
      const i = m * nSamples + col;
      allele1[i] = pair[0];
      allele2[i] = pair[1];
    };
    setCell(0, row.rp ?? MISS);
    setCell(1, row.donor ?? MISS);
    row.candidates.forEach((pair, ci) => setCell(2 + ci, pair));
  }

  const dataset: Dataset = {
    markers: { ids, chrom, posBp, alleles },
    genotypes: { nMarkers, nSamples, sampleIds, allele1, allele2 },
    samples: [
      {
        sampleId: 'RP',
        lineName: 'RP',
        role: 'recurrent_parent',
        generation: '',
        familyId: '',
        notes: '',
      },
      {
        sampleId: 'DONOR',
        lineName: 'DONOR',
        role: 'donor_parent',
        generation: '',
        familyId: '',
        notes: '',
      },
      ...names.map((id) => ({
        sampleId: id,
        lineName: id,
        role: 'candidate' as const,
        generation: '',
        familyId: '',
        notes: '',
      })),
    ],
    recurrentParentCol: 0,
    donorParentCol: 1,
    coded: false,
    chromosomeOrder: ['Gm01'],
    chromIndex: new Int32Array(nMarkers),
    sortedMarkerOrder: Int32Array.from({ length: nMarkers }, (_, i) => i),
  };

  return { dataset };
}

describe('computeQc on the VCF fixture', () => {
  const expected = loadExpected();
  const dataset = loadDataset('genotypes.vcf', 'vcf');
  const cls = classifyDataset(dataset);
  const rpp = computeRpp(dataset, cls, expected.params);
  const qc = computeQc(dataset, cls, rpp);

  it('emits one line row per sample, in manifest order, parents first', () => {
    expect(qc.lines).toHaveLength(8);
    expect(qc.lines.map((l) => l.sampleId)).toEqual([
      'RP_Williams',
      'DONOR_PI',
      'NIL_01',
      'NIL_02',
      'NIL_03',
      'NIL_04',
      'NIL_05',
      'NIL_06',
    ]);
    expect(qc.lines[0]?.role).toBe('recurrent_parent');
    expect(qc.lines[1]?.role).toBe('donor_parent');
  });

  it('flags NIL_03 for its one planted nonparental call on Gm07, but not as closer to donor', () => {
    const nil03 = qc.lines.find((l) => l.sampleId === 'NIL_03');
    expect(nil03?.flags).toContain('nonparental_alleles');
    expect(nil03?.flags).not.toContain('closer_to_donor');
  });

  it('flags NIL_05 as closer to donor (planted sample-swap pattern)', () => {
    const nil05 = qc.lines.find((l) => l.sampleId === 'NIL_05');
    expect(nil05?.flags).toContain('closer_to_donor');
  });

  it('flags NIL_06 for high missingness but not high heterozygosity', () => {
    const nil06 = qc.lines.find((l) => l.sampleId === 'NIL_06');
    expect(nil06?.flags).toContain('high_missing');
    expect(nil06?.flags).not.toContain('high_het');
    // Empirically hetRate = 14 / 438: the planted 15% missingness thins the
    // called set to 438 of 500 markers, and 14 of those are heterozygous —
    // still below DEFAULT_QC_THRESHOLDS.lineHetMax (0.05).
    expect(nil06?.hetRate).toBeLessThan(DEFAULT_QC_THRESHOLDS.lineHetMax);
  });

  it('flags NIL_01 with nothing at all', () => {
    const nil01 = qc.lines.find((l) => l.sampleId === 'NIL_01');
    expect(nil01?.flags).toEqual([]);
  });

  it('does not flag the recurrent parent as heterozygous: 5/500 sits below the 0.02 default', () => {
    const rp = qc.lines.find((l) => l.sampleId === 'RP_Williams');
    // Empirically verified: the fixture plants 5 heterozygous RP calls out of
    // 500 markers, giving hetRate = 0.01, below DEFAULT_QC_THRESHOLDS.parentHetMax (0.02).
    expect(rp?.hetRate).toBeCloseTo(5 / 500, 12);
    expect(rp?.flags).not.toContain('parent_heterozygous');
  });

  it('reports marker call rate and informative counts over all 500 markers', () => {
    expect(qc.markers.callRate).toHaveLength(500);
    for (const rate of qc.markers.callRate) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
    let nInformative = 0;
    for (const v of qc.markers.informative) nInformative += v;
    expect(nInformative).toBe(expected.nInformative);
    expect(qc.nInformative).toBe(expected.nInformative);
  });

  it('computes parentPolymorphismRate over markers where both parents are called and homozygous', () => {
    // Empirically the scorable denominator is 490, not the whole 500: the
    // fixture's 5 planted heterozygous RP calls and 5 planted missing donor
    // calls (10 markers total) fail the both-called-both-homozygous test, so
    // parentPolymorphismRate = 460 / 490.
    expect(qc.parentPolymorphismRate).toBeCloseTo(460 / 490, 12);
  });

  it('does not raise parents_identical for this fixture', () => {
    expect(qc.datasetFlags).not.toContain('parents_identical');
  });
});

describe('computeQc: edge cases from review', () => {
  it('review 20: identical_to_rp fires for an all-RP_HOM candidate, and is displaced once one call is nonparental', () => {
    const rp = hom(0);
    const donor = hom(1);
    const { dataset } = makeCase(
      [
        { rp, donor, candidates: [hom(0), hom(0)] },
        { rp, donor, candidates: [hom(0), hom(0)] },
        { rp, donor, candidates: [hom(0), hom(0)] },
        { rp, donor, candidates: [hom(0), hom(0)] },
        { rp, donor, candidates: [hom(0), hom(2)] }, // CAND1: allele 2 belongs to neither parent
      ],
      ['CAND0', 'CAND1'],
    );
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls);
    const qc = computeQc(dataset, cls, rpp);
    const cand0 = qc.lines.find((l) => l.sampleId === 'CAND0');
    const cand1 = qc.lines.find((l) => l.sampleId === 'CAND1');
    expect(cand0?.flags).toContain('identical_to_rp');
    // identical_to_rp and nonparental_alleles are mutually exclusive: the one
    // planted nonparental call both raises nonparental_alleles and disqualifies
    // identical_to_rp (which requires nNonparental === 0).
    expect(cand1?.flags).toContain('nonparental_alleles');
    expect(cand1?.flags).not.toContain('identical_to_rp');
  });

  it('review 21: no_informative_calls fires when a candidate is missing at every informative marker', () => {
    const rp = hom(0);
    const donor = hom(1);
    const { dataset } = makeCase(
      Array.from({ length: 5 }, () => ({ rp, donor, candidates: [MISS] })),
    );
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls);
    const qc = computeQc(dataset, cls, rpp);
    const cand = qc.lines.find((l) => l.sampleId === 'CAND0');
    expect(cand?.flags).toContain('no_informative_calls');
    expect(cand?.flags).not.toContain('identical_to_rp');
    expect(cand?.flags).not.toContain('closer_to_donor');
    expect(cand?.missingRate).toBe(1);
  });

  it('review 22: high_het fires on a candidate above lineHetMax; the same rate on a parent triggers parent_heterozygous, never high_het', () => {
    const rows: QcMarkerRow[] = [];
    for (let m = 0; m < 10; m++) {
      const rp: Pair = m < 2 ? het(0, 2) : hom(0);
      const donor: Pair = hom(1);
      const candidate: Pair = m >= 2 && m < 4 ? het(0, 1) : hom(0);
      rows.push({ rp, donor, candidates: [candidate] });
    }
    const { dataset } = makeCase(rows);
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls);
    const qc = computeQc(dataset, cls, rpp);
    const rpLine = qc.lines.find((l) => l.sampleId === 'RP');
    const cand = qc.lines.find((l) => l.sampleId === 'CAND0');
    // 2 of 10 called markers heterozygous, on both lines.
    expect(cand?.hetRate).toBeCloseTo(0.2, 12);
    expect(rpLine?.hetRate).toBeCloseTo(0.2, 12);
    expect(cand?.flags).toContain('high_het'); // 0.2 > lineHetMax (0.05)
    expect(rpLine?.flags).toContain('parent_heterozygous'); // 0.2 > parentHetMax (0.02)
    expect(rpLine?.flags).not.toContain('high_het'); // high_het only ever applies to candidates
  });

  it('review 23: parents_identical fires when the parents never differ, and every candidate is then no_informative_calls', () => {
    const rp = hom(0);
    const donor = hom(0); // identical to rp at every marker: monomorphic, so never informative
    const { dataset } = makeCase(
      Array.from({ length: 200 }, () => ({ rp, donor, candidates: [hom(0)] })),
    );
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls);
    const qc = computeQc(dataset, cls, rpp);
    expect(qc.parentPolymorphismRate).toBe(0);
    expect(qc.datasetFlags).toContain('parents_identical');
    const cand = qc.lines.find((l) => l.sampleId === 'CAND0');
    expect(cand?.flags).toContain('no_informative_calls');
  });

  it('review 24: low_marker_call_rate fires once more than 10% of markers fall below markerCallRateMin', () => {
    const goodRows: QcMarkerRow[] = Array.from({ length: 17 }, () => ({
      rp: hom(0),
      donor: hom(1),
      candidates: [hom(0), hom(0), hom(0)],
    }));
    // 3 of 5 genotype columns missing (RP, CAND1, CAND2): callRate 2/5 = 0.4,
    // below markerCallRateMin (0.8).
    const badRows: QcMarkerRow[] = Array.from({ length: 3 }, () => ({
      rp: MISS,
      donor: hom(1),
      candidates: [hom(0), MISS, MISS],
    }));
    const { dataset } = makeCase([...goodRows, ...badRows], ['CAND0', 'CAND1', 'CAND2']);
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls);
    const qc = computeQc(dataset, cls, rpp);
    expect(qc.datasetFlags).toContain('low_marker_call_rate');
    const expectedLowCallRate = new Array(20).fill(0);
    expectedLowCallRate[17] = 1;
    expectedLowCallRate[18] = 1;
    expectedLowCallRate[19] = 1;
    expect(Array.from(qc.markers.lowCallRate)).toEqual(expectedLowCallRate);
  });

  it('review 25: a coded matrix without parent columns reports NaN rates and empty flags for the unlisted parents, and full parentPolymorphismRate', () => {
    const nMarkers = 5;
    const ids = Array.from({ length: nMarkers }, (_, i) => `m${i}`);
    const chrom = Array.from({ length: nMarkers }, () => 'Gm01');
    const posBp = Float64Array.from({ length: nMarkers }, (_, i) => (i + 1) * 1000);
    const alleles = Array.from({ length: nMarkers }, () => ['A', 'B']);
    const sampleIds = ['CAND0'];
    const allele1 = Uint8Array.from([0, 0, 1, 1, 0]);
    const allele2 = Uint8Array.from([0, 1, 1, 0, 0]);
    const dataset: Dataset = {
      markers: { ids, chrom, posBp, alleles },
      genotypes: { nMarkers, nSamples: 1, sampleIds, allele1, allele2 },
      samples: [
        {
          sampleId: 'RP',
          lineName: 'RP',
          role: 'recurrent_parent',
          generation: '',
          familyId: '',
          notes: '',
        },
        {
          sampleId: 'DONOR',
          lineName: 'DONOR',
          role: 'donor_parent',
          generation: '',
          familyId: '',
          notes: '',
        },
        {
          sampleId: 'CAND0',
          lineName: 'CAND0',
          role: 'candidate',
          generation: '',
          familyId: '',
          notes: '',
        },
      ],
      recurrentParentCol: -1,
      donorParentCol: -1,
      coded: true,
      chromosomeOrder: ['Gm01'],
      chromIndex: new Int32Array(nMarkers),
      sortedMarkerOrder: Int32Array.from({ length: nMarkers }, (_, i) => i),
    };
    const cls = classifyDataset(dataset);
    const rpp = computeRpp(dataset, cls);
    const qc = computeQc(dataset, cls, rpp);
    const rpLine = qc.lines.find((l) => l.sampleId === 'RP');
    const donorLine = qc.lines.find((l) => l.sampleId === 'DONOR');
    for (const line of [rpLine, donorLine]) {
      expect(line?.missingRate).toBeNaN();
      expect(line?.hetRate).toBeNaN();
      expect(line?.nonparentalRate).toBeNaN();
      expect(line?.flags).toEqual([]);
    }
    // recurrentParentCol/donorParentCol are both -1, so classifyDataset's coded
    // branch has nothing to contradict the A/B convention and marks every
    // marker informative.
    expect(qc.parentPolymorphismRate).toBe(1);
  });
});
