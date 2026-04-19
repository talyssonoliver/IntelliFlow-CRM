import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Allow tests to resolve @intelliflow/platform workspace packages
      // directly from source before `pnpm install` has created the symlinks.
      '@intelliflow/platform/feature-flags': path.resolve(
        __dirname,
        '../../packages/platform/src/feature-flags/index.ts'
      ),
      '@intelliflow/platform': path.resolve(__dirname, '../../packages/platform/src/index.ts'),
      // Resolve @opentelemetry/api through the workspace symlink so ALL modules
      // (including @opentelemetry/sdk-trace-base) share the same singleton.
      '@opentelemetry/api': path.resolve(__dirname, 'node_modules/@opentelemetry/api'),
    },
  },
  test: {
    name: 'ai-worker',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.turbo',
      // OTel tracing integration tests require real @opentelemetry/api global
      // singletons. Other test files mock @opentelemetry/api, and vitest's fork
      // reuse contaminates the global state (Symbol.for('opentelemetry.js.api.1')).
      // These pass individually: pnpm --filter @intelliflow/ai-worker exec vitest run src/tracing/__tests__/
      'src/tracing/__tests__/**',
    ],

    pool: 'forks',

    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,
    minWorkers: 1,

    // Cleanup between tests
    restoreMocks: true,
    clearMocks: true,
    resetMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,

    // Timeouts - AI tests may need longer
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    // Prevent hanging and stale state (disabled during coverage runs to allow Istanbul write)
    forceExit: process.env['COVERAGE_RUN'] !== '1',
    cache: false,

    // Handle worker exit errors gracefully
    onUnhandledError(error): boolean | void {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message)
          : '';
      if (
        msg.includes('Worker exited unexpectedly') ||
        msg.includes('vitest-pool') ||
        msg.includes('[vitest-pool]')
      ) {
        return false;
      }
    },

    // Using Istanbul provider: V8 with pool:forks creates one tmp file per test
    // file, and the V8 merge hangs before forceExit kills it.
    // Istanbul uses maxWorkers tmp files (4) — merges fast.
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'src/index.ts',
        'src/examples/**',
        'src/scripts/**',
      ],
    },
  },
});
