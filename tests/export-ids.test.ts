/**
 * The BrAPI call-set id columns in every export (docs/m3-phase4-brapi.md
 * section 9.3; docs/data-formats.md "Outputs"), and the call-set table CSV.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { compareLines } from '../src/core/compare.ts';
import { computeRpp } from '../src/core/rpp.ts';
import { callSegments, segmentGapCriterion } from '../src/core/segments.ts';
import { checkTargets, parseTargetSpec } from '../src/core/targets.ts';
import type { SampleRecord } from '../src/core/types.ts';
import { callSetsCsv } from '../src/export/callsets-csv.ts';
import type { ExportProvenance } from '../src/export/provenance.ts';
import { discordantMarkersCsv, pairwiseCsv } from '../src/export/pairwise-csv.ts';
import { segmentsCsv } from '../src/export/segments-csv.ts';
import { lineSummaryCsv } from '../src/export/summary-csv.ts';
import { targetsCsv } from '../src/export/targets-csv.ts';
import { loadDataset, loadExpected } from './helpers.ts';

const expected = loadExpected();
const CANDIDATES = Object.keys(expected.lines);
const dataset = loadDataset('genotypes.vcf', 'vcf');
const cls = classifyDataset(dataset);
const rpp = computeRpp(dataset, cls, expected.params);
const segments = CANDIDATES.map((_, c) => callSegments(dataset, cls, c, expected.segmentParams));
const criterion = segmentGapCriterion(dataset);
const checks = checkTargets(dataset, cls, segments, [
  parseTargetSpec('gm13core=Gm13:21,000,000-25,000,000', dataset),
]);
const diff = compareLines(dataset, cls, 'NIL_01', 'NIL_02', 'informative');

const withIds: SampleRecord[] = dataset.samples.map((s, i) => ({
  ...s,
  callSetDbId: `cs${i}`,
  sampleDbId: `smp${i}`,
}));
const plain = dataset.samples;
const DEFAULT_PROVENANCE: ExportProvenance = { tokenProfile: 'default' };

const header = (csv: string): string => csv.split('\n')[0] as string;
const rowFor = (csv: string, prefix: string): string | undefined =>
  csv.split('\n').find((l) => l.startsWith(prefix));

function allCsvs(samples: SampleRecord[], provenance: ExportProvenance = DEFAULT_PROVENANCE) {
  return {
    summary: lineSummaryCsv(rpp, dataset.chromosomeOrder, samples, provenance),
    segments: segmentsCsv(segments.flat(), criterion, samples, provenance),
    targets: targetsCsv(checks, samples, provenance),
    pairwise: pairwiseCsv([diff], dataset.chromosomeOrder, samples, provenance),
    discordant: discordantMarkersCsv([diff], { ...dataset, samples }, cls, provenance),
  };
}

describe('external id columns', () => {
  it('every CSV header is the documented one', () => {
    const csv = allCsvs(plain);
    expect(
      header(csv.summary).startsWith('sample_id,call_set_db_id,sample_db_id,n_informative,'),
    ).toBe(true);
    expect(header(csv.summary).endsWith('rpp_count_Gm20,token_profile')).toBe(true);
    expect(header(csv.segments)).toBe(
      'sample_id,call_set_db_id,sample_db_id,chrom,start_bp,end_bp,left_flank_bp,right_flank_bp,n_markers,n_donor_hom,n_het,class,start_cm,end_cm,length_bp,length_cm,gap_criterion,token_profile',
    );
    expect(header(csv.targets)).toBe(
      'sample_id,call_set_db_id,sample_db_id,target,chrom,start_bp,end_bp,status,n_informative_in_region,segment_start_bp,segment_end_bp,drag_min_bp,drag_max_bp,token_profile',
    );
    expect(header(csv.pairwise)).toBe(
      'sample_a,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,mode,chrom,n_compared,n_discordant,token_profile',
    );
    expect(header(csv.discordant)).toBe(
      'sample_a,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,marker_id,chrom,pos_bp,class_a,class_b,token_profile',
    );
  });

  it('writes the ids after the sample id column(s)', () => {
    const csv = allCsvs(withIds);
    expect(rowFor(csv.summary, 'NIL_01,')?.startsWith('NIL_01,cs2,smp2,')).toBe(true);
    expect(rowFor(csv.segments, 'NIL_01,')?.startsWith('NIL_01,cs2,smp2,')).toBe(true);
    expect(rowFor(csv.targets, 'NIL_01,')?.startsWith('NIL_01,cs2,smp2,')).toBe(true);
    expect(
      rowFor(csv.pairwise, 'NIL_01,')?.startsWith('NIL_01,NIL_02,cs2,smp2,cs3,smp3,informative,'),
    ).toBe(true);
    const discordantRow = rowFor(csv.discordant, 'NIL_01,');
    expect(discordantRow?.startsWith('NIL_01,NIL_02,cs2,smp2,cs3,smp3,syn_')).toBe(true);
  });

  it('writes empty cells for a file-loaded dataset', () => {
    const csv = allCsvs(plain);
    expect(rowFor(csv.summary, 'NIL_01,')?.startsWith('NIL_01,,,')).toBe(true);
    expect(rowFor(csv.segments, 'NIL_01,')?.startsWith('NIL_01,,,')).toBe(true);
    expect(rowFor(csv.targets, 'NIL_01,')?.startsWith('NIL_01,,,')).toBe(true);
    expect(rowFor(csv.pairwise, 'NIL_01,')?.startsWith('NIL_01,NIL_02,,,,,informative,')).toBe(
      true,
    );
    expect(rowFor(csv.discordant, 'NIL_01,')?.startsWith('NIL_01,NIL_02,,,,,syn_')).toBe(true);
  });

  it('quotes ids that need it', () => {
    const quoted = withIds.map((s) => (s.sampleId === 'NIL_01' ? { ...s, callSetDbId: 'a,b' } : s));
    const csv = lineSummaryCsv(rpp, dataset.chromosomeOrder, quoted, DEFAULT_PROVENANCE);
    expect(rowFor(csv, 'NIL_01,')?.startsWith('NIL_01,"a,b",smp2,')).toBe(true);
  });
});

describe('token_profile column', () => {
  it('ends every CSV header with token_profile and every row with the given profile', () => {
    const csv = allCsvs(plain, { tokenProfile: 'custom:mylab' });
    for (const [name, text] of Object.entries(csv)) {
      const lines = text.trimEnd().split('\n');
      expect(lines[0]?.endsWith(',token_profile'), name).toBe(true);
      expect(lines.length, name).toBeGreaterThan(1);
      for (const row of lines.slice(1)) expect(row.endsWith(',custom:mylab'), name).toBe(true);
    }
  });
});

describe('callSetsCsv', () => {
  it('callSetsCsv', () => {
    const csv = callSetsCsv([
      { sampleId: 'P1', callSetName: 'P1', callSetDbId: 'cs1', sampleDbId: 's1' },
      { sampleId: 'cs2', callSetName: '', callSetDbId: 'cs2', sampleDbId: '' },
      { sampleId: 'x,y', callSetName: 'x,y', callSetDbId: 'cs3', sampleDbId: 's3' },
    ]);
    expect(csv).toBe(
      'sample_id,call_set_name,call_set_db_id,sample_db_id\nP1,P1,cs1,s1\ncs2,,cs2,\n"x,y","x,y",cs3,s3\n',
    );
    expect(csv.endsWith('\n')).toBe(true);
  });
});
