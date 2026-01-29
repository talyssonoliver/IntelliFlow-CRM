import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'architecture',
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
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
  },
});
