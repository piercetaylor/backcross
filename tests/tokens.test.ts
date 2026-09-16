/**
 * The token contract, asserted from the text of src/ui/tokens.css.
 *
 * Reading the file as text rather than through a CSS parser is deliberate:
 * the point is that the committed stylesheet says what the design brief says,
 * including the absence of a colour that hides in a role alias. Contrast
 * claims are re-derived here from src/core/contrast.ts rather than copied
 * from the brief, so retuning a ramp step fails this file rather than
 * quietly shipping an unreadable pair.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, relativeLuminance } from '../src/core/contrast.ts';
import { OKABE_ITO } from '../src/core/palette.ts';

const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');

/** `--name: value;` -> value, first declaration wins. */
function token(name: string): string {
  const match = new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm').exec(css);
  if (match?.[1] === undefined) throw new Error(`token --${name} not declared in tokens.css`);
  return match[1].trim();
}

const NEUTRAL_DECL = /^\s*--neutral-(\d+):\s*(#[0-9a-fA-F]{6})\s*;/gm;
const neutrals = new Map<number, string>();
for (const m of css.matchAll(NEUTRAL_DECL)) {
  neutrals.set(Number(m[1]), m[2] as string);
}
const ramp = Array.from({ length: 12 }, (_, i) => {
  const value = neutrals.get(i + 1);
  if (value === undefined) throw new Error(`--neutral-${i + 1} not declared in tokens.css`);
  return value;
});

describe('neutral ramp', () => {
  it('has exactly twelve steps', () => {
    expect(neutrals.size).toBe(12);
    expect(css.match(/--neutral-\d+:/g)).toHaveLength(12);
  });

  it('is hueless: r = g = b at every step', () => {
    for (const [step, hex] of neutrals) {
      const r = hex.slice(1, 3).toLowerCase();
      const g = hex.slice(3, 5).toLowerCase();
      const b = hex.slice(5, 7).toLowerCase();
      expect(`${step}:${r}${g}${b}`).toBe(`${step}:${r}${r}${r}`);
    }
  });

  it('decreases strictly in luminance from step 1 to step 12', () => {
    const lums = ramp.map(relativeLuminance);
    for (let i = 1; i < lums.length; i += 1) {
      expect(lums[i - 1] as number).toBeGreaterThan(lums[i] as number);
    }
  });
});

describe('contrast floors on the background and fill steps (1 to 5)', () => {
  const backgrounds = ramp.slice(0, 5);

  it.each([12, 11, 10])('text step %i clears 4.5:1 on every background', (step) => {
    for (const [i, bg] of backgrounds.entries()) {
      expect({
        pair: `${step}/${i + 1}`,
        ratio: contrastRatio(ramp[step - 1] as string, bg) >= 4.5,
      }).toEqual({ pair: `${step}/${i + 1}`, ratio: true });
    }
  });

  it('strong border step 9 clears 3:1 on every background', () => {
    for (const [i, bg] of backgrounds.entries()) {
      expect({ pair: `9/${i + 1}`, ratio: contrastRatio(ramp[8] as string, bg) >= 3 }).toEqual({
        pair: `9/${i + 1}`,
        ratio: true,
      });
    }
  });

  it('focus ring step 12 clears 3:1 on every background', () => {
    for (const [i, bg] of backgrounds.entries()) {
      expect({ pair: `12/${i + 1}`, ratio: contrastRatio(ramp[11] as string, bg) >= 3 }).toEqual({
        pair: `12/${i + 1}`,
        ratio: true,
      });
    }
  });

  it('text on a solid fill clears 4.5:1', () => {
    expect(contrastRatio(ramp[0] as string, ramp[11] as string)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('no colour hides in a role alias', () => {
  it('every hex literal is on a --neutral-N line, a --crop-* line or is the one reserved hue', () => {
    const lines = css.split('\n');
    const offenders = lines.filter(
      (line) =>
        /#[0-9a-fA-F]{3,8}/.test(line) &&
        !/^\s*--neutral-\d+:/.test(line) &&
        !/^\s*--crop-[\w-]+:/.test(line) &&
        !/^\s*--hue-alert:/.test(line),
    );
    expect(offenders).toEqual([]);
  });

  it('reserves exactly one hue', () => {
    const hueTokens = [...css.matchAll(/^\s*--hue-[\w-]+:/gm)];
    expect(hueTokens).toHaveLength(1);
  });
});

/*
 * The crop palette (docs/adr/0017, amending docs/adr/0009 on 2026-09-16)
 * colours the chrome. It is a fixed, enumerated set, none of it Okabe-Ito,
 * and every text, control and focus pair it forms is asserted at WCAG AA
 * through the role aliases the stylesheets actually name.
 */
const CROP_DECL = /^\s*--(crop-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/gm;
const crop = new Map<string, string>();
for (const m of css.matchAll(CROP_DECL)) crop.set(m[1] as string, m[2] as string);

/** Resolves a token to a literal value, following `var(--x)` indirection. */
function resolveToken(name: string): string {
  const value = token(name);
  const varMatch = /^var\(--([\w-]+)\)$/.exec(value);
  return varMatch !== null ? resolveToken(varMatch[1] as string) : value;
}

function ratio(fg: string, bg: string): number {
  return contrastRatio(resolveToken(fg), resolveToken(bg));
}

/** Asserts every fg/bg pair clears `floor`, naming the failing pair. */
function expectPairs(fgs: string[], bgs: string[], floor: number): void {
  for (const fg of fgs) {
    for (const bg of bgs) {
      expect({ pair: `${fg}/${bg}`, ok: ratio(fg, bg) >= floor }).toEqual({
        pair: `${fg}/${bg}`,
        ok: true,
      });
    }
  }
}

describe('the crop palette', () => {
  const surfaces = ['color-bg', 'color-bg-subtle', 'color-bg-hero', 'color-bg-alert'];
  const fills = [
    'color-bg-control',
    'color-bg-control-hover',
    'color-bg-control-active',
    'color-bg-row-hover',
    'color-bg-row-selected',
    'color-bg-row-selected-hover',
    'color-bg-rail-current',
  ];

  it('is exactly the enumerated set', () => {
    expect([...crop.keys()].sort()).toEqual(
      [
        'crop-leaf-100',
        'crop-leaf-700',
        'crop-leaf-800',
        'crop-leaf-900',
        'crop-parchment-100',
        'crop-parchment-50',
        'crop-soil-700',
        'crop-soil-900',
        'crop-wheat-500',
      ].sort(),
    );
    expect(css.match(/^\s*--crop-[\w-]+:/gm)).toHaveLength(crop.size);
  });

  it('has no Okabe-Ito member', () => {
    const members = Object.values(OKABE_ITO).map((h) => h.toLowerCase());
    for (const [name, hex] of crop) {
      expect({ name, member: members.includes(hex.toLowerCase()) }).toEqual({
        name,
        member: false,
      });
    }
  });

  it('text, secondary and tertiary text and links clear 4.5:1 on every chrome surface', () => {
    expectPairs(
      ['color-text', 'color-text-secondary', 'color-text-tertiary', 'color-link'],
      surfaces,
      4.5,
    );
  });

  it('text and secondary text clear 4.5:1 on the control, row and rail-current fills', () => {
    expectPairs(['color-text', 'color-text-secondary'], fills, 4.5);
  });

  it('the alert hue clears 4.5:1 on every chrome surface', () => {
    expectPairs(['hue-alert'], surfaces, 4.5);
  });

  it('text on the primary button clears 4.5:1, at rest and hovered', () => {
    expectPairs(['color-text-on-primary'], ['color-bg-primary', 'color-bg-primary-hover'], 4.5);
  });

  it('the primary fill, rail indicator, strong border and focus ring clear 3:1 on every chrome surface', () => {
    expectPairs(
      ['color-bg-primary', 'color-rail-indicator', 'color-border-strong', 'color-focus-ring'],
      surfaces,
      3,
    );
  });

  it('the focus ring clears 3:1 on every control, row and rail-current fill', () => {
    expectPairs(['color-focus-ring'], fills, 3);
  });

  it('the rail indicator clears 3:1 on the rail-current fill it edges', () => {
    expectPairs(['color-rail-indicator'], ['color-bg-rail-current'], 3);
  });

  it('the canvas label and the legend swatch border stay on the neutral ramp (docs/adr/0007)', () => {
    expect(token('color-canvas-label')).toMatch(/^var\(--neutral-\d+\)$/);
    expect(token('color-swatch-border')).toMatch(/^var\(--neutral-\d+\)$/);
    expect(token('color-overlay-fill')).not.toMatch(/crop/);
    expect(token('color-overlay-stroke')).not.toMatch(/crop/);
  });
});

/*
 * ADR 0009 holds that chrome carries no hue (amended 2026-09-16, docs/adr/0017,
 * for the crop palette). The maintainer reserved a single
 * exception on 2026-09-11 so that an error is not signalled by position and
 * weight alone. These assertions pin what that exception must satisfy: it is
 * not an Okabe-Ito member, so it cannot be mistaken for a genotype class, and
 * it carries text at AA on both surfaces it appears on.
 */
describe('the reserved alert hue', () => {
  const hue = token('hue-alert');

  it('is not an Okabe-Ito member', () => {
    const members = Object.values(OKABE_ITO).map((h) => h.toLowerCase());
    expect(members).not.toContain(hue.toLowerCase());
  });

  it('carries text at 4.5:1 on the surfaces it appears on', () => {
    for (const step of [1, 2]) {
      expect(contrastRatio(hue, token(`neutral-${step}`))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('meets the 3:1 of WCAG 1.4.11 as the alert bar', () => {
    expect(contrastRatio(hue, token('neutral-1'))).toBeGreaterThanOrEqual(3);
  });
});

describe('dimensions', () => {
  it('spacing is 4, 8, 12, 16, 24, 32, 48 px', () => {
    const spacing = [1, 2, 3, 4, 5, 6, 7].map((i) => token(`space-${i}`));
    expect(spacing).toEqual(['4px', '8px', '12px', '16px', '24px', '32px', '48px']);
  });

  it('the three row heights are 28, 32, 40 px', () => {
    expect([
      token('row-height-compact'),
      token('row-height-default'),
      token('row-height-comfortable'),
    ]).toEqual(['28px', '32px', '40px']);
  });

  it('the live row height is the default, swapped by the density attribute', () => {
    expect(token('row-height')).toBe('var(--row-height-default)');
    expect(css).toMatch(/\[data-density='compact'\]/);
    expect(css).toMatch(/\[data-density='comfortable'\]/);
  });

  it('interface type is 13px and prose 14px', () => {
    expect(token('text-ui')).toBe('13px');
    expect(token('text-body')).toBe('14px');
  });

  it('the canvas row period meets --target-min (WCAG 2.2 SC 2.5.8)', () => {
    const rowHeight = Number.parseFloat(token('canvas-row-height'));
    const rowGap = Number.parseFloat(token('canvas-row-gap'));
    const targetMin = token('target-min');
    expect(targetMin).toBe('24px');
    expect(rowHeight + rowGap).toBeGreaterThanOrEqual(24);
  });
});
