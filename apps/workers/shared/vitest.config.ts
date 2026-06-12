import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // @intelliflow/observability has no built dist in dev/test environments.
      // Stub the two symbols that worker-shared source files import from it.
      '@intelliflow/observability': path.resolve(
        __dirname,
        'src/__tests__/__stubs__/observability.ts'
      ),
      '@intelliflow/platform/queues/types': path.resolve(
        __dirname,
        'src/__tests__/__stubs__/platform-queue-types.ts'
      ),
    },
  },
  test: {
    // Named so scripts/run-coverage.js can target it via --project=worker-shared.
    // Without a name, `vitest run --project=worker-shared` errors with
    // "No projects matched the filter" and the coverage runner sees an
    // unclassified early-crash.
    name: 'worker-shared',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
  },
});
