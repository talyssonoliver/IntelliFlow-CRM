import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'api',
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.turbo',
      // Integration tests require seeded database - run with pnpm test:integration
      '**/*.integration.test.ts',
    ],

    // Memory optimization
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    // CRITICAL: Restore stubbed globals/envs after each test (Vitest v4)
    unstubGlobals: true,
    unstubEnvs: true,

    // Use forks pool for better memory isolation
    pool: 'forks',
    isolate: true,

    // Memory management - control heap size per worker
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Prevent hanging
    forceExit: true,

    // Disable caching to prevent stale state accumulation
    cache: false,

    // Timeouts to prevent hung tests
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    // Handle worker exit errors gracefully
    onUnhandledError(error): boolean | void {
      const msg = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : '';
      if (msg.includes('Worker exited unexpectedly') ||
          msg.includes('vitest-pool') ||
          msg.includes('[vitest-pool]')) {
        return false;
      }
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'src/test/**',
        // Pure re-export barrel files (no testable logic, just exports)
        'src/index.ts',
        'src/agent/index.ts',
        'src/security/index.ts',
        'src/services/index.ts',
        'src/security/audit/handlers/index.ts',
        // Deprecated re-export file
        'src/security/audit-logger.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
