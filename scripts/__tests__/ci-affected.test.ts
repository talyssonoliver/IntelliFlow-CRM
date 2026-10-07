/**
 * PR scope detection (scripts/ci/affected.mjs). The contract under test is the
 * safety one: anything we cannot prove is narrow runs the full suite, and a
 * package change always pulls in everything that depends on it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import {
  classify,
  outputLines,
  parseArgs,
  readWorkspacePackages,
  resolveScope,
  stepSummary,
  FULL_SHARDS,
} from '../ci/affected.mjs';

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

describe('resolveScope', () => {
  const quiet = () => {
    const lines: string[] = [];
    return {
      lines,
      log: { log: (m: string) => lines.push(m), error: (m: string) => lines.push(m) },
    };
  };

  it.each([['push'], ['merge_group'], ['schedule'], [undefined]])(
    'runs the full suite for event %s without diffing',
    (event) => {
      const diff = vi.fn();
      const r = resolveScope({ event }, PACKAGES, TESTS, diff, quiet().log);
      expect(r.mode).toBe('full');
      expect(r.reason).toBe(`event ${event ?? '(none)'} always runs the full suite`);
      expect(diff).not.toHaveBeenCalled();
    }
  );

  it('classifies the pull request diff between base and head', () => {
    const diff = vi.fn(() => ['packages/domain/src/lead.ts', '']);
    const { lines, log } = quiet();
    const r = resolveScope(
      { event: 'pull_request', base: 'b', head: 'h' },
      PACKAGES,
      TESTS,
      diff,
      log
    );
    expect(diff).toHaveBeenCalledWith('b', 'h');
    expect(r.mode).toBe('affected');
    expect(lines).toContain('Changed files (1):\npackages/domain/src/lead.ts');
  });

  it('falls back to the full suite when the diff fails', () => {
    const { lines, log } = quiet();
    const r = resolveScope(
      { event: 'pull_request', base: 'b', head: 'h' },
      PACKAGES,
      TESTS,
      () => {
        throw new Error('bad revision');
      },
      log
    );
    expect(r.mode).toBe('full');
    expect(lines[0]).toMatch(/^::warning::git diff b h failed; .*bad revision$/);
  });
});

describe('parseArgs', () => {
  it('reads --key value pairs', () => {
    expect(parseArgs(['--event', 'pull_request', '--base', 'abc', '--head', 'def'])).toEqual({
      event: 'pull_request',
      base: 'abc',
      head: 'def',
    });
  });
});

describe('outputLines and stepSummary', () => {
  it('writes every key the workflows read, for an affected run', () => {
    const r = run(['packages/domain/src/lead.ts']);
    const lines = outputLines(r);
    expect(lines).toContain('mode=affected');
    expect(lines).toContain('code=true');
    expect(lines).toContain(
      'turbo_filter=--filter=@intelliflow/web --filter=@x/application --filter=@x/domain'
    );
    expect(lines).toContain('test_paths=apps/web/ packages/application/ packages/domain/ tests/');
    expect(lines.find((l) => l.startsWith('shards='))).toBe(
      `shards=${JSON.stringify(Array.from({ length: r.shardTotal }, (_, i) => i + 1))}`
    );
    expect(stepSummary(r)).toContain(
      'Affected packages: @intelliflow/web, @x/application, @x/domain'
    );
  });

  it('reports code=false and no packages for a docs-only run', () => {
    const r = run(['docs/x.md']);
    expect(outputLines(r)).toEqual(
      expect.arrayContaining(['code=false', 'shards=[]', 'turbo_filter='])
    );
    expect(stepSummary(r)).toBe(
      '### CI scope: `none`\n\nno path a PR job tests changed (docs, e2e or property only)\n\nUnit shards: 0\n'
    );
  });
});

describe('readWorkspacePackages (fixture)', () => {
  it('expands globs, keeps plain entries and skips dirs with no named package.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-'));
    try {
      const write = (rel: string, body: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
      };
      write(
        'pnpm-workspace.yaml',
        "packages:\n  - 'apps/*' # apps\n  - \"tools/single\"\n  - 'missing/*'\n"
      );
      write(
        'apps/a/package.json',
        JSON.stringify({ name: 'a', dependencies: { b: '1', zod: '3' } })
      );
      write('apps/b/package.json', JSON.stringify({ name: 'b' }));
      write('apps/unnamed/package.json', JSON.stringify({ private: true }));
      fs.mkdirSync(path.join(root, 'apps/empty'), { recursive: true });
      write('apps/file.txt', 'not a dir');
      write(
        'tools/single/package.json',
        JSON.stringify({ name: 'single', devDependencies: { a: '1' } })
      );

      const pkgs = readWorkspacePackages(root);
      expect(pkgs.map((p: { name: string }) => p.name).sort()).toEqual(['a', 'b', 'single']);
      expect(pkgs.find((p: { name: string }) => p.name === 'a')?.deps).toEqual(['b']);
      expect(pkgs.find((p: { name: string }) => p.name === 'single')?.deps).toEqual(['a']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
