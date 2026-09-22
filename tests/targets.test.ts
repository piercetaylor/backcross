/** Target-locus check and spec parsing (algorithm 4): hand-built unit tests. */
import { describe, expect, it } from 'vitest';

import { buildChromosomeOrder } from '../src/core/chromosomes.ts';
import { checkTargets, parseTargetSpec } from '../src/core/targets.ts';
import { CallClass, MISSING_ALLELE } from '../src/core/types.ts';
import type {
  CallClassValue,
  Classification,
  Dataset,
  DonorSegment,
  TargetRegion,
} from '../src/core/types.ts';

interface MarkerSpec {
  chrom: string;
  pos: number;
  /** One class per candidate, in the order the returned candidateCols will use. */
  classes: CallClassValue[];
}

/** Builds a minimal Dataset + Classification for `nCandidates` from hand-picked per-marker classes. */
function build(entries: MarkerSpec[], nCandidates = 1): { dataset: Dataset; cls: Classification } {
  const nMarkers = entries.length;
  const ids = entries.map((_, i) => `m${i}`);
  const chrom = entries.map((e) => e.chrom);
  const posBp = Float64Array.from(entries.map((e) => e.pos));
  const alleles = entries.map(() => ['A', 'B']);
  const chromosomeOrder = buildChromosomeOrder(chrom);
  const chromIndex = Int32Array.from(chrom.map((c) => chromosomeOrder.indexOf(c)));
  const order = entries.map((_, i) => i);
  order.sort((a, b) => {
    const ca = chromIndex[a] as number;
    const cb = chromIndex[b] as number;
    if (ca !== cb) return ca - cb;
    return (posBp[a] as number) - (posBp[b] as number);
  });
  const sortedMarkerOrder = Int32Array.from(order);

  const candidateNames = Array.from({ length: nCandidates }, (_, i) => `CAND${i}`);
  const sampleIds = ['RP', 'DONOR', ...candidateNames];
  const nSamples = sampleIds.length;
  const allele1 = new Uint8Array(nMarkers * nSamples);
  const allele2 = new Uint8Array(nMarkers * nSamples);

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
      ...candidateNames.map((id) => ({
        sampleId: id,
        lineName: id,
        role: 'candidate' as const,
        generation: '',
        familyId: '',
        notes: '',
      })),
    ],
    recurrentParentCol: -1,
    donorParentCol: -1,
    coded: true,
    chromosomeOrder,
    chromIndex,
    sortedMarkerOrder,
    tokenProfile: 'default',
    crop: 'soybean',
  };

  const informative = new Uint8Array(nMarkers);
  const classes = new Uint8Array(nCandidates * nMarkers);
  for (let m = 0; m < nMarkers; m++) {
    const e = entries[m] as MarkerSpec;
    // A marker is informative unless every candidate's class there is
    // UNINFORMATIVE; the test data never mixes UNINFORMATIVE with a real call
    // at the same marker, matching classifyDataset's invariant.
    informative[m] = e.classes.every((k) => k === CallClass.UNINFORMATIVE) ? 0 : 1;
    for (let c = 0; c < nCandidates; c++) {
      classes[c * nMarkers + m] = e.classes[c] as CallClassValue;
    }
  }

  const cls: Classification = {
    candidateCols: Int32Array.from(candidateNames.map((_, i) => 2 + i)),
    classes,
    informative,
    rpAllele: new Uint8Array(nMarkers).fill(MISSING_ALLELE),
    donorAllele: new Uint8Array(nMarkers).fill(MISSING_ALLELE),
    nMarkers,
  };

  return { dataset, cls };
}

function region(name: string, chrom: string, startBp: number, endBp: number): TargetRegion {
  return { name, chrom, startBp, endBp };
}

function seg(
  over: Partial<DonorSegment> & Pick<DonorSegment, 'chrom' | 'startBp' | 'endBp'>,
): DonorSegment {
  return {
    sampleId: 'CAND0',
    leftFlankBp: NaN,
    rightFlankBp: NaN,
    nMarkers: 1,
    nDonorHom: 1,
    nHet: 0,
    class: 'donor',
    startCm: NaN,
    endCm: NaN,
    ...over,
  };
}

describe('checkTargets: status', () => {
  it('reports donor when every call in the region is DONOR_HOM', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.DONOR_HOM] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.DONOR_HOM] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('donor');
    expect(check?.nInformativeInRegion).toBe(2);
  });

  it('reports het when every call in the region is HET', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.HET] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.HET] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('het');
  });

  it('reports rp when every call in the region is RP_HOM', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.RP_HOM] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.RP_HOM] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('rp');
  });

  it('reports recombinant for a mixture of RP and DONOR calls', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.RP_HOM] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.DONOR_HOM] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('recombinant');
  });

  it('reports recombinant for donor+het with no RP call (line not fixed across the region)', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.DONOR_HOM] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.HET] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('recombinant');
  });

  it('reports no_data when the region markers are all MISSING, but still counts them as informative', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.MISSING] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.MISSING] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('no_data');
    expect(check?.nInformativeInRegion).toBeGreaterThan(0);
  });

  it('reports no_data with zero informative markers for a region on a chromosome with no markers', () => {
    const { dataset, cls } = build([{ chrom: 'Gm01', pos: 100, classes: [CallClass.DONOR_HOM] }]);
    const r = region('t', 'Gm02', 1, 1000);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('no_data');
    expect(check?.nInformativeInRegion).toBe(0);
  });

  it('reports no_data with zero informative markers when the only markers in the region are UNINFORMATIVE', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.UNINFORMATIVE] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.UNINFORMATIVE] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('no_data');
    expect(check?.nInformativeInRegion).toBe(0);
  });
});

describe('checkTargets: inclusive bounds', () => {
  it('counts markers exactly at startBp and endBp, and excludes markers outside the interval', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 50, classes: [CallClass.RP_HOM] }, // outside, excluded
      { chrom: 'Gm01', pos: 100, classes: [CallClass.DONOR_HOM] }, // == startBp
      { chrom: 'Gm01', pos: 200, classes: [CallClass.DONOR_HOM] }, // == endBp
      { chrom: 'Gm01', pos: 250, classes: [CallClass.RP_HOM] }, // outside, excluded
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.nInformativeInRegion).toBe(2);
    expect(check?.status).toBe('donor');
  });
});

describe('checkTargets: drag estimate', () => {
  it('computes dragMinBp and dragMaxBp from the overlapping segment and its flanks', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 10_000_000, 12_000_000);
    const s = seg({
      chrom: 'Gm01',
      startBp: 6_000_000,
      endBp: 16_000_000,
      leftFlankBp: 4_000_000,
      rightFlankBp: 18_000_000,
    });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    expect(check?.dragMinBp).toBe(8_000_000);
    expect(check?.dragMaxBp).toBe(12_000_000);
  });

  it('leaves dragMaxBp NaN when a flank is NaN, without disturbing dragMinBp', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 10_000_000, 12_000_000);
    const s = seg({
      chrom: 'Gm01',
      startBp: 6_000_000,
      endBp: 16_000_000,
      leftFlankBp: NaN,
      rightFlankBp: 18_000_000,
    });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    expect(check?.dragMinBp).toBe(8_000_000);
    expect(check?.dragMaxBp).toBeNaN();
  });

  it('clips dragMinBp at 0 when the segment is shorter than the region', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 10_000_000, 12_000_000);
    const s = seg({
      chrom: 'Gm01',
      startBp: 10_500_000,
      endBp: 11_500_000,
      leftFlankBp: 9_000_000,
      rightFlankBp: 13_000_000,
    });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    expect(check?.dragMinBp).toBe(0);
    expect(check?.dragMaxBp).toBe(2_000_000);
  });

  it('picks the segment with the largest overlap when more than one overlaps the region', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 10_000_000, 15_000_000);
    const small = seg({ chrom: 'Gm01', startBp: 9_000_000, endBp: 11_000_000 }); // 1 Mb overlap
    const big = seg({ chrom: 'Gm01', startBp: 12_000_000, endBp: 20_000_000 }); // 3 Mb overlap
    const [check] = checkTargets(dataset, cls, [[small, big]], [r]);
    expect(check?.segment).toBe(big);
  });

  it('reports segment null and both drags NaN when no segment overlaps, even though status is donor', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.DONOR_HOM] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.DONOR_HOM] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('donor');
    expect(check?.segment).toBeNull();
    expect(check?.dragMinBp).toBeNaN();
    expect(check?.dragMaxBp).toBeNaN();
  });
});

describe('checkTargets: output ordering', () => {
  it('emits candidate-major order and populates the region field', () => {
    const { dataset, cls } = build([], 2);
    const r1 = region('t1', 'Gm01', 1, 100);
    const r2 = region('t2', 'Gm02', 1, 100);
    const out = checkTargets(dataset, cls, [[], []], [r1, r2]);
    expect(out).toHaveLength(4);
    expect(out[0]?.sampleId).toBe('CAND0');
    expect(out[0]?.region).toBe(r1);
    expect(out[1]?.sampleId).toBe('CAND0');
    expect(out[1]?.region).toBe(r2);
    expect(out[2]?.sampleId).toBe('CAND1');
    expect(out[2]?.region).toBe(r1);
    expect(out[3]?.sampleId).toBe('CAND1');
    expect(out[3]?.region).toBe(r2);
  });
});

describe('parseTargetSpec', () => {
  const { dataset } = build([{ chrom: 'Gm07', pos: 12345, classes: [CallClass.RP_HOM] }]);

  it('parses CHROM:START-END with thousands separators', () => {
    const spec = 'Gm13:28,500,000-29,100,000';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('parses CHROM:START-END with Mb units, no space', () => {
    const spec = 'Gm13:28.5Mb-29.1Mb';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('parses CHROM:START-END with Mb units and internal spacing, normalizing "chr13"', () => {
    const spec = 'chr13:28.5 Mb - 29.1 Mb';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('parses ".." as a range separator and a bare number chromosome', () => {
    const spec = '13:28500000..29100000';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('parses an en dash range separator', () => {
    const spec = 'Gm13:28500000–29100000';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('splits off a "name=" prefix, trimming spaces around "="', () => {
    const spec = ' rhg1 = Gm18:1.6Mb-1.7Mb ';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: 'rhg1',
      chrom: 'Gm18',
      startBp: 1_600_000,
      endBp: 1_700_000,
    });
  });

  it('parses CHROM:POS as a single-point region', () => {
    const spec = 'Gm07:7,000,000';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm07',
      startBp: 7_000_000,
      endBp: 7_000_000,
    });
  });

  it('parses kb units', () => {
    const spec = 'Gm05:1kb-2kb';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm05',
      startBp: 1_000,
      endBp: 2_000,
    });
  });

  it('swaps a reversed range instead of rejecting it', () => {
    const spec = 'Gm13:29,100,000-28,500,000';
    expect(parseTargetSpec(spec, dataset)).toEqual({
      name: spec,
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('resolves a marker_id to its chrom/pos with startBp === endBp, name defaulting to the id', () => {
    const result = parseTargetSpec('m0', dataset);
    expect(result).toEqual({ name: 'm0', chrom: 'Gm07', startBp: 12345, endBp: 12345 });
    expect(result.startBp).toBe(result.endBp);
  });

  it('throws, quoting the input, when nothing matches', () => {
    expect(() => parseTargetSpec('totally_unknown_xyz', dataset)).toThrow(/"totally_unknown_xyz"/);
  });

  it('rejects a decimal value with no unit instead of guessing', () => {
    expect(() => parseTargetSpec('Gm13:28.5-29.1', dataset)).toThrow(/unit/);
  });
});

describe('checkTargets: edge cases from review', () => {
  it('review 11: a region with one DONOR_HOM and one MISSING call is donor, counting both as informative', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 100, classes: [CallClass.DONOR_HOM] },
      { chrom: 'Gm01', pos: 200, classes: [CallClass.MISSING] },
    ]);
    const r = region('t', 'Gm01', 100, 200);
    const [check] = checkTargets(dataset, cls, [[]], [r]);
    expect(check?.status).toBe('donor');
    expect(check?.nInformativeInRegion).toBe(2);
  });

  it('review 12: a region wider than the segment and its flanks reports recombinant with non-negative drags, and NaN dragMax when a flank is NaN', () => {
    const { dataset, cls } = build([
      { chrom: 'Gm01', pos: 9_000_000, classes: [CallClass.RP_HOM] },
      { chrom: 'Gm01', pos: 10_000_000, classes: [CallClass.DONOR_HOM] },
      { chrom: 'Gm01', pos: 12_000_000, classes: [CallClass.DONOR_HOM] },
      { chrom: 'Gm01', pos: 13_000_000, classes: [CallClass.RP_HOM] },
      { chrom: 'Gm01', pos: 20_000_000, classes: [CallClass.RP_HOM] },
      { chrom: 'Gm01', pos: 30_000_000, classes: [CallClass.RP_HOM] },
    ]);
    const r = region('t', 'Gm01', 1_000_000, 30_000_000);
    const s = seg({
      chrom: 'Gm01',
      startBp: 10_000_000,
      endBp: 12_000_000,
      leftFlankBp: 9_000_000,
      rightFlankBp: 13_000_000,
    });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    // The region (1-30 Mb) contains both R and D calls, so it is recombinant
    // even though the overlapping segment sits entirely inside it.
    expect(check?.status).toBe('recombinant');
    expect(check?.dragMinBp).toBe(0);
    expect(check?.dragMaxBp).toBe(0);

    const sNaNFlank = seg({ ...s, leftFlankBp: NaN });
    const [check2] = checkTargets(dataset, cls, [[sNaNFlank]], [r]);
    expect(check2?.dragMinBp).toBe(0);
    expect(check2?.dragMaxBp).toBeNaN();
  });

  it('review 13: a region partly overlapping a segment drags only on the overlapping side', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 15_000_000, 30_000_000);
    const s = seg({
      chrom: 'Gm01',
      startBp: 10_000_000,
      endBp: 20_000_000,
      leftFlankBp: 8_000_000,
      rightFlankBp: 22_000_000,
    });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    expect(check?.dragMinBp).toBe(5_000_000);
    expect(check?.dragMaxBp).toBe(7_000_000);
  });

  it('review 14: a point region inside a segment drags on both sides', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 15_000_000, 15_000_000);
    const s = seg({
      chrom: 'Gm01',
      startBp: 10_000_000,
      endBp: 20_000_000,
      leftFlankBp: 8_000_000,
      rightFlankBp: 22_000_000,
    });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    expect(check?.dragMinBp).toBe(10_000_000);
    expect(check?.dragMaxBp).toBe(14_000_000);
  });

  it('review 15: a segment on another chromosome is ignored even when its bp range overlaps the region', () => {
    const { dataset, cls } = build([]);
    const r = region('t', 'Gm01', 10_000_000, 20_000_000);
    const s = seg({ chrom: 'Gm02', startBp: 10_000_000, endBp: 20_000_000 });
    const [check] = checkTargets(dataset, cls, [[s]], [r]);
    expect(check?.segment).toBeNull();
    expect(check?.dragMinBp).toBeNaN();
    expect(check?.dragMaxBp).toBeNaN();
  });
});

describe('parseTargetSpec: edge cases from review', () => {
  const { dataset } = build([{ chrom: 'Gm07', pos: 12345, classes: [CallClass.RP_HOM] }]);

  it('review 16: Gm13:28.5Mb-29.1 throws, because unit inheritance only runs start<-end, never end<-start', () => {
    const spec = 'Gm13:28.5Mb-29.1';
    // Per the header comment, a unit on the END token applies to a unit-less
    // START token, not the reverse. Here the start already has its own unit
    // (Mb), so no inheritance happens for the end, and the end's bare ".1"
    // decimal is rejected rather than guessed. Verified against the code: it
    // throws, matching the same "needs an explicit unit" rule as the plain
    // "Gm13:28.5-29.1" case above.
    expect(() => parseTargetSpec(spec, dataset)).toThrow(/unit/);
    expect(() => parseTargetSpec(spec, dataset)).toThrow(/Gm13:28\.5Mb-29\.1/);
  });

  it('review 17: malformed specs throw, quoting the original input verbatim', () => {
    const inputs = ['', 'Gm13:', ':1-2', 'Gm13:1-2-3', 'name=', 'Gm13:28.5-29.1'];
    for (const input of inputs) {
      let thrown: unknown;
      try {
        parseTargetSpec(input, dataset);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(`"${input}"`);
    }
  });

  it('review 18: unusual inputs parse instead of rejecting — documenting current behaviour, not endorsing it', () => {
    // "=Gm13:1-2": "=" sits at index 0, so namePart is empty and the
    // name/locus split is skipped entirely (the whole trimmed string serves
    // as both). The leading "=" then survives into the locus text, and since
    // "=Gm13" does not match any chromosome spelling normalizeChromosome
    // knows, it comes back unchanged.
    expect(parseTargetSpec('=Gm13:1-2', dataset)).toEqual({
      name: '=Gm13:1-2',
      chrom: '=Gm13',
      startBp: 1,
      endBp: 2,
    });
    // "mytarget:1": any text before ":" is accepted as a chromosome name,
    // whether or not it exists in the dataset — a region on it simply yields
    // no_data downstream rather than being rejected here.
    const result = parseTargetSpec('mytarget:1', dataset);
    expect(result.chrom).toBe('mytarget');
    expect(result.startBp).toBe(1);
  });

  it('review 19: a scaffold-named chromosome (not Gm01..Gm20) is a valid CHROM:START-END target', () => {
    const { dataset: scaffoldDs, cls: scaffoldCls } = build([
      { chrom: 'scaffold_12', pos: 1_500_000, classes: [CallClass.DONOR_HOM] },
    ]);
    const r = parseTargetSpec('scaffold_12:1-2Mb', scaffoldDs);
    expect(r.chrom).toBe('scaffold_12');
    const [check] = checkTargets(scaffoldDs, scaffoldCls, [[]], [r]);
    expect(check?.status).not.toBe('no_data');
  });
});
