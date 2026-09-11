/** WCAG 2.x luminance and contrast arithmetic. Phase 3 extends this file. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, relativeLuminance } from '../src/core/contrast.ts';
import { CLASS_COLORS, CLASS_TEXTURES, TEXTURE_INK, classSwatchCss } from '../src/core/palette.ts';
import { CallClass } from '../src/core/types.ts';
import type { CallClassValue } from '../src/core/types.ts';

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

/** All six call classes, in ascending class-code order. */
const ALL_CLASSES: CallClassValue[] = [
  CallClass.MISSING,
  CallClass.RP_HOM,
  CallClass.DONOR_HOM,
  CallClass.HET,
  CallClass.UNINFORMATIVE,
  CallClass.NONPARENTAL,
];

/** The classes that compete for a column's majority and minority (docs/adr/0007, src/ui/canvas/binning.ts): every class a minority overlay can be drawn over. */
const CALLED_CLASSES: CallClassValue[] = [
  CallClass.RP_HOM,
  CallClass.DONOR_HOM,
  CallClass.HET,
  CallClass.NONPARENTAL,
];

const tokensCss = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');

/** `--name: value;` -> value, first declaration wins. */
function token(name: string): string {
  const match = new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm').exec(tokensCss);
  if (match?.[1] === undefined) throw new Error(`token --${name} not declared in tokens.css`);
  return match[1].trim();
}

/** Resolves a token to a literal value, following `var(--x)` indirection. */
function resolveToken(name: string): string {
  const value = token(name);
  const varMatch = /^var\(--([\w-]+)\)$/.exec(value);
  return varMatch !== null ? resolveToken(varMatch[1] as string) : value;
}

const SWATCH_BORDER = resolveToken('color-swatch-border');

describe('class textures (docs/adr/0007, M2.5 phase 3)', () => {
  it('the texture ink clears the WCAG 1.4.11 floor of 3:1 against every textured class fill', () => {
    for (const cls of ALL_CLASSES) {
      if (CLASS_TEXTURES[cls].kind === 'plain') continue;
      expect(contrastRatio(TEXTURE_INK, CLASS_COLORS[cls])).toBeGreaterThanOrEqual(3);
    }
  });

  it('the minority-overlay ink clears 3:1 against every majority fill it can be drawn over', () => {
    for (const majorityCls of CALLED_CLASSES) {
      for (const minorityCls of CALLED_CLASSES) {
        if (CLASS_TEXTURES[minorityCls].kind === 'plain') continue;
        expect(contrastRatio(TEXTURE_INK, CLASS_COLORS[majorityCls])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the legend swatch border clears 3:1 against every class fill', () => {
    for (const cls of ALL_CLASSES) {
      expect(contrastRatio(SWATCH_BORDER, CLASS_COLORS[cls])).toBeGreaterThanOrEqual(3);
    }
  });

  it('the two plain classes (RP_HOM, UNINFORMATIVE) are distinct from each other', () => {
    expect(
      contrastRatio(CLASS_COLORS[CallClass.RP_HOM], CLASS_COLORS[CallClass.UNINFORMATIVE]),
    ).toBeGreaterThanOrEqual(3);
  });

  it('documents that the textures are necessary: these same-toned pairs fail 1.5:1 by colour alone', () => {
    expect(
      contrastRatio(CLASS_COLORS[CallClass.RP_HOM], CLASS_COLORS[CallClass.DONOR_HOM]),
    ).toBeLessThan(1.5);
    expect(
      contrastRatio(CLASS_COLORS[CallClass.HET], CLASS_COLORS[CallClass.MISSING]),
    ).toBeLessThan(1.5);
    expect(
      contrastRatio(CLASS_COLORS[CallClass.UNINFORMATIVE], CLASS_COLORS[CallClass.MISSING]),
    ).toBeLessThan(1.5);
  });

  it('classSwatchCss embeds the class hex always, and the texture ink only for textured classes', () => {
    for (const cls of ALL_CLASSES) {
      const css = classSwatchCss(cls);
      expect(css).toContain(CLASS_COLORS[cls]);
      if (CLASS_TEXTURES[cls].kind === 'plain') {
        expect(css).toBe(CLASS_COLORS[cls]);
      } else {
        expect(css).toContain(TEXTURE_INK);
      }
    }
  });
});
