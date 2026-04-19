import { defineConfig } from 'vitest/config';

// Local vitest config so this package does NOT inherit the root `projects`
// array, which references workspace-relative paths (e.g. `apps/api/...`) that
// don't resolve from this package's cwd.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
  },
});
