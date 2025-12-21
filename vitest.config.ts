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
      include: [
        // Core product code only - excludes temporary tooling
        'apps/api/**/*.{ts,tsx}',
        'apps/ai-worker/**/*.{ts,tsx}',
        'apps/web/**/*.{ts,tsx}',
        'packages/**/*.{ts,tsx}',
      ],
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
        // Temporary tooling - not part of product
        'apps/project-tracker/**',
        'tools/**',
      ],
      // TDD Enforcement: Build FAILS if coverage below thresholds
      // Per CLAUDE.md: Domain >95%, Application >90%, Overall >90%
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
