import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'orchestration',
    root: '.',
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    pool: 'forks',
    reporters: ['default'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
