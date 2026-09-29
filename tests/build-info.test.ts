/** The build stamp, src/build-info.ts (docs/adr/0030, Q4). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildInfo, toolProvenance } from '../src/build-info.ts';

const PKG_VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

describe('buildInfo', () => {
  // vitest may or may not apply Vite's define to node tests; both are correct.
  it('is null or the package.json version with a well-formed commit', () => {
    const b = buildInfo();
    if (b === null) return;
    expect(b.version).toBe(PKG_VERSION);
    expect(b.commit).toMatch(/^(g[0-9a-f]{7}(-dirty)?|NA)$/);
  });

  it('names the tool backcross', () => {
    expect(toolProvenance().tool).toBe('backcross');
  });
});
