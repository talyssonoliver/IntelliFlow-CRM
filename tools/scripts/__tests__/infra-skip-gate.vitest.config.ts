import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Dedicated vitest config for the runtime silent-skip gate (#658 — ADR-054 §9).
 *
 * Same rationale as `flaky-test-skip-gate.vitest.config.ts`:
 *   1. Coverage — the root config excludes `tools/**` from global coverage, so the
 *      ≥90% AC for `infra-skip-gate.ts` needs a scoped `include` + `thresholds` here.
 *   2. Build-free CI — the gate and its test import only Node built-ins, so this
 *      config drops setupFiles and the gate's job runs WITHOUT a library build.
 *
 * Run: `pnpm test:infra-skip-gate`.
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export default defineConfig({
  test: {
    root: repoRoot,
    globals: true,
    environment: 'node',
    include: ['tools/scripts/__tests__/infra-skip-gate.test.ts'],
    coverage: {
      provider: 'istanbul',
      enabled: true,
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: path.join(repoRoot, 'artifacts', 'coverage', 'issue-658-skip-gate'),
      include: ['tools/scripts/infra-skip-gate.ts'],
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
