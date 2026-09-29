/**
 * The documentation index (docs/README.md) and the user guide (docs/user-guide.md).
 *
 * Every link target in the index must exist, every docs/*.md and docs/*.txt
 * file must be named in it (so a new doc has to be indexed), and the guide
 * must carry its nine headings, including the validation-status section.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DOCS = join(import.meta.dirname, '..', 'docs');
const index = readFileSync(join(DOCS, 'README.md'), 'utf8');
const targets = Array.from(index.matchAll(/\]\(([^)#]+)\)/g), (m) => m[1] as string);

describe('docs/README.md', () => {
  it('names only paths that exist', () => {
    expect(targets.length).toBeGreaterThan(0);
    const missing = targets.filter((t) => !existsSync(join(DOCS, t)));
    expect(missing).toEqual([]);
  });

  it('names every docs/*.md and docs/*.txt file', () => {
    const files = readdirSync(DOCS).filter((f) => /\.(md|txt)$/.test(f));
    const unnamed = files.filter((f) => f !== 'README.md' && !targets.includes(f));
    expect(unnamed).toEqual([]);
  });
});

describe('docs/user-guide.md', () => {
  const guide = readFileSync(join(DOCS, 'user-guide.md'), 'utf8');

  it('has the nine headings', () => {
    const headings = [
      '# Backcross user guide',
      '## Prepare the inputs',
      '## Run the site',
      '## Run the CLI',
      '## Read the results',
      '## Exports',
      '## Limitations and what is not validated yet',
      '## Validation status',
      '## Supported browsers',
    ];
    const lines = guide.split('\n');
    for (const h of headings) expect(lines, h).toContain(h);
  });

  it('states the validation status', () => {
    expect(guide).toContain('Validation status');
  });
});
