/**
 * The CLI's `targets` subcommand, run as a child process on the synthetic
 * fixture: a target on a chromosome the dataset lacks is warned about on
 * stderr and still written, every row no_data, with exit code 0, so one
 * target list can be run over several datasets (docs/data-formats.md).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FIXTURE_DIR } from './helpers.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');

function runTargets(targets: string[], crop?: string) {
  const args = [
    CLI,
    'targets',
    '--genotypes',
    join(FIXTURE_DIR, 'genotypes.vcf'),
    '--samples',
    join(FIXTURE_DIR, 'samples.csv'),
    ...(crop === undefined ? [] : ['--crop', crop]),
    ...targets.flatMap((t) => ['--target', t]),
  ];
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

/** The status column of every CSV row for one target name. */
function statuses(csv: string, target: string): string[] {
  const [header, ...rows] = csv.trim().split('\n');
  const cols = (header as string).split(',');
  const targetCol = cols.indexOf('target');
  const statusCol = cols.indexOf('status');
  return rows
    .map((r) => r.split(','))
    .filter((cells) => cells[targetCol] === target)
    .map((cells) => cells[statusCol] as string);
}

describe('cli targets', () => {
  it('warns on stderr about a target on a missing chromosome and still writes its no_data rows', () => {
    const res = runTargets(['ok=Gm13:28.5-29.1Mb', 'typo=chr99:1-2Mb']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain(
      'warning: target "typo": no chromosome "chr99" in this dataset (Gm01, Gm02, Gm03, ...); its rows report no_data',
    );
    expect(res.stderr).not.toContain('target "ok"');
    const typo = statuses(res.stdout, 'typo');
    expect(typo.length).toBe(6);
    expect(new Set(typo)).toEqual(new Set(['no_data']));
    expect(statuses(res.stdout, 'ok').length).toBe(6);
  });

  it('warns under pea about chr13, which pea keeps as written, while soybean reads it as Gm13', () => {
    const pea = runTargets(['t=chr13:28.5-29.1Mb'], 'pea');
    expect(pea.status).toBe(0);
    expect(pea.stderr).toContain(
      'warning: target "t": no chromosome "chr13" in this dataset (Gm01, Gm02, Gm03, ...); its rows report no_data',
    );
    expect(new Set(statuses(pea.stdout, 't'))).toEqual(new Set(['no_data']));

    const soybean = runTargets(['t=chr13:28.5-29.1Mb']);
    expect(soybean.status).toBe(0);
    expect(soybean.stderr).not.toContain('warning: target');
  });

  it('warns about nothing when every target is on a loaded chromosome', () => {
    const res = runTargets(['ok=Gm13:28.5-29.1Mb']);
    expect(res.status).toBe(0);
    // Only the CLI's own line: Node may print warnings of its own to stderr.
    expect(res.stderr).not.toContain('warning: target');
  });
});
