import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Dedicated vitest config for PG-195 scoped coverage.
// Required because the root config excludes `tools/**` from global coverage,
// and the module under test is `.mjs` which Istanbul only instruments when
// the extensions are listed explicitly.
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export default defineConfig({
  test: {
    root: repoRoot,
    globals: true,
    environment: 'node',
    include: ['tools/scripts/__tests__/subset-material-symbols.test.ts'],
    coverage: {
      provider: 'istanbul',
      enabled: true,
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: path.join(repoRoot, 'artifacts', 'coverage', 'pg-195'),
      include: ['tools/scripts/subset-material-symbols.mjs'],
      extension: ['.mjs'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
      all: true,
      clean: true,
    },
  },
});
