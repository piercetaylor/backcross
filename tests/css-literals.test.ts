/**
 * The token rule, extended from component files to stylesheets.
 *
 * The ESLint gate of phase 1 covers src/App.tsx and every .tsx under
 * src/ui/; it cannot see a CSS file. This is the companion assertion: no
 * stylesheet under src/ui/ other than tokens.css (which declares the
 * values) and fonts.css (which declares @font-face weights, not design
 * values) may contain a colour literal or a bare length. A length inside
 * var() or calc() is not bare -- calc(-1 * var(--focus-ring-width)) is
 * arithmetic over a token -- so those spans are removed before the scan,
 * as are comments, which are prose rather than declarations.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../src/ui/', import.meta.url));

/** The two files that are allowed to hold literals, by role. */
const EXEMPT = new Set(['tokens.css', 'fonts.css']);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const BARE_LENGTH = /\b[0-9]+(\.[0-9]+)?(px|pt|em|rem)\b/;

/** Comments, then var() and calc() spans; what is left is bare. */
function scannable(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\bcalc\([^;{}]*\)/g, '')
    .replace(/\bvar\([^;{}]*\)/g, '');
}

function stylesheets(): string[] {
  return readdirSync(UI_DIR, { recursive: true, encoding: 'utf8' })
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => p.endsWith('.css'))
    .filter((p) => {
      const base = p.slice(p.lastIndexOf('/') + 1);
      return !EXEMPT.has(base);
    })
    .sort();
}

describe('stylesheets under src/ui/ name tokens, never values', () => {
  const files = stylesheets();

  it('finds the stylesheets it is meant to be guarding', () => {
    // A rename or a move must not silently empty this test.
    expect(files).toContain('lines/lines.css');
    expect(files).toContain('canvas/legend.css');
  });

  it.each(files)('%s holds no colour literal', (file) => {
    const text = scannable(readFileSync(UI_DIR + file, 'utf8'));
    const offenders = text.split('\n').filter((line) => HEX.test(line));
    expect(offenders).toEqual([]);
  });

  it.each(files)('%s holds no bare length', (file) => {
    const text = scannable(readFileSync(UI_DIR + file, 'utf8'));
    const offenders = text.split('\n').filter((line) => BARE_LENGTH.test(line));
    expect(offenders).toEqual([]);
  });
});
