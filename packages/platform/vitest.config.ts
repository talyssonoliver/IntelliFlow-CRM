import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'platform',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', '__tests__/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
  },
});
