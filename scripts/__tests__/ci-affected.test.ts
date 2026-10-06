/**
 * PR scope detection (scripts/ci/affected.mjs). The contract under test is the
 * safety one: anything we cannot prove is narrow runs the full suite, and a
 * package change always pulls in everything that depends on it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { classify, readWorkspacePackages, FULL_SHARDS } from '../ci/affected.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PACKAGES = [
  { name: '@x/domain', dir: 'packages/domain', deps: [] },
  { name: '@x/application', dir: 'packages/application', deps: ['@x/domain'] },
  { name: '@intelliflow/web', dir: 'apps/web', deps: ['@x/application'] },
  { name: '@x/worker', dir: 'apps/workers/events-worker', deps: [] },
  { name: '@x/workers', dir: 'apps/workers', deps: [] },
];

const TESTS = [
  ...Array.from({ length: 10 }, (_, i) => `apps/web/src/a${i}.test.tsx`),
  ...Array.from({ length: 5 }, (_, i) => `packages/domain/src/d${i}.test.ts`),
  ...Array.from({ length: 3 }, (_, i) => `packages/application/src/p${i}.test.ts`),
  'apps/workers/events-worker/src/w.test.ts',
  'tests/architecture/layers.test.ts',
  'scripts/__tests__/s.test.ts',
  'tests/integration/db.test.ts',
  'tests/property/p.test.ts',
  'tests/e2e/smoke.spec.ts',
];

const run = (changed: string[]) => classify(changed, PACKAGES, TESTS);

describe('classify', () => {
  it.each([
    ['.github/workflows/ci.yml'],
    ['pnpm-lock.yaml'],
    ['package.json'],
    ['turbo.json'],
    ['tsconfig.base.json'],
    ['vitest.config.ts'],
    ['packages/typescript-config/base.json'],
    ['infra/terraform/main.tf'],
  ])('runs the full suite when %s changes', (file) => {
    const r = run(['apps/web/src/page.tsx', file]);
    expect(r.mode).toBe('full');
    expect(r.unit).toBe(true);
    expect(r.integration).toBe(true);
    expect(r.shardTotal).toBe(FULL_SHARDS);
  });

  it('runs the full suite when the diff is empty (detection could not see the change)', () => {
    expect(run([]).mode).toBe('full');
    expect(run(['', '  ']).mode).toBe('full');
  });

  it('does no work for a docs-only change', () => {
    const r = run([
      'README.md',
      'docs/guide/x.md',
      'apps/web/CLAUDE.md',
      'artifacts/reports/r.json',
    ]);
    expect(r).toMatchObject({
      mode: 'none',
      unit: false,
      integration: false,
      web: false,
      shardTotal: 0,
    });
  });

  it('includes every transitive dependent of a changed package', () => {
    const r = run(['packages/domain/src/lead.ts']);
    expect(r.mode).toBe('affected');
    expect(r.packages).toEqual(['@intelliflow/web', '@x/application', '@x/domain']);
    expect(r.testPaths).toEqual([
      'apps/web/',
      'packages/application/',
      'packages/domain/',
      'tests/',
    ]);
    expect(r.web).toBe(true);
    expect(r.integration).toBe(true);
  });

  it('maps a file to the deepest package directory, not its parent', () => {
    const r = run(['apps/workers/events-worker/src/handler.ts']);
    expect(r.packages).toEqual(['@x/worker']);
    expect(r.web).toBe(false);
  });

  it('sizes the shard matrix by the share of unit tests selected', () => {
    // 21 unit tests in total (integration, property and e2e excluded).
    expect(run(['apps/workers/events-worker/src/h.ts']).shardTotal).toBe(2); // worker + tests/architecture = 2/21
    expect(run(['packages/domain/src/x.ts']).shardTotal).toBe(19); // 19/21 of the tests -> ceil(18.1)
  });

  it('adds the script suites when repo scripts change', () => {
    const r = run(['scripts/ci/affected.mjs']);
    expect(r.mode).toBe('affected');
    expect(r.testPaths).toEqual(['scripts/', 'tests/', 'tools/scripts/']);
    expect(r.unit).toBe(true);
  });

  it('runs integration but no unit shard when only integration tests change', () => {
    const r = run(['tests/integration/db.test.ts']);
    expect(r).toMatchObject({ mode: 'affected', unit: false, integration: true, shardTotal: 0 });
  });
});

describe('readWorkspacePackages', () => {
  it('reads the real workspace with internal dependency edges only', () => {
    const pkgs = readWorkspacePackages(REPO_ROOT);
    const web = pkgs.find((p: { name: string }) => p.name === '@intelliflow/web');
    expect(web?.dir).toBe('apps/web');
    expect(web?.deps.length).toBeGreaterThan(0);
    for (const p of pkgs)
      for (const d of p.deps)
        expect(
          d.startsWith('@intelliflow/') || pkgs.some((q: { name: string }) => q.name === d)
        ).toBe(true);
  });
});
