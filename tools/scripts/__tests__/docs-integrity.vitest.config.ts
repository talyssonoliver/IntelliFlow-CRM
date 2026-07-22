import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Dedicated vitest config for the DOC-016 docs-integrity gate.
 *
 * Two reasons this exists rather than relying on the root config:
 *   1. Coverage — the root config excludes `tools/**` from global coverage, so
 *      the ≥90% AC for `docs-integrity-audit.ts` can only be enforced with a
 *      scoped `include` + `thresholds` here (same pattern as `pg195.vitest.config.ts`).
 *   2. Build-free CI — the root project loads `apps/api/src/test/setup.ts`,
 *      which imports the built `@intelliflow/db` dist. The audit tool and its
 *      test import only Node built-ins, so this config drops setupFiles and the
 *      docs-integrity CI job can run WITHOUT a library build (fast drift gate).
 *
 * Run: `pnpm test:docs-integrity` (also invoked by .github/workflows/docs-integrity.yml).
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export default defineConfig({
  test: {
    root: repoRoot,
    globals: true,
    environment: 'node',
    include: ['tools/scripts/__tests__/docs-integrity-audit.test.ts'],
    coverage: {
      provider: 'istanbul',
      enabled: true,
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: path.join(repoRoot, 'artifacts', 'coverage', 'doc-016'),
      include: ['tools/scripts/docs-integrity-audit.ts'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
      all: true,
      clean: true,
    },
  },
});
