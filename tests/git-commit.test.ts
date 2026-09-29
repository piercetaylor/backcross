/** The provenance commit resolver, scripts/git-commit.mjs (docs/adr/0030, Q4). */
import type { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { resolveCommit } from '../scripts/git-commit.mjs';

type Reply = string | Error;

/** A fake execFileSync answering `rev-parse` and `status`, recording every call. */
function fakeExec(revParse: Reply, status: Reply) {
  const calls: string[][] = [];
  const exec = ((file: string, args: readonly string[]) => {
    calls.push([file, ...args]);
    const reply = args[0] === 'rev-parse' ? revParse : status;
    if (reply instanceof Error) throw reply;
    return reply;
  }) as unknown as typeof execFileSync;
  return { exec, calls };
}

// Every case passes its own env: in CI, process.env.GITHUB_SHA is set.
describe('resolveCommit', () => {
  it('gives g + 7 hex for a clean checkout', () => {
    const { exec, calls } = fakeExec('abc1234\n', '');
    expect(resolveCommit({ env: {}, exec, cwd: '.' })).toBe('gabc1234');
    expect(calls).toEqual([
      ['git', 'rev-parse', '--short=7', 'HEAD'],
      ['git', 'status', '--porcelain', '--untracked-files=no'],
    ]);
  });

  it('appends -dirty when a tracked file differs from HEAD', () => {
    const { exec } = fakeExec('abc1234\n', ' M src/x.ts\n');
    expect(resolveCommit({ env: {}, exec, cwd: '.' })).toBe('gabc1234-dirty');
  });

  it('gives NA when git is unavailable', () => {
    const { exec } = fakeExec(new Error('spawn git ENOENT'), new Error('spawn git ENOENT'));
    expect(resolveCommit({ env: {}, exec, cwd: '.' })).toBe('NA');
  });

  it('uses the first 7 hex of GITHUB_SHA without calling git', () => {
    const { exec, calls } = fakeExec('abc1234\n', ' M src/x.ts\n');
    const env = { GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567' };
    expect(resolveCommit({ env, exec, cwd: '.' })).toBe('g0123456');
    expect(calls).toEqual([]);
  });

  it('gives NA when rev-parse prints something other than 7 hex', () => {
    const { exec } = fakeExec('fatal: not a git repository\n', '');
    expect(resolveCommit({ env: {}, exec, cwd: '.' })).toBe('NA');
  });

  it('falls through to git when GITHUB_SHA is not 40 hex', () => {
    const { exec, calls } = fakeExec('abc1234\n', '');
    const env = { GITHUB_SHA: '0123456789abcdef0123456789abcdef0123456' };
    expect(resolveCommit({ env, exec, cwd: '.' })).toBe('gabc1234');
    expect(calls.length).toBe(2);
  });
});
