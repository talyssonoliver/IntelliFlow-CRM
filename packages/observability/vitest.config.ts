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
    forceExit: true,
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
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'artifacts/coverage',
      exclude: ['dist/', '**/*.config.ts', '**/*.d.ts'],
    },
  },
});
