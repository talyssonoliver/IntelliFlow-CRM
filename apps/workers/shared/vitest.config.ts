import { defineConfig } from 'vitest/config';

export default defineConfig({
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
