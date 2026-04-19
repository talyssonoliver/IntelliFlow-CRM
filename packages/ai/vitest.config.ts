import { defineConfig } from 'vitest/config';

// Local vitest config so this package does NOT inherit the root `projects`
// array, which references workspace-relative paths (e.g. `apps/api/...`) that
// don't resolve from this package's cwd. The package currently ships no test
// files; Vitest exits 0 with a "No test files found" notice.
export default defineConfig({
  test: {
    name: 'ai',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
  },
});
