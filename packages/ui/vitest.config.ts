import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Type assertion needed due to vite version mismatch between
  // @vitejs/plugin-react (vite@6.x) and vitest (vite@7.x)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  test: {
    name: 'ui',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],

    // Memory optimization (Vitest v4)
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    unstubGlobals: true,
    unstubEnvs: true,

    // Pool and isolation
    pool: 'forks',
    isolate: true,
    forceExit: true,
    cache: false,

    // Memory management
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
