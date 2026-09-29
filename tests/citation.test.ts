import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const cff = read('CITATION.cff');
const readme = read('README.md');
const version = (JSON.parse(read('package.json')) as { version: string }).version;
const contract = read('contract/VERSION').trim();
const lines = cff.split('\n');

/** Top-level `key: value` line, quotes stripped. */
function top(key: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${key}: `));
  return line?.slice(key.length + 2).replace(/^(['"])(.*)\1$/, '$2');
}

describe('CITATION.cff', () => {
  it('declares CFF 1.2.0', () => {
    expect(top('cff-version')).toBe('1.2.0');
  });
  it('carries the package.json version', () => {
    expect(top('version')).toBe(version);
  });
  it('has an ISO date-released', () => {
    expect(top('date-released')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('points at the repository', () => {
    expect(top('repository-code')).toBe('https://github.com/piercetaylor/backcross');
  });
  it('names the current input data contract', () => {
    expect(cff).toContain(`input data contract ${contract}`);
  });
});

describe('README.md', () => {
  it('has the Cite and Sibling tool sections', () => {
    expect(readme).toContain('## Cite');
    expect(readme).toContain('## Sibling tool');
    expect(readme).toContain('progeny-selector');
  });
});
