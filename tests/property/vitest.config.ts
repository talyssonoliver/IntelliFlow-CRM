import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest project: `property`.
 *
 * Runs fast-check property, model-based, and race-condition tests under
 * `tests/property/**` matching `*.prop.test.ts`. Tier (run count) is controlled
 * by `FC_TIER` (smoke|standard|stress) — see `support/config.ts`.
 *
 * Resolves `@intelliflow/domain` to source (vite-friendly, avoids the stale-dist
 * gotcha for pure-domain properties). Infra packages (`@intelliflow/db`, etc.)
 * resolve to their built workspace packages — db-concurrency tests construct
 * raw clients lazily and skip when no database is configured.
 */
const monorepoRoot = path.resolve(__dirname, '..', '..');

export default defineConfig({
  resolve: {
    alias: {
      '@intelliflow/domain': path.resolve(monorepoRoot, 'packages/domain/src'),
      // Source-resolved so RED->GREEN fix cycles need no rebuild (vite-friendly: no .js imports).
      '@intelliflow/webhooks': path.resolve(monorepoRoot, 'packages/webhooks/src'),
      // db resolves to source so concurrency tests get the real Prisma client + adapter.
      '@intelliflow/db': path.resolve(monorepoRoot, 'packages/db/src'),
      '@intelliflow/adapters': path.resolve(monorepoRoot, 'packages/adapters/src'),
    },
  },
  test: {
    name: 'property',
    root: __dirname,
    globals: true,
    environment: 'node',
    include: ['**/*.prop.test.ts'],
    exclude: ['node_modules', 'dist', 'support/**'],
    setupFiles: ['./support/setup.ts'],

    // Match the repo-wide memory/isolation discipline (Vitest v4).
    pool: 'forks',
    isolate: true,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    unstubGlobals: true,
    unstubEnvs: true,
    cache: false,

    execArgv: ['--max-old-space-size=4096', '--expose-gc'],
    maxWorkers: 4,

    // Property tests run many generated cases + real-DB interleavings — allow headroom.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    teardownTimeout: 10_000,
  },
});
