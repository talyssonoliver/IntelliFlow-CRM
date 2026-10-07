/**
 * The global coverage include/exclude in vitest.config.ts decides what reaches
 * the merged lcov Sonar reads. Vitest matches those globs with picomatch
 * `contains: true` against ABSOLUTE file paths, so an unanchored 'tools/**'
 * matches every directory named tools — it once silently dropped
 * apps/api/src/agent/tools/** (product code with its own tests) from coverage,
 * and Sonar scored it 0%. This replays Vitest's own matcher over real paths.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import config from '../../vitest.config';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// picomatch is Vitest's dependency, not the root package's: resolve it the way
// Vitest does.
const requireFromVitest = createRequire(createRequire(import.meta.url).resolve('vitest'));
const pm = requireFromVitest('picomatch') as {
  isMatch: (s: string, p: string[], o: object) => boolean;
};

const coverage = (config as { test: { coverage: { include: string[]; exclude: string[] } } }).test
  .coverage;

/** Vitest 4 BaseCoverageProvider.isIncluded, minus the cache. */
const isIncluded = (rel: string) =>
  pm.isMatch(path.join(REPO_ROOT, rel).split(path.sep).join('/'), coverage.include, {
    contains: true,
    dot: true,
    ignore: coverage.exclude,
  });

describe('vitest.config.ts coverage scope', () => {
  it.each([
    ['scripts/lib/diff-coverage.mjs', true],
    ['scripts/run-coverage.js', true],
    ['tools/scripts/lib/contract-parser.ts', true],
    ['tools/scripts/security/vendored-js-lint.mjs', true],
    ['apps/api/src/agent/tools/search.ts', true],
    ['packages/domain/src/crm/lead/Lead.ts', true],
    ['scripts/__tests__/check-diff-coverage.test.ts', false],
    ['tools/scripts/__tests__/helper.ts', false],
    ['tools/scripts/k6/lib/redact.test.ts', false],
    ['tools/scripts/security/fixtures/sample.mjs', false],
    ['tools/eslint/sonar-guard.config.mjs', false],
    ['apps/project-tracker/lib/x.ts', true],
    ['apps/project-tracker/lib/__tests__/x.test.ts', false],
    ['apps/project-tracker/app/api/metrics/executive/route.ts', false],
    ['apps/project-tracker/components/Board.tsx', false],
  ])('%s → %s', (rel, expected) => {
    expect(isIncluded(rel)).toBe(expected);
  });

  it('anchors every tooling glob to the repo root', () => {
    const tooling = [...coverage.include, ...coverage.exclude].filter((g) =>
      /^(\*\*\/)?(scripts|tools)\//.test(g)
    );
    expect(tooling).toEqual([]);
  });
});
