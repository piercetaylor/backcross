/**
 * The shared row model, on the synthetic fixture.
 *
 * buildLineRows only assembles results the core has already computed, so
 * what this pins is the assembly: rows in the worker's candidate order,
 * every field taken from the right result, and the target column indexed by
 * the region's position rather than its name. The numbers themselves are
 * checked against expected.json, which scripts/make-fixture.mjs derives
 * independently.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { computeQc } from '../src/core/qc.ts';
import { computeRpp } from '../src/core/rpp.ts';
import { callSegments } from '../src/core/segments.ts';
import { checkTargets, parseTargetSpec } from '../src/core/targets.ts';
import { buildLineRows } from '../src/ui/lines/line-rows.ts';
import type { LineRow } from '../src/ui/lines/line-rows.ts';
import { loadDataset, loadExpected } from './helpers.ts';

const expected = loadExpected();
const CANDIDATES = Object.keys(expected.lines);

describe('buildLineRows on the VCF fixture', () => {
  const dataset = loadDataset('genotypes.vcf', 'vcf');
  const cls = classifyDataset(dataset);
  const rpp = computeRpp(dataset, cls, expected.params);
  const qc = computeQc(dataset, cls, rpp);
  const segmentsByCandidate = CANDIDATES.map((_, c) =>
    callSegments(dataset, cls, c, expected.segmentParams),
  );
  // Two regions, so a target column can be shown to be indexed by position:
  // index 0 is the planted Gm13 donor core, index 1 the planted Gm02 het.
  const regions = [
    parseTargetSpec('gm13core=Gm13:21,000,000-25,000,000', dataset),
    parseTargetSpec('gm02het=chr2:7Mb-9Mb', dataset),
  ];
  const checks = checkTargets(dataset, cls, segmentsByCandidate, regions);

  const rows = buildLineRows({
    rpp,
    samples: dataset.samples,
    segmentsByCandidate,
    targets: { regions, checks },
    qc,
  });
  const find = (id: string) => rows.find((r) => r.sampleId === id) as LineRow;

  it('emits one row per candidate, in the worker candidate order', () => {
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.sampleId)).toEqual(CANDIDATES);
  });

  it('takes the sample fields from samples.csv', () => {
    expect(find('NIL_01')).toMatchObject({
      lineName: 'NIL-01',
      generation: 'BC5F3',
      familyId: 'FAM1',
    });
  });

  it('reports the RPP of expected.json', () => {
    expect(find('NIL_01').rppCount).toBeCloseTo(expected.lines.NIL_01?.rppCount as number, 12);
  });

  it('flags the sample-swap line as closer to the donor', () => {
    expect(find('NIL_05').flags).toContain('closer_to_donor');
    expect(find('NIL_01').flags).toEqual([]);
  });

  it('reports the largest segment in Mb, and NaN for a line with no segment', () => {
    // NIL_01 carries the one planted Gm13 donor run, 21-27 Mb.
    expect(find('NIL_01').nSegments).toBe(1);
    expect(find('NIL_01').largestSegmentMb).toBe(6);
    expect(find('NIL_03').nSegments).toBe(0);
    expect(Number.isNaN(find('NIL_03').largestSegmentMb)).toBe(true);
  });

  it('indexes target status by the region position, not by name', () => {
    expect(find('NIL_01').targetStatus).toEqual(['donor', 'rp']);
    expect(find('NIL_02').targetStatus).toEqual(['donor', 'het']);
    expect(find('NIL_03').targetStatus[0]).toBe('rp');
  });

  it('leaves the target column empty and the flags empty when nothing was checked', () => {
    const bare = buildLineRows({
      rpp,
      samples: dataset.samples,
      segmentsByCandidate: null,
      targets: null,
      qc: null,
    });
    expect(bare).toHaveLength(6);
    expect(bare[0]?.targetStatus).toEqual([]);
    expect(bare[0]?.flags).toEqual([]);
    expect(bare[0]?.nSegments).toBe(0);
    expect(Number.isNaN(bare[0]?.largestSegmentMb as number)).toBe(true);
  });
});
