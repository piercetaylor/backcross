/**
 * qc.csv (export/qc-csv.ts, docs/adr/0029): the documented header, one row per
 * manifest sample with the parents included and in manifest order, rates to
 * six decimals with NaN as NA, and qc_flags joined with `|` or empty.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { computeQc } from '../src/core/qc.ts';
import { computeRpp } from '../src/core/rpp.ts';
import type { LineQc, SampleRecord } from '../src/core/types.ts';
import { QC_CSV_HEADER, qcCsv } from '../src/export/qc-csv.ts';
import { loadDataset, loadExpected, readFixture, TEST_TOOL } from './helpers.ts';

const HEADER =
  'sample_id,call_set_db_id,sample_db_id,role,missing_rate,het_rate,nonparental_rate,qc_flags,token_profile,crop,tool,tool_version,tool_commit';

function line(over: Partial<LineQc>): LineQc {
  return {
    sampleId: 'L1',
    role: 'candidate',
    missingRate: 0,
    hetRate: 0,
    nonparentalRate: 0,
    flags: [],
    ...over,
  };
}

function sample(over: Partial<SampleRecord>): SampleRecord {
  return {
    sampleId: 'L1',
    lineName: '',
    role: 'candidate',
    generation: '',
    familyId: '',
    notes: '',
    ...over,
  };
}

const SAMPLES: SampleRecord[] = [sample({})];

describe('qcCsv on hand-built rows', () => {
  it('writes the documented header, token_profile and crop last', () => {
    const csv = qcCsv([], [], { tokenProfile: 'default', crop: 'soybean', ...TEST_TOOL });
    expect(csv).toBe(`${HEADER}\n`);
    expect(QC_CSV_HEADER.join(',')).toBe(
      HEADER.replace(',token_profile,crop,tool,tool_version,tool_commit', ''),
    );
  });

  it('joins several flags with | and writes an empty cell when there is none', () => {
    const csv = qcCsv(
      [
        line({ sampleId: 'L1', flags: ['high_missing', 'high_het', 'closer_to_donor'] }),
        line({ sampleId: 'L2', flags: [] }),
      ],
      SAMPLES,
      { tokenProfile: 'default', crop: 'soybean', ...TEST_TOOL },
    );
    const [, a, b] = csv.trimEnd().split('\n');
    expect(a).toBe(
      'L1,,,candidate,0.000000,0.000000,0.000000,high_missing|high_het|closer_to_donor,default,soybean,backcross,0.0.0-test,g0000000',
    );
    expect(b).toBe(
      'L2,,,candidate,0.000000,0.000000,0.000000,,default,soybean,backcross,0.0.0-test,g0000000',
    );
  });

  it('writes rates to six decimals and NaN as NA', () => {
    const csv = qcCsv(
      [
        line({
          sampleId: 'RP',
          role: 'recurrent_parent',
          missingRate: 1 / 3,
          hetRate: NaN,
          nonparentalRate: NaN,
        }),
      ],
      [],
      { tokenProfile: 'default', crop: 'soybean', ...TEST_TOOL },
    );
    expect(csv.trimEnd().split('\n')[1]).toBe(
      'RP,,,recurrent_parent,0.333333,NA,NA,,default,soybean,backcross,0.0.0-test,g0000000',
    );
  });

  it('writes the BrAPI ids after sample_id and quotes a sample id that needs it', () => {
    const samples = [sample({ sampleId: 'a,b', callSetDbId: 'cs1', sampleDbId: 'sm1' })];
    const csv = qcCsv([line({ sampleId: 'a,b' })], samples, {
      tokenProfile: 'tassel',
      ...TEST_TOOL,
    });
    const [header, row] = csv.trimEnd().split('\n');
    expect(header?.endsWith(',qc_flags,token_profile,tool,tool_version,tool_commit')).toBe(true);
    expect(row).toBe(
      '"a,b",cs1,sm1,candidate,0.000000,0.000000,0.000000,,tassel,backcross,0.0.0-test,g0000000',
    );
  });
});

describe('qcCsv on the synthetic fixture', () => {
  const expected = loadExpected();
  const dataset = loadDataset('genotypes.vcf', 'vcf');
  const cls = classifyDataset(dataset);
  const qc = computeQc(dataset, cls, computeRpp(dataset, cls, expected.params));
  const csv = qcCsv(qc.lines, dataset.samples, {
    tokenProfile: 'default',
    crop: 'soybean',
    ...TEST_TOOL,
  });
  const rows = csv.trimEnd().split('\n').slice(1);

  // Manifest order read straight from samples.csv, independently of the loader.
  const manifest = readFixture('samples.csv')
    .trimEnd()
    .split('\n')
    .slice(1)
    .map((r) => r.split(',').slice(0, 3));

  it('has one row per manifest sample, parents included, in manifest order', () => {
    expect(rows.map((r) => r.split(',')[0])).toEqual(manifest.map((m) => m[0]));
    expect(rows.map((r) => r.split(',')[3])).toEqual(manifest.map((m) => m[2]));
  });

  it('writes NA for a parent nonparental rate and the fixture flags', () => {
    const byId = new Map(rows.map((r) => [r.split(',')[0], r.split(',')] as const));
    expect(byId.get('RP_Williams')?.[6]).toBe('NA');
    expect(byId.get('NIL_03')?.[7]).toBe('nonparental_alleles');
    expect(byId.get('NIL_05')?.[7]).toBe('closer_to_donor');
    expect(byId.get('NIL_06')?.[7]).toBe('high_missing');
    expect(byId.get('NIL_01')?.[7]).toBe('');
    for (const cells of byId.values()) {
      for (const k of [4, 5, 6]) expect(cells[k]).toMatch(/^(NA|\d\.\d{6})$/);
    }
  });
});
