import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ai-worker',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.turbo'],

    pool: 'forks',

    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Cleanup between tests
    restoreMocks: true,
    clearMocks: true,
    resetMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,

    // Timeouts - AI tests may need longer
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    // Prevent hanging and stale state (disabled during coverage runs to allow Istanbul write)
    forceExit: process.env['COVERAGE_RUN'] !== '1',
    cache: false,

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

    // Using Istanbul provider: V8 with pool:forks creates one tmp file per test
    // file, and the V8 merge hangs before forceExit kills it.
    // Istanbul uses maxWorkers tmp files (4) — merges fast.
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'src/index.ts',
        'src/examples/**',
        'src/scripts/**',
      ],
    },
  },
});
