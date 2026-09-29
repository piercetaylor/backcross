/**
 * The CLI's `qc` subcommand, run as a child process on the synthetic fixture
 * (modelled on tests/cli-compare.test.ts): it writes qc.csv with one row per
 * manifest sample, parents included, and rejects every subcommand option,
 * since it takes none of its own.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { provenanceHeader } from '../src/export/provenance.ts';
import { QC_CSV_HEADER } from '../src/export/qc-csv.ts';
import { FIXTURE_DIR, TEST_TOOL } from './helpers.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');

const PKG_VERSION = (
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

function runQc(extra: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      CLI,
      'qc',
      '--genotypes',
      join(FIXTURE_DIR, 'genotypes.vcf'),
      '--samples',
      join(FIXTURE_DIR, 'samples.csv'),
      ...extra,
    ],
    { encoding: 'utf8' },
  );
}

describe('cli qc', () => {
  it('writes the documented header and one row per manifest sample, parents first', () => {
    const res = runQc();
    expect(res.status).toBe(0);
    const [header, ...rows] = res.stdout.trim().split('\n');
    expect(header).toBe(
      [
        ...QC_CSV_HEADER,
        ...provenanceHeader({ tokenProfile: 'default', crop: 'soybean', ...TEST_TOOL }),
      ].join(','),
    );
    expect(rows.map((r) => r.split(',')[0])).toEqual([
      'RP_Williams',
      'DONOR_PI',
      'NIL_01',
      'NIL_02',
      'NIL_03',
      'NIL_04',
      'NIL_05',
      'NIL_06',
    ]);
    const nil06 = rows.find((r) => r.startsWith('NIL_06,'))?.split(',');
    expect(nil06?.[7]).toBe('high_missing');
    const [tool, toolVersion, toolCommit] = nil06?.slice(-3) ?? [];
    expect(tool).toBe('backcross');
    expect(toolVersion).toBe(PKG_VERSION);
    expect(toolCommit).toMatch(/^(g[0-9a-f]{7}(-dirty)?|NA)$/);
  });

  it('exits 2 when a foreign option is given', () => {
    const res = runQc(['--max-marker-coverage-bp', '1']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('qc: option(s) not accepted here: --max-marker-coverage-bp');
  });
});
