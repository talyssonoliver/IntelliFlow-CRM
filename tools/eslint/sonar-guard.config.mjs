import baseConfig from '../../eslint.config.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      // Register jsx-a11y so that eslint-disable comments for its rules don't
      // cause "Definition for rule not found" errors. The rules themselves are
      // only enabled in the web accessibility guard (apps/web/eslint.sonar-guard.config.mjs).
      'jsx-a11y': jsxA11y,
    },
    linterOptions: {
      // jsx-a11y rules are not enabled here, so eslint-disable comments for
      // them are "unused". Suppress that noise — the web a11y guard handles them.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // No projectService — these rules don't need type information
        // and loading the full TS program causes OOM on large file sets
        tsconfigRootDir: repoRoot,
      },
    },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'no-nested-ternary': 'error',
      'sonarjs/no-nested-template-literals': 'error',
    },
  },
];
