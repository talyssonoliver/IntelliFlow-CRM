/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // Monorepo baseline: keep lint running without type-aware configuration.
    // Tighten progressively once existing code is brought into compliance.
    'no-undef': 'off', // TypeScript handles this
    'no-unused-vars': 'off', // Prefer TS compiler for now
    '@typescript-eslint/no-unused-vars': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      env: {
        jest: true,
      },
      rules: {
        // Keep tests flexible.
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['**/next.config.js', '**/tailwind.config.js', '**/*.config.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.next/',
    'coverage/',
    '.turbo/',
    'artifacts/',
    '.scannerwork/',
    'sonar-reports/',
  ],
};
