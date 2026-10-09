// Type-aware promise-handling lint (SonarCloud typescript:S9383 parity).
//
// Kept OUT of eslint.config.mjs on purpose: type-aware rules need the TypeScript
// program, which is far slower than the untyped default lint every package runs.
// Run it with `pnpm lint:promises`; pre-ship and CI run it as a required step.
//
// Scope mirrors sonar.sources (product source roots, TS/TSX only; test files are
// excluded exactly as sonar.exclusions excludes them).
//
// `ignoreVoid: false` is deliberate: prefixing a floating promise with `void`
// silences S9383 without handling anything (an unhandled rejection is still
// unhandled), so it is not accepted here. Return the promise, await it, or
// attach a rejection handler.
import tseslint from 'typescript-eslint';

export const SOURCE_ROOTS = [
  'apps/api/src',
  'apps/ai-worker/src',
  'apps/web/src',
  'apps/project-tracker/app',
  'apps/project-tracker/components',
  'apps/project-tracker/lib',
  'packages/adapters/src',
  'packages/api-client/src',
  'packages/application/src',
  'packages/db/src',
  'packages/domain/src',
  'packages/observability/src',
  'packages/platform/src',
  'packages/ui/src',
  'packages/validators/src',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.d.ts',
      '**/migrations/**',
    ],
  },
  {
    files: SOURCE_ROOTS.flatMap((root) => [`${root}/**/*.ts`, `${root}/**/*.tsx`]),
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: false, ignoreIIFE: false },
      ],
    },
  }
);
