import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Dedicated vitest config for the ENG-OPS-002.R13 / QUAL-012 flaky-test skip gate.
 *
 * Same rationale as `tools/scripts/__tests__/docs-integrity.vitest.config.ts`:
 *   1. Coverage — the root config excludes `tools/**` from global coverage, so
 *      the ≥90% AC for `flaky-test-skip-gate.ts` needs a scoped `include` +
 *      `thresholds` here.
 *   2. Build-free CI — the gate and its test import only Node built-ins plus
 *      `typescript` (already a root devDependency), so this config drops
 *      setupFiles and the gate's CI job can run WITHOUT a library build.
 *
 * Run: `pnpm test:flaky-test-gate` (also invoked by CI's `lint` job).
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export default defineConfig({
  test: {
    root: repoRoot,
    globals: true,
    environment: 'node',
    include: ['tools/scripts/__tests__/flaky-test-skip-gate.test.ts'],
    coverage: {
      provider: 'istanbul',
      enabled: true,
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: path.join(repoRoot, 'artifacts', 'coverage', 'eng-ops-002-r13'),
      include: ['tools/scripts/flaky-test-skip-gate.ts'],
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
