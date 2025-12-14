import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Root Vitest configuration for IntelliFlow CRM monorepo
 *
 * This configuration enables workspace support for running tests across all packages.
 * Individual packages can extend this with their own vitest.config.ts files.
 *
 * Coverage Requirements:
 * - Domain layer: >95%
 * - Application layer: >90%
 * - Overall: >90% (enforced by CI)
 */
export default defineConfig({
  test: {
    // Enable workspace support for monorepo testing
    workspace: [
      {
        // Workspace root configuration
        test: {
          name: 'root',
          include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
          environment: 'node',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
        },
      },
      // Domain package
      {
        extends: './packages/domain/vitest.config.ts',
        test: {
          name: 'domain',
          root: './packages/domain',
        },
      },
      // Validators package
      {
        extends: './packages/validators/vitest.config.ts',
        test: {
          name: 'validators',
          root: './packages/validators',
        },
      },
      // DB package
      {
        extends: './packages/db/vitest.config.ts',
        test: {
          name: 'db',
          root: './packages/db',
        },
      },
    ],

    // Global coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './artifacts/coverage',

      // Coverage thresholds enforced across the monorepo
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },

      // Files to exclude from coverage
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        '**/*.config.js',
        '**/types.ts',
        '**/*.d.ts',
        'tests/',
        '**/__tests__/',
        '**/__mocks__/',
        '**/mocks/',
        'artifacts/',
        '.turbo/',
      ],

      // Include source files for coverage
      include: [
        'packages/*/src/**/*.ts',
        'apps/*/src/**/*.ts',
      ],
    },

    // Test environment configuration
    globals: true,
    environment: 'node',

    // Test timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,

    // Parallel execution for faster tests
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },

    // Reporter configuration
    reporters: ['verbose', 'json', 'html'],
    outputFile: {
      json: './artifacts/test-results/vitest-results.json',
      html: './artifacts/test-results/index.html',
    },

    // File watching configuration
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/artifacts/**',
      '**/.turbo/**',
    ],

    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Snapshot configuration
    resolveSnapshotPath: (testPath, snapExtension) => {
      return path.join(
        path.dirname(testPath),
        '__snapshots__',
        path.basename(testPath) + snapExtension
      );
    },
  },

  // Resolve aliases for imports
  resolve: {
    alias: {
      '@intelliflow/domain': path.resolve(__dirname, './packages/domain/src'),
      '@intelliflow/validators': path.resolve(__dirname, './packages/validators/src'),
      '@intelliflow/db': path.resolve(__dirname, './packages/db/src'),
      '@test-utils': path.resolve(__dirname, './tests/utils'),
      '@test-mocks': path.resolve(__dirname, './tests/mocks'),
    },
  },
});
