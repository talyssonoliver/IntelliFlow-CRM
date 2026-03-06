import baseConfig from '../../eslint.config.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: repoRoot,
      },
    },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'no-nested-ternary': 'error',
      'sonarjs/no-nested-template-literals': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
    },
  },
];
