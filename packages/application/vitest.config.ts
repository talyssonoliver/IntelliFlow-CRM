import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'application',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],

    // Memory optimization (Vitest v4)
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    unstubGlobals: true,
    unstubEnvs: true,

    // Pool and isolation
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
  },
  resolve: {
    alias: {
      '@intelliflow/application': path.resolve(__dirname, './src'),
    },
  },
});
