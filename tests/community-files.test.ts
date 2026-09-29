/** Community and hygiene files exist and carry their load-bearing lines (line-based; no YAML dependency). */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

const files = [
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md',
  '.github/dependabot.yml',
];

describe('community files', () => {
  it.each(files)('%s exists', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it('code of conduct is the Covenant and publishes no email', () => {
    const t = read('CODE_OF_CONDUCT.md');
    expect(t).toContain('Contributor Covenant');
    expect(t).not.toMatch(/@/);
  });

  it('security policy names the private reporting route', () => {
    expect(read('SECURITY.md')).toContain('security/advisories/new');
  });

  it.each(['bug_report.yml', 'feature_request.yml'])('%s has name and body', (f) => {
    const t = read(`.github/ISSUE_TEMPLATE/${f}`);
    expect(t).toMatch(/^name:/m);
    expect(t).toMatch(/^body:/m);
  });

  it('bug report asks for no real genotype data', () => {
    expect(read('.github/ISSUE_TEMPLATE/bug_report.yml')).toContain('no real genotype data');
  });

  it('dependabot covers npm and github-actions', () => {
    const t = read('.github/dependabot.yml');
    expect(t).toContain('package-ecosystem: npm');
    expect(t).toContain('github-actions');
  });
});
