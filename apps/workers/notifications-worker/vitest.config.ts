import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Resolve workspace packages from source so tests are not coupled to a
// pre-built dist/. Without these aliases, a clean CI checkout has no dist/
// for @intelliflow/platform (which email.ts re-exports at the top level),
// causing "Cannot find module" before any test runs.
const monorepoRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  resolve: {
    alias: [
      // Sub-path exports must come BEFORE the bare specifier alias or Vite
      // will match the shorter pattern first and resolve the wrong file.
      {
        find: /^@intelliflow\/platform\/resilience$/,
        replacement: path.resolve(monorepoRoot, 'packages/platform/src/resilience/index.ts'),
      },
      {
        find: /^@intelliflow\/platform\/queues\/types$/,
        replacement: path.resolve(monorepoRoot, 'packages/platform/src/queues/types.ts'),
      },
      {
        find: /^@intelliflow\/platform\/queues\/connection$/,
        replacement: path.resolve(monorepoRoot, 'packages/platform/src/queues/connection.ts'),
      },
      {
        find: /^@intelliflow\/platform\/queues$/,
        replacement: path.resolve(monorepoRoot, 'packages/platform/src/queues/index.ts'),
      },
      {
        find: '@intelliflow/platform',
        replacement: path.resolve(monorepoRoot, 'packages/platform/src/index.ts'),
      },
      {
        find: '@intelliflow/worker-shared',
        replacement: path.resolve(monorepoRoot, 'apps/workers/shared/src/index.ts'),
      },
      {
        find: '@intelliflow/observability',
        replacement: path.resolve(monorepoRoot, 'packages/observability/src/index.ts'),
      },
      {
        find: '@intelliflow/domain',
        replacement: path.resolve(monorepoRoot, 'packages/domain/src/index.ts'),
      },
    ],
  },
  test: {
    name: 'notifications-worker',
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

    // Memory management
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
