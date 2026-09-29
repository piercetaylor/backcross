import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPO_URL, releaseUnreleased, sectionBody } from '../scripts/changelog-section.mjs';

const real = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const TYPES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

/** Splits the file into `## [` sections with their `### ` headings. */
function sections(text: string): { heading: string; types: string[] }[] {
  const out: { heading: string; types: string[] }[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('## [')) out.push({ heading: line, types: [] });
    else if (line.startsWith('### ') && out.length > 0) {
      out[out.length - 1]!.types.push(line.slice(4));
    }
  }
  return out;
}

describe('CHANGELOG.md', () => {
  const secs = sections(real);

  it('has exactly one [Unreleased] section', () => {
    expect(secs.filter((s) => s.heading === '## [Unreleased]')).toHaveLength(1);
    expect(real.match(/^## \[Unreleased\]/gm)).toHaveLength(1);
  });

  it('gives every version heading a semver and an ISO date, and never Unreleased', () => {
    for (const s of secs.filter((x) => x.heading !== '## [Unreleased]')) {
      expect(s.heading).toMatch(/^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/);
      expect(s.heading).not.toContain('Unreleased');
    }
  });

  it('uses each of the six types at most once, in canonical order', () => {
    for (const s of secs) {
      for (const t of s.types) expect(TYPES).toContain(t);
      expect(new Set(s.types).size).toBe(s.types.length);
      const idx = s.types.map((t) => TYPES.indexOf(t));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
    expect(real).not.toContain('### Documentation');
  });

  it('has a link line for every section', () => {
    const lines = real.split('\n');
    for (const s of secs) {
      const name = /^## \[([^\]]+)\]/.exec(s.heading)![1]!;
      const link = lines.find((l) => l.startsWith(`[${name}]: `));
      expect(link, name).toBeDefined();
      expect(link!.startsWith(`[${name}]: ${REPO_URL}/`)).toBe(true);
    }
  });
});

const BASE = `# Changelog

## [Unreleased]

### Added

- One thing.

### Fixed

- Another.

[Unreleased]: ${REPO_URL}/commits/main
`;

describe('sectionBody', () => {
  const text = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-11-01

### Fixed

- Two.

## [1.0.0] - 2026-10-01

### Added

- One.

[Unreleased]: x
[1.1.0]: y
`;
  it('returns the body between headings', () => {
    expect(sectionBody(text, '1.1.0')).toBe('### Fixed\n\n- Two.');
    expect(sectionBody(text, '1.0.0')).toBe('### Added\n\n- One.');
  });
  it('throws on a missing heading or a bad date', () => {
    expect(() => sectionBody(text, '2.0.0')).toThrow();
    expect(() => sectionBody('## [1.0.0] - soon\n\n- x\n', '1.0.0')).toThrow();
  });
});

describe('releaseUnreleased', () => {
  const first = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-10-01

### Added

- One thing.

### Fixed

- Another.

[Unreleased]: ${REPO_URL}/compare/v1.0.0...HEAD
[1.0.0]: ${REPO_URL}/releases/tag/v1.0.0
`;

  it('cuts a first release', () => {
    expect(releaseUnreleased(BASE, '1.0.0', '2026-10-01')).toBe(first);
  });

  it('cuts a second release with a previous version and keeps old links', () => {
    const next = first.replace('## [Unreleased]\n\n', '## [Unreleased]\n\n### Added\n\n- Two.\n\n');
    expect(releaseUnreleased(next, '1.1.0', '2026-11-01', '1.0.0')).toBe(`# Changelog

## [Unreleased]

## [1.1.0] - 2026-11-01

### Added

- Two.

## [1.0.0] - 2026-10-01

### Added

- One thing.

### Fixed

- Another.

[Unreleased]: ${REPO_URL}/compare/v1.1.0...HEAD
[1.1.0]: ${REPO_URL}/compare/v1.0.0...v1.1.0
[1.0.0]: ${REPO_URL}/releases/tag/v1.0.0
`);
  });

  it('throws on an empty Unreleased, a repeated version or no Unreleased', () => {
    expect(() => releaseUnreleased(first, '1.1.0', '2026-11-01', '1.0.0')).toThrow();
    expect(() => releaseUnreleased(BASE, '1.0.0', '2026-10-01')).not.toThrow();
    expect(() => releaseUnreleased(first, '1.0.0', '2026-10-01')).toThrow();
    expect(() => releaseUnreleased('# Changelog\n', '1.0.0', '2026-10-01')).toThrow();
  });
});
