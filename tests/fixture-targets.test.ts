/**
 * Target-region checks on the synthetic fixture: status, drag bounds and the
 * CSV columns, against the planted design in samples.csv.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { callSegments } from '../src/core/segments.ts';
import { checkTargets, parseTargetSpec } from '../src/core/targets.ts';
import type { TargetCheck } from '../src/core/types.ts';
import { targetsCsv } from '../src/export/targets-csv.ts';
import { loadDataset, loadExpected } from './helpers.ts';

const expected = loadExpected();
const CANDIDATES = Object.keys(expected.lines);

describe('checkTargets on the VCF fixture', () => {
  const dataset = loadDataset('genotypes.vcf', 'vcf');
  const cls = classifyDataset(dataset);
  const segments = CANDIDATES.map((_, c) => callSegments(dataset, cls, c, expected.segmentParams));
  const regions = [
    parseTargetSpec('gm13core=Gm13:21,000,000-25,000,000', dataset), // inside NIL_01/02/04 donor runs
    parseTargetSpec('gm02het=chr2:7Mb-9Mb', dataset), // NIL_02 het segment, markers 4-5
    parseTargetSpec('syn_Gm18_20', dataset), // NIL_03 isolated donor call
    parseTargetSpec('empty=Gm20:990,000,000-999,000,000', dataset), // beyond the last marker
  ];
  const checks = checkTargets(dataset, cls, segments, regions);
  const find = (id: string, target: string) =>
    checks.find((t) => t.sampleId === id && t.target === target) as TargetCheck;

  it('emits candidate-major rows with the region attached', () => {
    expect(checks).toHaveLength(CANDIDATES.length * regions.length);
    expect(checks.slice(0, 4).map((t) => t.sampleId)).toEqual(Array(4).fill('NIL_01'));
    expect(checks.map((t) => t.target).slice(0, 4)).toEqual([
      'gm13core',
      'gm02het',
      'syn_Gm18_20',
      'empty',
    ]);
    expect(find('NIL_02', 'gm02het').region).toEqual({
      name: 'gm02het',
      chrom: 'Gm02',
      startBp: 7_000_000,
      endBp: 9_000_000,
    });
  });

  it('reports donor status and drag bounds inside a planted donor segment', () => {
    // NIL_01 carries donor calls at Gm13 markers 11-14 (21-27 Mb); the run is
    // flanked by RP calls at 17 Mb and 29 Mb. The region covers 21-25 Mb.
    const t = find('NIL_01', 'gm13core');
    expect(t.status).toBe('donor');
    expect(t.nInformativeInRegion).toBe(3);
    expect(t.segment).toMatchObject({ startBp: 21_000_000, endBp: 27_000_000 });
    expect(t.dragMinBp).toBe(6_000_000 - 4_000_000);
    expect(t.dragMaxBp).toBe(12_000_000 - 4_000_000);
    // NIL_04's run spans 17-29 Mb with flanks at 15 and 31 Mb.
    const t4 = find('NIL_04', 'gm13core');
    expect(t4.status).toBe('donor');
    expect(t4.dragMinBp).toBe(12_000_000 - 4_000_000);
    expect(t4.dragMaxBp).toBe(16_000_000 - 4_000_000);
  });

  it('reports rp with no segment where a line is recurrent parent', () => {
    const t = find('NIL_03', 'gm13core');
    expect(t.status).toBe('rp');
    expect(t.segment).toBeNull();
    expect(Number.isNaN(t.dragMinBp)).toBe(true);
    expect(Number.isNaN(t.dragMaxBp)).toBe(true);
  });

  it('reports het across the planted heterozygous segment', () => {
    expect(find('NIL_02', 'gm02het').status).toBe('het');
    expect(find('NIL_02', 'gm02het').segment?.class).toBe('het');
    expect(find('NIL_01', 'gm02het').status).toBe('rp');
  });

  it('reports a single-marker donor status without a segment when the run was too short', () => {
    const t = find('NIL_03', 'syn_Gm18_20');
    expect(t.region).toMatchObject({ chrom: 'Gm18', startBp: 39_000_000, endBp: 39_000_000 });
    expect(t.nInformativeInRegion).toBe(1);
    expect(t.status).toBe('donor');
    expect(t.segment).toBeNull();
    expect(Number.isNaN(t.dragMaxBp)).toBe(true);
  });

  it('reports donor everywhere for the sample-swap line', () => {
    expect(find('NIL_05', 'gm13core').status).toBe('donor');
    expect(find('NIL_05', 'gm02het').status).toBe('donor');
  });

  it('reports no_data for a region beyond the last marker', () => {
    for (const id of CANDIDATES) {
      const t = find(id, 'empty');
      expect(t.status).toBe('no_data');
      expect(t.nInformativeInRegion).toBe(0);
      expect(t.segment).toBeNull();
    }
  });

  it('writes the target check CSV with the documented columns', () => {
    const csv = targetsCsv(checks);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'sample_id,target,chrom,start_bp,end_bp,status,n_informative_in_region,segment_start_bp,segment_end_bp,drag_min_bp,drag_max_bp',
    );
    expect(lines).toHaveLength(checks.length + 1);
    expect(lines[1]).toBe(
      'NIL_01,gm13core,Gm13,21000000,25000000,donor,3,21000000,27000000,2000000,8000000',
    );
    const rp = lines.find((l) => l.startsWith('NIL_03,gm13core,'));
    expect(rp).toBe('NIL_03,gm13core,Gm13,21000000,25000000,rp,3,NA,NA,NA,NA');
  });
});
