/**
 * The single-file CLI bundle, scripts/build-cli.mjs (docs/adr/0030, Q2): built
 * into a temporary directory with the stamp the unbundled CLI resolves, it
 * writes byte-identical output to `node src/cli.ts` for all six subcommands on
 * the synthetic fixture (the r-reader job's arguments in ci.yml), carries the
 * shebang, has no build-stamp identifier left, and prints the usage with exit
 * 2 when given no arguments.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildCli } from '../scripts/build-cli.mjs';
import { resolveCommit } from '../scripts/git-commit.mjs';

const ROOT = join(import.meta.dirname, '..');
const CLI = join(ROOT, 'src', 'cli.ts');
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

const G = ['--genotypes', 'tests/fixtures/synthetic/genotypes.vcf'];
const S = ['--samples', 'tests/fixtures/synthetic/samples.csv'];
const M = ['--markers', 'tests/fixtures/synthetic/markers.csv'];
const PAIR = ['--a', 'NIL_03', '--b', 'RP_Williams'];

const RUNS: [string, string[]][] = [
  ['summarize', ['summarize', ...G, ...S, ...M]],
  ['segments', ['segments', ...G, ...S, ...M]],
  ['targets', ['targets', ...G, ...S, ...M, '--target', 'name=Gm13:28,500,000-29,100,000']],
  ['compare', ['compare', ...G, ...S, ...PAIR]],
  ['discordant', ['discordant', ...G, ...S, ...PAIR, '--mode', 'all']],
  ['qc', ['qc', ...G, ...S, ...M]],
];

let bundle: string;

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** stderr without Node's type-stripping notices, which only the unbundled CLI prints. */
function stderrLines(text: string): string[] {
  return text.split('\n').filter((line) => !/ExperimentalWarning|--experimental-/.test(line));
}

beforeAll(async () => {
  bundle = join(mkdtempSync(join(tmpdir(), 'backcross-cli-')), 'backcross-cli.mjs');
  await buildCli({
    rootDir: ROOT,
    outfile: bundle,
    version: VERSION,
    commit: resolveCommit({ cwd: ROOT }),
  });
}, 60_000);

afterAll(() => {
  rmSync(dirname(bundle), { recursive: true, force: true });
});

describe('cli bundle', () => {
  it.each(RUNS)('%s writes the same output as node src/cli.ts', (_name, args) => {
    const fromBundle = run(bundle, args);
    const fromSource = run(CLI, args);
    expect(fromBundle.status).toBe(0);
    expect(fromSource.status).toBe(0);
    expect(fromBundle.stdout).toBe(fromSource.stdout);
    expect(stderrLines(fromBundle.stderr)).toEqual(stderrLines(fromSource.stderr));
  });

  it('starts with the node shebang', () => {
    const text = readFileSync(bundle, 'utf8');
    expect(text.split('\n', 1)[0]).toBe('#!/usr/bin/env node');
  });

  it('has no build-stamp identifier left', () => {
    const text = readFileSync(bundle, 'utf8');
    expect(text).not.toContain('__APP' + '_VERSION__');
    expect(text).not.toContain('__GIT' + '_COMMIT__');
  });

  it('prints the usage and exits 2 with no arguments', () => {
    const res = run(bundle, []);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('usage:');
  });
});
