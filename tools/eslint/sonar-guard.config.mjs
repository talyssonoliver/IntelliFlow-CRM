import baseConfig from '../../eslint.config.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
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
