import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'api',
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.turbo',
      // Integration tests require seeded services (Postgres, Redis, OTel) and
      // run via `pnpm test:integration` in the Integration Tests CI job which
      // provisions those services as runner containers. Tests covered by this
      // pattern (and the rationale for each, so future authors keep using
      // the .integration.test.ts naming convention):
      //   - *.redis.integration.test.ts: requires REDIS_URL pointing at a
      //     real Redis instance (the publisher-shape round-trip can't run
      //     against the unit-test mocks)
      //   - capture-trace-examples.integration.test.ts: requires a real
      //     @opentelemetry/api span exporter (the unit-test setup stubs out
      //     the OTel module globally)
      '**/*.integration.test.ts',
    ],

    // Memory optimization
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    // CRITICAL: Restore stubbed globals/envs after each test (Vitest v4)
    unstubGlobals: true,
    unstubEnvs: true,

    pool: 'forks',

    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Prevent hanging (disabled during coverage runs to allow Istanbul to write output)
    forceExit: process.env['COVERAGE_RUN'] !== '1',

    // Disable caching to prevent stale state accumulation
    cache: false,

    // Timeouts to prevent hung tests
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    // Handle worker exit errors gracefully
    onUnhandledError(error): boolean | void {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message)
          : '';
      if (
        msg.includes('Worker exited unexpectedly') ||
        msg.includes('vitest-pool') ||
        msg.includes('[vitest-pool]')
      ) {
        return false;
      }
    },

    coverage: {
      provider: 'istanbul',
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
