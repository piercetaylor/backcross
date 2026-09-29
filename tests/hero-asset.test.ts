/**
 * The landing photograph (docs/adr/0009, amended 2026-09-29): the processed
 * WebP exists, is small and is a real WebP container, and the script that
 * produces it is committed with its source named.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const asset = 'src/ui/assets/hero-soybean-plots.webp';
const script = 'scripts/process-hero.py';

describe('hero asset', () => {
  it('is a WebP of at most 120,000 bytes', () => {
    expect(existsSync(asset)).toBe(true);
    expect(statSync(asset).size).toBeLessThanOrEqual(120_000);
    const bytes = readFileSync(asset);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('has its processing script, naming the source image', () => {
    expect(existsSync(script)).toBe(true);
    expect(readFileSync(script, 'utf8')).toContain('D4630-1');
  });
});
