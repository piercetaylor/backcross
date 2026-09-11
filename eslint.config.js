import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import uiLiteralSelectors from './eslint/ui-literal-selectors.json' with { type: 'json' };

/**
 * Component files that still hold literal colours and dimensions. The
 * literal-value gate skips these and only these; every other component file
 * is gated from the commit that introduced the rule. The list shrinks as
 * M2.5 migrates each screen and is deleted in phase 5. A migrated file is
 * removed from this list in the same commit that migrates it, so it cannot
 * regress. Do not add to it.
 */
const UI_LITERAL_LEGACY = [
  'src/App.tsx',
  'src/ui/screens/UploadScreen.tsx',
  'src/ui/screens/SummaryScreen.tsx',
  'src/ui/screens/GenotypeViewScreen.tsx',
  'src/ui/screens/CompareScreen.tsx',
  'src/ui/screens/ExportScreen.tsx',
];

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
    files: ['scripts/**', 'src/cli.ts'],
    rules: { 'no-console': 'off' },
  },
  // Every colour and dimension lives in src/ui/tokens.css. Canvas geometry
  // (src/ui/canvas/*.ts) and the self-contained report (src/export/report.ts)
  // are outside the gate by construction: the renderer is handed its colours
  // by the screen, and the report cannot reference the app stylesheet.
  {
    files: ['src/App.tsx', 'src/ui/**/*.tsx'],
    ignores: UI_LITERAL_LEGACY,
    rules: { 'no-restricted-syntax': ['error', ...uiLiteralSelectors] },
  },
  prettier,
);
