import { defineConfig } from 'vitest/config';

// Local config: this package must not inherit the root `projects` array.
export default defineConfig({
  test: {
    name: 'partner-sdk',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', '__tests__/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
