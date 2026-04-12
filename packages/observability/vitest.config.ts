import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'observability',
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],

    // Memory optimization
    restoreMocks: true,
    clearMocks: true,
    resetMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,

    // Pool configuration
    pool: 'forks',
    isolate: true,
    forceExit: process.env['COVERAGE_RUN'] !== '1',
    cache: false,

    // Memory management
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory:
        process.env['COVERAGE_RUN'] === '1' ? 'artifacts/coverage' : 'artifacts/coverage-vitest',
      exclude: ['dist/', '**/*.config.ts', '**/*.d.ts'],
    },
  },
});
