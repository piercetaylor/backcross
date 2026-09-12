import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import uiLiteralSelectors from './eslint/ui-literal-selectors.json' with { type: 'json' };

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // The bench prints its wall-clock and memory figures on every run.
    files: ['scripts/**', 'src/cli.ts', 'tests/bench/**'],
    rules: { 'no-console': 'off' },
  },
  // Every colour and dimension lives in src/ui/tokens.css. From M2.5 phase 5
  // this covers every component file with no exceptions: the legacy
  // allowlist that carried the unmigrated screens through phases 1 to 4 is
  // gone, and `npm run lint` passing is what "no literal colour or dimension
  // appears in a component file" now means. Canvas geometry
  // (src/ui/canvas/*.ts) and the self-contained report (src/export/report.ts)
  // are outside the gate by construction: the renderer is handed its colours
  // and font by the screen (src/ui/canvas/read-theme.ts), and the report
  // cannot reference the app stylesheet.
  {
    files: ['src/App.tsx', 'src/ui/**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...uiLiteralSelectors] },
  },
  prettier,
);
