import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Resolve the three worker packages from source so tests do not depend on a
// pre-built dist/ (a clean CI checkout has none). main.test.ts mocks them, so
// the heavy sources are never actually loaded.
const monorepoRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@intelliflow/api/dist/background-jobs.js',
        replacement: path.resolve(monorepoRoot, 'apps/api/src/background-jobs.ts'),
      },
      {
        find: '@intelliflow/ai-worker',
        replacement: path.resolve(monorepoRoot, 'apps/ai-worker/src/index.ts'),
      },
      {
        find: '@intelliflow/events-worker',
        replacement: path.resolve(monorepoRoot, 'apps/workers/events-worker/src/main.ts'),
      },
      {
        find: '@intelliflow/ingestion-worker',
        replacement: path.resolve(monorepoRoot, 'apps/workers/ingestion-worker/src/main.ts'),
      },
    ],
  },
  test: {
    name: 'combined-worker',
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
    forceExit: process.env['COVERAGE_RUN'] !== '1',

    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
