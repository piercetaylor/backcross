/** Bundle shape and size checks for `npm run build` (docs/adr/0016). */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkBundle, LIMITS } from '../scripts/check-bundle.mjs';

let dir: string;

function write(name: string, bytes: number) {
  writeFileSync(join(dir, name), 'x'.repeat(bytes));
}

function writeValidSet() {
  write('index-abc123.js', 10);
  write('vendor-react-abc123.js', 10);
  write('vendor-abc123.js', 10);
  write('analysis.worker-abc123.js', 10);
}

function writeValidSetWithRuntime() {
  writeValidSet();
  write('rolldown-runtime-abc123.js', 10);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-bundle-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('checkBundle', () => {
  it('reports no problems for a valid set', () => {
    writeValidSet();
    expect(checkBundle(dir)).toEqual([]);
  });

  it('reports a problem for a second index-*.js', () => {
    writeValidSet();
    write('index-def456.js', 10);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/index-\*\.js/);
  });

  it('reports a problem for a missing vendor-react-*.js', () => {
    write('index-abc123.js', 10);
    write('vendor-abc123.js', 10);
    write('analysis.worker-abc123.js', 10);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/vendor-react-\*\.js/);
  });

  it('reports a problem for an index-*.js over entryBytes', () => {
    write('index-abc123.js', LIMITS.entryBytes + 1);
    write('vendor-react-abc123.js', 10);
    write('vendor-abc123.js', 10);
    write('analysis.worker-abc123.js', 10);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/index-abc123\.js/);
  });

  it('reports a problem for a vendor-*.js over chunkBytes', () => {
    write('index-abc123.js', 10);
    write('vendor-react-abc123.js', 10);
    write('vendor-abc123.js', LIMITS.chunkBytes + 1);
    write('analysis.worker-abc123.js', 10);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/vendor-abc123\.js/);
  });

  it('reports a problem for an extra unexpected file', () => {
    writeValidSet();
    write('other-e.js', 10);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/other-e\.js/);
  });

  it('accepts an optional rolldown-runtime-*.js chunk', () => {
    writeValidSetWithRuntime();
    expect(checkBundle(dir)).toEqual([]);
  });

  it('reports a problem for a rolldown-runtime-*.js over runtimeBytes', () => {
    writeValidSet();
    write('rolldown-runtime-abc123.js', LIMITS.runtimeBytes + 1);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/rolldown-runtime-abc123\.js/);
  });

  it('reports a problem for a second rolldown-runtime-*.js', () => {
    writeValidSetWithRuntime();
    write('rolldown-runtime-def456.js', 10);
    const problems = checkBundle(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/rolldown-runtime-\*\.js/);
  });
});
