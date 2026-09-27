/**
 * The CLI reads samples.csv, markers.csv and a custom token profile as bytes
 * and decodes them strictly (contract 1.11.0, docs/adr/0026), run as child
 * processes on the synthetic fixture (modelled on tests/cli-compare.test.ts).
 * Each input carries the Latin-1 byte 0xE9 in one place and `summarize` must
 * exit 1 naming the file, the line and the byte position, so a revert to
 * `readFileSync(path, 'utf8')`, which replaces the byte, fails here.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { FIXTURE_DIR } from './helpers.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');
const DIR = mkdtempSync(join(tmpdir(), 'backcross-cli-utf8-'));

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

/** `text` as UTF-8 with its one `{BAD}` replaced by 0xE9, written to DIR/name. */
function writeWithE9(name: string, text: string): string {
  const [before, after] = text.split('{BAD}') as [string, string];
  const path = join(DIR, name);
  writeFileSync(
    path,
    Buffer.concat([Buffer.from(before, 'utf8'), Buffer.of(0xe9), Buffer.from(after, 'utf8')]),
  );
  return path;
}

/** The fixture file with `from` on its line `lineNo` (1-based) replaced by `to`. */
function fixtureWith(name: string, lineNo: number, from: string, to: string): string {
  const rows = readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
  const row = rows[lineNo - 1] as string;
  expect(row).toContain(from);
  rows[lineNo - 1] = row.replace(from, to);
  return rows.join('\n');
}

function summarize(extra: string[], samples = join(FIXTURE_DIR, 'samples.csv')) {
  return runCli([
    'summarize',
    '--genotypes',
    join(FIXTURE_DIR, 'genotypes.vcf'),
    '--samples',
    samples,
    ...extra,
  ]);
}

describe('cli strict UTF-8 (contract 1.11.0)', () => {
  it('exits 1 naming samples.csv line 4 for 0xE9 in its notes', () => {
    // Line 4 starts `NIL_01,NIL-01,candidate,BC5F3,FAM1,"one`; the `o` is byte 37.
    const samples = writeWithE9('samples.csv', fixtureWith('samples.csv', 4, '"one', '"{BAD}ne'));
    const res = summarize([], samples);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      'error: samples.csv line 4: not valid UTF-8 (byte 0xE9 at position 37)',
    );
  });

  it('exits 1 naming markers.csv line 4 for 0xE9 in a marker_id', () => {
    const markers = writeWithE9('markers.csv', fixtureWith('markers.csv', 4, 'syn_', 's{BAD}n_'));
    const res = summarize(['--markers', markers]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      'error: markers.csv line 4: not valid UTF-8 (byte 0xE9 at position 2)',
    );
  });

  it('exits 1 naming the token profile file once, with its line and position', () => {
    const profile = writeWithE9('profile.json', '{"id":"x{BAD}"}\n');
    const res = summarize(['--profile', profile]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      `error: token profile file ${profile} line 1: not valid UTF-8 (byte 0xE9 at position 9)`,
    );
  });
});
