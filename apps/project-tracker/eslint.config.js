// @ts-check
import nextPlugin from '@next/eslint-plugin-next';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const eslintConfig = tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', '*.config.js', '*.config.ts', '.turbo/**', 'tsconfig.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  }
);

export default eslintConfig;
