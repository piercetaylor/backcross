/**
 * The CLI's `compare` and `discordant` subcommands, run as child processes on
 * the synthetic fixture (modelled on tests/cli-targets.test.ts): NIL_03
 * against the recurrent parent has 459 markers compared and 1 discordant
 * (PLAN.md's M2 run), an invalid `--mode` or a foreign option exits 2 with
 * USAGE, and mode `all` surfaces the planted nonparental call on Gm07 as a
 * discordant marker whose class_a reads nonparental.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PAIRWISE_CSV_HEADER } from '../src/export/pairwise-csv.ts';
import { provenanceHeader } from '../src/export/provenance.ts';
import { FIXTURE_DIR } from './helpers.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function runPair(command: 'compare' | 'discordant', a: string, b: string, extra: string[] = []) {
  return runCli([
    command,
    '--genotypes',
    join(FIXTURE_DIR, 'genotypes.vcf'),
    '--samples',
    join(FIXTURE_DIR, 'samples.csv'),
    '--a',
    a,
    '--b',
    b,
    ...extra,
  ]);
}

describe('cli compare', () => {
  it('writes the contracted pairwise header', () => {
    const res = runPair('compare', 'NIL_03', 'RP_Williams');
    expect(res.status).toBe(0);
    const [header] = res.stdout.trim().split('\n');
    expect(header).toBe(
      [
        ...PAIRWISE_CSV_HEADER,
        ...provenanceHeader({ tokenProfile: 'default', crop: 'soybean' }),
      ].join(','),
    );
  });

  it('reports 459 compared and 1 discordant for NIL_03 against the recurrent parent (PLAN.md)', () => {
    const res = runPair('compare', 'NIL_03', 'RP_Williams');
    expect(res.status).toBe(0);
    const rows = res.stdout.trim().split('\n').slice(1);
    const cols = (res.stdout.trim().split('\n')[0] as string).split(',');
    const chromCol = cols.indexOf('chrom');
    const nComparedCol = cols.indexOf('n_compared');
    const nDiscordantCol = cols.indexOf('n_discordant');
    const all = rows.map((r) => r.split(',')).find((cells) => cells[chromCol] === 'ALL');
    expect(all).toBeDefined();
    expect(Number(all?.[nComparedCol])).toBe(459);
    expect(Number(all?.[nDiscordantCol])).toBe(1);
  });

  it('exits 2 on an unknown --mode', () => {
    const res = runPair('compare', 'NIL_03', 'RP_Williams', ['--mode', 'bogus']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--mode must be "informative" or "all"');
  });

  it('exits 2 when a foreign option is given', () => {
    const res = runPair('compare', 'NIL_03', 'RP_Williams', ['--max-marker-coverage-bp', '1']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('option(s) not accepted here: --max-marker-coverage-bp');
  });

  it('exits 2 when --a or --b is missing', () => {
    const res = runCli([
      'compare',
      '--genotypes',
      join(FIXTURE_DIR, 'genotypes.vcf'),
      '--samples',
      join(FIXTURE_DIR, 'samples.csv'),
      '--a',
      'NIL_03',
    ]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--a and --b are both required');
  });
});

describe('cli discordant', () => {
  it('writes the discordant-marker header and rows for NIL_03 against the recurrent parent', () => {
    const res = runPair('discordant', 'NIL_03', 'RP_Williams');
    expect(res.status).toBe(0);
    const lines = res.stdout.trim().split('\n');
    expect(lines).toHaveLength(2); // header + the one discordant marker in mode informative
  });

  it('surfaces the planted nonparental call on Gm07 as a discordant marker under mode all', () => {
    const res = runPair('discordant', 'NIL_03', 'RP_Williams', ['--mode', 'all']);
    expect(res.status).toBe(0);
    const [header, ...rows] = res.stdout.trim().split('\n');
    const cols = (header as string).split(',');
    const classACol = cols.indexOf('class_a');
    const nonparentalRows = rows.filter((r) => r.split(',')[classACol] === 'nonparental');
    expect(nonparentalRows).toHaveLength(1);
  });

  it('exits 2 on an unknown --mode', () => {
    const res = runPair('discordant', 'NIL_03', 'RP_Williams', ['--mode', 'bogus']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--mode must be "informative" or "all"');
  });
});
