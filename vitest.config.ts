import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Root Vitest configuration for IntelliFlow CRM monorepo.
 *
 * Turbo often runs Vitest from inside individual workspace packages, so this
 * config is deliberately "portable" and uses the current working directory as
 * the test root.
 */
const packageRoot = process.cwd();

export default defineConfig({
  test: {
    root: packageRoot,
    globals: true,
    environment: 'node',
    passWithNoTests: true,

    include: [
      'apps/**/*.{test,spec}.ts',
      'apps/**/*.{test,spec}.tsx',
      'packages/**/*.{test,spec}.ts',
      'packages/**/*.{test,spec}.tsx',
      'tools/**/*.{test,spec}.ts',
      'tools/**/*.{test,spec}.tsx',
      'tests/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.pnpm/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/artifacts/**',
      '**/.next/**',
      'tests/e2e/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: path.join(packageRoot, 'artifacts', 'coverage'),
      include: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/.pnpm/**',
        '**/dist/**',
        '**/build/**',
        '**/.turbo/**',
        '**/artifacts/**',
        '**/.next/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/__mocks__/**',
      ],
    },
  },
});
