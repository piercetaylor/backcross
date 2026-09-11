/**
 * The literal-value gate has teeth.
 *
 * This runs the selectors from eslint/ui-literal-selectors.json -- the same
 * object eslint.config.js imports, so the test cannot drift from the config
 * -- over a component-shaped probe and asserts that each of the four shapes
 * a literal can take is reported, and that a token-only component is not.
 *
 * It deliberately does not read eslint.config.js: which files are gated is
 * the allowlist's business and changes every phase, whereas what counts as a
 * literal is fixed and is what this file pins.
 */
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import uiLiteralSelectors from '../eslint/ui-literal-selectors.json';

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { sourceType: 'module', ecmaFeatures: { jsx: true } },
      },
      rules: { 'no-restricted-syntax': ['error', ...uiLiteralSelectors] },
    },
  ],
});

/** One hex string, one px string, one hex in a template, one style number. */
const OFFENDING = `export function Probe() {
  const accent = '#0072B2';
  const gap = '12px';
  const rule = \`solid #bdbdbd\`;
  return <div style={{ width: 240 }} data-a={accent} data-g={gap} data-r={rule} />;
}
`;

const CLEAN = `export function Probe() {
  return <div className="panel" style={{ gap: 'var(--space-4)' }} />;
}
`;

async function lint(code: string): Promise<ESLint.LintResult> {
  const results = await eslint.lintText(code, { filePath: 'src/ui/screens/Probe.tsx' });
  const first = results[0];
  if (first === undefined) throw new Error('eslint returned no result for the probe');
  return first;
}

describe('ui literal selectors', () => {
  it('reports each of the four literal shapes', async () => {
    const result = await lint(OFFENDING);
    const restricted = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(restricted).toHaveLength(4);
    expect(restricted.map((m) => m.message).join('\n')).toMatch(/Colour literal in a component/);
    expect(restricted.map((m) => m.message).join('\n')).toMatch(/Colour literal in a template/);
    expect(restricted.map((m) => m.message).join('\n')).toMatch(/px dimension in a component/);
    expect(restricted.map((m) => m.message).join('\n')).toMatch(/Numeric literal inside a style/);
  });

  it('passes a component that uses only class names and tokens', async () => {
    const result = await lint(CLEAN);
    expect(result.messages).toEqual([]);
  });

  it('leaves a fragment identifier alone', async () => {
    const result = await lint(
      `export function Probe() {\n  return <a href="#main-content">Skip</a>;\n}\n`,
    );
    expect(result.messages).toEqual([]);
  });
});
