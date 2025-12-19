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

    include: ['**/*.{test,spec}.ts', '**/*.{test,spec}.tsx'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      'artifacts/**',
      '.next/**',
      'tests/e2e/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      reportsDirectory: path.join(packageRoot, 'artifacts', 'coverage'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.turbo/**',
        'artifacts/**',
        '.next/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/__mocks__/**',
      ],
    },
  },
});
