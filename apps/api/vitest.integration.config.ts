import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * The api's *.integration.test.ts suites (#1216). The api unit project excludes them
 * (vitest.config.ts) because they need real services, and no project collected them, so
 * they never ran. This project runs them in the CI Integration Tests job, which provides
 * Postgres and Redis. No global mock setup file: these suites bring their own.
 */
export default defineConfig({
  test: {
    name: 'api-integration',
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts', 'scripts/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist', '.turbo'],
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    pool: 'forks',
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
