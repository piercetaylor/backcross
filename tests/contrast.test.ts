/** WCAG 2.x luminance and contrast arithmetic. Phase 3 extends this file. */
import { describe, expect, it } from 'vitest';

import { contrastRatio, relativeLuminance } from '../src/core/contrast.ts';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('matches the published value for Okabe-Ito blue', () => {
    expect(relativeLuminance('#0072B2')).toBeCloseTo(0.152, 3);
  });

  it('is case-insensitive', () => {
    expect(relativeLuminance('#0072b2')).toBe(relativeLuminance('#0072B2'));
  });

  it('throws on three-digit shorthand and on malformed input', () => {
    expect(() => relativeLuminance('#fff')).toThrow();
    expect(() => relativeLuminance('#FFFFFFFF')).toThrow();
    expect(() => relativeLuminance('FFFFFF')).toThrow();
    expect(() => relativeLuminance('rgb(255 255 255)')).toThrow();
    expect(() => relativeLuminance('#GGGGGG')).toThrow();
    expect(() => relativeLuminance('')).toThrow();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black against white', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 10);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#0072B2', '#0072B2')).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#000000'));
  });

  it('throws if either argument is malformed', () => {
    expect(() => contrastRatio('#fff', '#000000')).toThrow();
    expect(() => contrastRatio('#FFFFFF', '#000')).toThrow();
  });
});
