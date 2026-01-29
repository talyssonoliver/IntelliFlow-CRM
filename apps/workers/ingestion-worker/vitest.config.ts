import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ingestion-worker',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],

    // Memory optimization
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    unstubGlobals: true,
    unstubEnvs: true,

    pool: 'forks',
    isolate: true,
    cache: false,
    forceExit: true,

    // Memory management
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
