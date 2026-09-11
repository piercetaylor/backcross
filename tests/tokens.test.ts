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
  it('every hex literal is on a --neutral-N line or is the one reserved hue', () => {
    const lines = css.split('\n');
    const offenders = lines.filter(
      (line) =>
        /#[0-9a-fA-F]{3,8}/.test(line) &&
        !/^\s*--neutral-\d+:/.test(line) &&
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
 * ADR 0009 holds that chrome carries no hue. The maintainer reserved a single
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
});
