/**
 * Weighted RPP at chromosome ends (docs/adr/0028, amended 2026-09-29;
 * docs/m5-phases.md 6.1): under bp the first marker's outer side is
 * min(p, cap) and the last marker's is min(max(L - p, 0), cap) with a length,
 * else cap; under cM both terminal markers get cap. Hand-built cases, since
 * the fixture generator shares this reading of the rule.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { DEFAULT_RPP_PARAMS, computeRpp, weightedSums } from '../src/core/rpp.ts';
import { MISSING_ALLELE } from '../src/core/types.ts';
import type { Dataset } from '../src/core/types.ts';

describe('weightedSums chromosome ends', () => {
  it('(a) cM: markers at 0 and 5, cap 5, weigh 7.5 and 7.5', () => {
    // First: left 5 (cap, not min(0, 5)), right 2.5. Last: left 2.5, right 5.
    expect(weightedSums([0, 5], [1, 0], 5, false)).toEqual([7.5, 15]);
  });

  it('(b) bp: markers at 0 and 5, cap 5, weigh 2.5 and 7.5 (rule unchanged)', () => {
    expect(weightedSums([0, 5], [1, 0], 5, true)).toEqual([2.5, 10]);
  });

  // Cases (c)-(f) score every marker 1, so totalWeight is the sum of the sides.
  it('(c) bp: a first marker at 3 reaches back 3', () => {
    // First: 3 + 1; last: 1 + 5.
    expect(weightedSums([3, 5], [1, 1], 5, true)).toEqual([10, 10]);
  });

  it('(d) cM: a first marker at 3 reaches back the cap, 5', () => {
    // First: 5 + 1; last: 1 + 5.
    expect(weightedSums([3, 5], [1, 1], 5, false)).toEqual([12, 12]);
  });

  it('(e) bp with chromLength 6: the last marker reaches 1', () => {
    // First: 3 + 1; last: 1 + min(6 - 5, 5) = 1 + 1.
    expect(weightedSums([3, 5], [1, 1], 5, true, 6)).toEqual([6, 6]);
  });

  it('(e2) bp with chromLength 4 short of the last marker: its right side clamps to 0', () => {
    // First: 3 + 1; last: 1 + min(max(4 - 5, 0), 5) = 1 + 0.
    expect(weightedSums([3, 5], [1, 1], 5, true, 4)).toEqual([5, 5]);
  });

  it('(f) a single marker at 2 weighs 10 under cM and 7 under bp', () => {
    expect(weightedSums([2], [1], 5, false)).toEqual([10, 10]);
    expect(weightedSums([2], [1], 5, true)).toEqual([7, 7]);
  });
});

/** A candidate call: RP_HOM (A/A), DONOR_HOM (B/B), HET (A/B) or MISSING. */
type Call = 'RP' | 'DONOR' | 'HET' | 'MISSING';
const PAIR: Record<Call, [number, number]> = {
  RP: [0, 0],
  DONOR: [1, 1],
  HET: [0, 1],
  MISSING: [MISSING_ALLELE, MISSING_ALLELE],
};

/**
 * One chromosome of informative markers (RP A/A, donor B/B) at the given bp
 * and cM positions, with one candidate whose calls are `calls`.
 */
function oneChromDataset(posBp: number[], cm: number[], calls: Call[]): Dataset {
  const nMarkers = calls.length;
  const sampleIds = ['RP', 'DONOR', 'CAND0'];
  const nSamples = sampleIds.length;
  // Marker-major cells: [RP, DONOR, CAND0] per marker; allele 0 = A, 1 = B.
  const allele1 = new Uint8Array(nMarkers * nSamples);
  const allele2 = new Uint8Array(nMarkers * nSamples);
  calls.forEach((call, m) => {
    const pairs = [PAIR.RP, PAIR.DONOR, PAIR[call]];
    pairs.forEach(([a, b], col) => {
      allele1[m * nSamples + col] = a;
      allele2[m * nSamples + col] = b;
    });
  });
  const sample = (sampleId: string, role: 'recurrent_parent' | 'donor_parent' | 'candidate') => ({
    sampleId,
    lineName: sampleId,
    role,
    generation: '',
    familyId: '',
    notes: '',
  });
  return {
    markers: {
      ids: calls.map((_, m) => `m${m}`),
      chrom: calls.map(() => 'Gm01'),
      posBp: Float64Array.from(posBp),
      cm: Float64Array.from(cm),
      alleles: calls.map(() => ['A', 'B']),
    },
    genotypes: { nMarkers, nSamples, sampleIds, allele1, allele2 },
    samples: [
      sample('RP', 'recurrent_parent'),
      sample('DONOR', 'donor_parent'),
      sample('CAND0', 'candidate'),
    ],
    recurrentParentCol: 0,
    donorParentCol: 1,
    coded: false,
    chromosomeOrder: ['Gm01'],
    chromIndex: new Int32Array(nMarkers),
    sortedMarkerOrder: Int32Array.from({ length: nMarkers }, (_, i) => i),
    tokenProfile: 'default',
    crop: 'soybean',
  };
}

describe('computeRpp chromosome ends, end to end', () => {
  it('(g) cM 0.0 and 5.0, cap 10 cM: rppCm 0.5 (was 0.25); rppBp keeps the bp rule', () => {
    const dataset = oneChromDataset([500_000, 1_500_000], [0, 5], ['RP', 'DONOR']);
    const cls = classifyDataset(dataset);
    const params = { ...DEFAULT_RPP_PARAMS, maxMarkerCoverageCm: 10 };
    const [line] = computeRpp(dataset, cls, params);
    expect(line?.sampleId).toBe('CAND0');
    expect(line?.overall.nRpHom).toBe(1);
    expect(line?.overall.nDonorHom).toBe(1);
    // cM: weights 7.5 and 7.5.
    expect(line?.overall.rppCm).toBeCloseTo(0.5, 12);
    // bp, cap 1 Mb: first min(500 kb, 1 Mb) + 500 kb = 1 Mb; last 500 kb + 1 Mb = 1.5 Mb.
    // 1 / 2.5 = 0.4; the cM end rule applied to bp would give 0.5.
    expect(line?.overall.rppBp).toBeCloseTo(0.4, 12);
    expect(line?.byChromosome[0]?.rppCm).toBeCloseTo(0.5, 12);
    expect(line?.byChromosome[0]?.rppBp).toBeCloseTo(0.4, 12);
  });

  it('(h) a MISSING first marker drops out: the first called marker at 2 cM gets left 5 under cM, 2 under bp', () => {
    // cM [0, 2, 7] and bp [0, 2, 7] with both caps 10 (c/2 = 5); the marker at 0 is MISSING.
    const dataset = oneChromDataset([0, 2, 7], [0, 2, 7], ['MISSING', 'RP', 'DONOR']);
    const cls = classifyDataset(dataset);
    const [line] = computeRpp(dataset, cls, { maxMarkerCoverageBp: 10, maxMarkerCoverageCm: 10 });
    expect(line?.nMissing).toBe(1);
    expect(line?.overall.nCalled).toBe(2);
    // cM: RP at 2 weighs 5 + 2.5, DONOR at 7 weighs 2.5 + 5: 7.5 / 15.
    expect(line?.overall.rppCm).toBeCloseTo(0.5, 12);
    // bp: RP at 2 weighs 2 + 2.5, DONOR at 7 weighs 2.5 + 5: 4.5 / 12.
    expect(line?.overall.rppBp).toBeCloseTo(0.375, 12);
  });

  it('(i) HET at a terminal marker: cM 0.0 and 5.0, cap 10, weights 7.5 and 7.5, rppCm 0.75', () => {
    const dataset = oneChromDataset([500_000, 1_500_000], [0, 5], ['HET', 'RP']);
    const cls = classifyDataset(dataset);
    const [line] = computeRpp(dataset, cls, { ...DEFAULT_RPP_PARAMS, maxMarkerCoverageCm: 10 });
    expect(line?.overall.nHet).toBe(1);
    // (0.5 * 7.5 + 1 * 7.5) / 15.
    expect(line?.overall.rppCm).toBeCloseTo(0.75, 12);
  });
});
