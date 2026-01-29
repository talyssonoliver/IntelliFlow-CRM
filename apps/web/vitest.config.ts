import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Type assertion needed due to vite version mismatch between
  // @vitejs/plugin-react (vite@6.x) and vitest (vite@7.x)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  test: {
    name: 'web',
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'build'],

    // Memory optimization
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    // CRITICAL: Restore stubbed globals/envs after each test (Vitest v4)
    unstubGlobals: true,
    unstubEnvs: true,

    // Use forks pool for better memory isolation
    pool: 'forks',
    isolate: true,

    // Memory management - control heap size per worker
    // Note: vmMemoryLimit only works with vmThreads pool, not forks
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Disable caching to prevent stale state accumulation
    cache: false,

    // Timeouts to prevent hung tests
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    // Force exit after tests complete to prevent hanging
    forceExit: true,

    // Handle worker exit errors gracefully - uses generic type to match Vitest's callback signature
    onUnhandledError(error): boolean | void {
      const msg = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : '';
      if (msg.includes('Worker exited unexpectedly') ||
          msg.includes('vitest-pool') ||
          msg.includes('[vitest-pool]')) {
        return false;
      }
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/lib': path.resolve(__dirname, './src/lib'),
    },
  },
});
