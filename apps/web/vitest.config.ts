import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { existsSync } from 'node:fs';

// When running from a git worktree without its own node_modules (e.g. .claude/worktrees/),
// vite cannot resolve Next.js or UI packages via the standard node_modules walk.
// These aliases point at checked-in stubs so tests can run in that context.
// In the main project (where apps/web/node_modules exists) these aliases are skipped.
const hasLocalNodeModules = existsSync(path.resolve(__dirname, './node_modules'));
const worktreeStubAliases = hasLocalNodeModules
  ? []
  : [
      { find: /^next\/link$/, replacement: path.resolve(__dirname, './src/test/__mocks__/next-link-stub.tsx') },
      { find: /^@intelliflow\/ui$/, replacement: path.resolve(__dirname, './src/test/__mocks__/intelliflow-ui-stub.tsx') },
      { find: /^server-only$/, replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts') },
    ];

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

    pool: 'forks', // Do not change to vmForks/threads — causes vi.mock() conflicts

    execArgv: ['--max-old-space-size=4096', '--expose-gc', '--no-experimental-webstorage'],
    maxWorkers: 4,
    // @ts-expect-error minWorkers exists at runtime but not in types
    minWorkers: 1,

    // Disable caching to prevent stale state accumulation
    cache: false,

    // Timeouts to prevent hung tests
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,

    // Force exit after tests complete to prevent hanging (disabled during coverage runs
    // to allow Istanbul to finish writing coverage-final.json before process exits)
    forceExit: process.env['COVERAGE_RUN'] !== '1',

    // Coverage configuration
    // Using Istanbul provider (not V8) because V8 with pool:forks creates one
    // tmp file per test file (~393 files), and the V8 merge process hangs before
    // forceExit kills it. Istanbul uses maxWorkers tmp files (4) — merges fast.
    coverage: {
      provider: 'istanbul',
      // Write coverage even when some tests fail
      reportOnFailure: true,
    },

    // Handle worker exit errors gracefully - uses generic type to match Vitest's callback signature
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
  },
  resolve: {
    alias: [
      // Stub CSS-only imports that break in test env
      {
        find: /^@scalar\/api-reference-react\/style\.css$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts'),
      },
      {
        find: /^@schedule-x\/theme-default\/dist\/index\.css$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts'),
      },
      // Stub temporal polyfill side-effect import
      {
        find: /^temporal-polyfill\/global$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts'),
      },
      {
        find: /^@scalar\/api-reference-react$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/scalar-stub.ts'),
      },
      // Stub @trpc/react-query to prevent loading the @tanstack/react-query
      // module graph. @tanstack/react-query registers focusManager + onlineManager
      // on window with addEventListener, which hold QueryClient references and
      // prevent GC between tests. This is a belt-and-suspenders stub in case
      // any module imports @trpc/react-query without being covered by vi.mock().
      {
        find: /^@trpc\/react-query$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/trpc-react-query-stub.ts'),
      },
      {
        find: /^@intelliflow\/api$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts'),
      },
      // Stub @intelliflow/api subpath imports used by trpc-server.ts.
      // The api package has no "exports" subpath map, so Vite's import-analysis
      // plugin cannot resolve these at transform time. Stubbing prevents the
      // transform failure when trpc-server.ts is loaded transitively in tests.
      {
        find: /^@intelliflow\/api\/.+$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts'),
      },
      {
        find: /^@intelliflow\/api-client$/,
        replacement: path.resolve(__dirname, './src/test/__mocks__/empty.ts'),
      },
      ...worktreeStubAliases,
      { find: '@/components', replacement: path.resolve(__dirname, './src/components') },
      { find: '@/lib', replacement: path.resolve(__dirname, './src/lib') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
