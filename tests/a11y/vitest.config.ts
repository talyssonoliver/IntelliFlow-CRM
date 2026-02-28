import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const webRoot = path.resolve(__dirname, '../../apps/web');

export default defineConfig({
  // Type assertion needed due to vite version mismatch between
  // @vitejs/plugin-react (vite@6.x) and vitest (vite@7.x)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  test: {
    name: 'a11y',
    globals: true,
    environment: 'jsdom', // axe-core requires jsdom (not happy-dom)
    setupFiles: [path.resolve(__dirname, './setup.ts')],
    include: ['**/*.spec.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],

    // Resolve deps from apps/web where axe-core/vitest-axe are installed
    deps: {
      moduleDirectories: [
        'node_modules',
        path.resolve(webRoot, 'node_modules'),
      ],
    },

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

    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
  resolve: {
    alias: [
      // Stub uninstalled optional dependencies
      {
        find: /^@scalar\/api-reference-react\/style\.css$/,
        replacement: path.resolve(webRoot, 'src/test/__mocks__/empty.ts'),
      },
      {
        find: /^@scalar\/api-reference-react$/,
        replacement: path.resolve(webRoot, 'src/test/__mocks__/scalar-stub.ts'),
      },
      { find: '@intelliflow/ui', replacement: path.resolve(__dirname, '../../packages/ui/src') },
      { find: '@intelliflow/domain', replacement: path.resolve(__dirname, '../../packages/domain/src') },
      { find: '@/components', replacement: path.resolve(webRoot, 'src/components') },
      { find: '@/lib', replacement: path.resolve(webRoot, 'src/lib') },
      { find: '@', replacement: path.resolve(webRoot, 'src') },
    ],
  },
});
