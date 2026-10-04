/**
 * Tests for scripts/lib/preship-test-scope.mjs — which tests the local pre-ship
 * gate runs. The classifier is pure; `resolveTestScope` runs against a real
 * throwaway git repo in os.tmpdir() so the diff logic is exercised for real.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  classifyChangedFiles,
  resolveTestScope,
  scopeFromEnvOrResolve,
  MAX_RELATED_CHARS,
  SCOPE_ENV,
  parseNameStatus,
  testsReferencingChanges,
} from '../lib/preship-test-scope.mjs';

describe('classifyChangedFiles', () => {
  it('selects changed source files for a related run', () => {
    const r = classifyChangedFiles([
      'apps/web/src/components/email/EmailList.tsx',
      'packages/domain/src/lead.ts',
      'README.md',
    ]);
    expect(r.scope).toBe('related');
    expect(r.files).toEqual([
      'apps/web/src/components/email/EmailList.tsx',
      'packages/domain/src/lead.ts',
    ]);
  });

  it('is none when no source file changed', () => {
    const r = classifyChangedFiles([
      'README.md',
      'docs/guide.ts',
      'artifacts/x.js',
      '.github/a.yml',
    ]);
    expect(r.scope).toBe('none');
    expect(r.files).toEqual([]);
  });

  it.each([
    'pnpm-lock.yaml',
    'package.json',
    'apps/api/package.json',
    'vitest.config.ts',
    'apps/web/vitest.setup.ts',
    'tsconfig.base.json',
    'packages/db/prisma/schema.prisma',
    'tests/integration/setup.ts',
    'apps/api/src/test/setup.ts',
  ])('falls back to the full suite when %s changes', (file) => {
    const r = classifyChangedFiles(['packages/domain/src/lead.ts', file]);
    expect(r.scope).toBe('full');
    expect(r.reason).toContain(file);
  });

  it('falls back to the full suite when the path list exceeds the argv/env budget', () => {
    // A budget on CHARACTERS, not file count: 350 long paths overflow it.
    const long = 'apps/web/src/components/some-deeply/nested/feature-area/component-name';
    const many = Array.from({ length: 350 }, (_, i) => `${long}-${i}.tsx`);
    expect(many.join('').length).toBeGreaterThan(MAX_RELATED_CHARS);
    const r = classifyChangedFiles(many);
    expect(r.scope).toBe('full');
    expect(r.reason).toContain('budget');
  });

  it('keeps a related run when many short paths fit the budget', () => {
    const many = Array.from({ length: 450 }, (_, i) => `packages/x/src/f${i}.ts`);
    expect(classifyChangedFiles(many).scope).toBe('related');
  });

  it('normalises Windows separators and de-duplicates', () => {
    const r = classifyChangedFiles(['packages\\a\\src\\x.ts', 'packages/a/src/x.ts']);
    expect(r.files).toEqual(['packages/a/src/x.ts']);
  });
});

// ─── resolveTestScope against a real repo ─────────────────────────────────

const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
});

/** git without the hook-exported GIT_* vars that would redirect it to the real repo. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(root: string, rel: string, body = 'export const x = 1;\n') {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

/** A repo whose `main` branch plays origin/main, with a feature branch checked out. */
function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-scope-'));
  tmpRoots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'packages/a/src/base.ts');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'checkout', '-q', '-b', 'feature');
  return root;
}

const LOCAL_ENV = { PATH: process.env.PATH } as NodeJS.ProcessEnv;

describe('resolveTestScope', () => {
  it('is always full under CI', () => {
    const r = resolveTestScope({ cwd: os.tmpdir(), env: { CI: 'true' } });
    expect(r.scope).toBe('full');
  });

  it('is full when PRESHIP_FULL_TESTS=1', () => {
    const r = resolveTestScope({ cwd: os.tmpdir(), env: { PRESHIP_FULL_TESTS: '1' } });
    expect(r.scope).toBe('full');
  });

  it('is full when the base ref cannot be resolved', () => {
    const root = makeRepo();
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'no-such-ref' });
    expect(r.scope).toBe('full');
    expect(r.reason).toContain('merge-base');
  });

  it('covers committed, unstaged and untracked changes since the merge-base', () => {
    const root = makeRepo();
    write(root, 'packages/a/src/committed.ts');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'feat');
    write(root, 'packages/a/src/base.ts', 'export const x = 2;\n'); // unstaged edit
    write(root, 'packages/a/src/untracked.ts'); // untracked file

    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('related');
    expect(r.files).toEqual([
      'packages/a/src/base.ts',
      'packages/a/src/committed.ts',
      'packages/a/src/untracked.ts',
    ]);
  });

  it('is none for a docs-only branch', () => {
    const root = makeRepo();
    write(root, 'README.md', '# hi\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'docs');
    expect(resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' }).scope).toBe('none');
  });
});

describe('scopeFromEnvOrResolve', () => {
  it('uses the scope pre-ship handed down', () => {
    const handed = { scope: 'related', reason: 'x', files: ['a.ts'], base: null };
    const r = scopeFromEnvOrResolve({
      cwd: os.tmpdir(),
      env: { [SCOPE_ENV]: JSON.stringify(handed) },
    });
    expect(r).toEqual(handed);
  });

  it('never narrows on a malformed hand-off — it resolves afresh', () => {
    const r = scopeFromEnvOrResolve({
      cwd: os.tmpdir(),
      env: { [SCOPE_ENV]: '{"scope":"none"', CI: 'true' },
    });
    expect(r.scope).toBe('full');
  });
});

// ─── Copilot review on #754: inputs the import graph cannot see ──────────

describe('classifyChangedFiles — review regressions', () => {
  it('selects JSON data modules (tests import pricing-data.json, team-data.json)', () => {
    const r = classifyChangedFiles(['apps/web/src/data/pricing-data.json']);
    expect(r.scope).toBe('related');
    expect(r.files).toEqual(['apps/web/src/data/pricing-data.json']);
  });

  it('runs the full suite for a migration-only change (rls-migrations reads SQL from disk)', () => {
    const r = classifyChangedFiles([
      'packages/db/prisma/migrations/20261001120000_tenant_memberships/migration.sql',
    ]);
    expect(r.scope).toBe('full');
  });

  it.each([
    'apps/web/vitest.setup.ts', // referenced only by a setupFiles string
    'packages/domain/src/lead.ts',
    'apps/web/src/data/team-data.json',
  ])('runs the full suite when %s is deleted', (file) => {
    const r = classifyChangedFiles([], { deleted: [file] });
    expect(r.scope).toBe('full');
    expect(r.reason).toContain(file);
  });

  it('ignores deleted docs', () => {
    expect(classifyChangedFiles([], { deleted: ['docs/old.md'] }).scope).toBe('none');
  });

  it('adds tests that reach changed tooling by path', () => {
    const r = classifyChangedFiles(['scripts/pre-ship.mjs'], {
      referencingTests: ['scripts/__tests__/preship-attest.test.ts'],
    });
    expect(r.files).toEqual(['scripts/__tests__/preship-attest.test.ts', 'scripts/pre-ship.mjs']);
  });
});

describe('testsReferencingChanges', () => {
  const tests = new Map([
    [
      'scripts/__tests__/preship-attest.test.ts',
      "fs.copyFileSync(PRESHIP, 'scripts/pre-ship.mjs')",
    ],
    [
      'scripts/__tests__/check-diff-coverage.test.ts',
      "spawnSync('node', [SCRIPT]) // check-diff-coverage.mjs",
    ],
    ['packages/domain/src/lead.test.ts', "import { Lead } from './lead'"],
  ]);

  it('finds the tests that name a changed scripts/ or tools/ file', () => {
    expect(testsReferencingChanges(['scripts/pre-ship.mjs'], tests)).toEqual([
      'scripts/__tests__/preship-attest.test.ts',
    ]);
    expect(testsReferencingChanges(['scripts/check-diff-coverage.mjs'], tests)).toEqual([
      'scripts/__tests__/check-diff-coverage.test.ts',
    ]);
  });

  it('does not select tests that name nothing changed', () => {
    expect(testsReferencingChanges(['packages/domain/src/other.ts'], tests)).toEqual([]);
  });

  // Code review on #754: tests read docs, hooks and data by path anywhere in the repo.
  it.each([
    [
      'docs/planning/compliance-calendar.json',
      'apps/web/src/app/api/compliance/__tests__/compliance-calendar.integrity.test.ts',
      "readFileSync(join(root, 'docs/planning/compliance-calendar.json'))",
    ],
    [
      'docs/design/PAGE_MAP_AND_FLOWS.md',
      'apps/web/src/app/__tests__/sitemap-reconciliation.test.ts',
      "path.resolve(__dirname, '../../../../../docs/design/PAGE_MAP_AND_FLOWS.md')",
    ],
    [
      'docs/design/information-architecture.md',
      'apps/web/src/app/__tests__/ia-reconciliation.test.ts',
      "const DIR = path.resolve(__dirname, '../../../../../docs/design')",
    ],
    [
      '.claude/hooks/git-destructive-guard.mjs',
      'tools/scripts/__tests__/git-destructive-guard.test.ts',
      "const HOOK = path.join(ROOT, '.claude/hooks', 'git-destructive-guard.mjs')",
    ],
  ])('selects the test that reads %s by path', (changed, testPath, testBody) => {
    expect(testsReferencingChanges([changed], new Map([[testPath, testBody]]))).toEqual([testPath]);
  });

  it('a docs-only change that a test reads is related, not none', () => {
    const r = classifyChangedFiles(['docs/design/PAGE_MAP_AND_FLOWS.md'], {
      referencingTests: ['apps/web/src/app/__tests__/sitemap-reconciliation.test.ts'],
    });
    expect(r.scope).toBe('related');
    expect(r.files).toEqual(['apps/web/src/app/__tests__/sitemap-reconciliation.test.ts']);
  });
});

describe('parseNameStatus', () => {
  it('reads NUL-separated modifications, deletions and renames', () => {
    expect(parseNameStatus('M\0a.ts\0D\0b.ts\0R087\0old.ts\0new.ts\0')).toEqual([
      { status: 'M', path: 'a.ts' },
      { status: 'D', path: 'b.ts' },
      { status: 'R', path: 'new.ts', from: 'old.ts' },
    ]);
  });
});

describe('resolveTestScope — layered changes against a real repo', () => {
  it('keeps a committed change even when an unstaged edit restores the base content', () => {
    const root = makeRepo();
    write(root, 'packages/a/src/base.ts', 'export const x = 2;\n');
    git(root, 'commit', '-q', '-am', 'change base');
    write(root, 'packages/a/src/base.ts'); // working tree back to the base content
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('related');
    expect(r.files).toEqual(['packages/a/src/base.ts']);
  });

  it('runs the full suite when a committed change deletes a global-impact file', () => {
    const root = makeRepo();
    write(root, 'apps/web/vitest.setup.ts');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'setup on feature');
    git(root, 'checkout', '-q', 'main');
    git(root, 'merge', '-q', '--ff-only', 'feature');
    git(root, 'checkout', '-q', 'feature');
    git(root, 'rm', '-q', 'apps/web/vitest.setup.ts');
    git(root, 'commit', '-q', '-m', 'drop setup');
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('full');
    expect(r.reason).toContain('apps/web/vitest.setup.ts');
  });

  it('runs the full suite for a staged-only deletion of a source file', () => {
    const root = makeRepo();
    git(root, 'rm', '-q', 'packages/a/src/base.ts');
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('full');
  });
});

describe('resolveTestScope — paths git would quote', () => {
  it('returns a non-ASCII path literally, so it is selected and exists', () => {
    const root = makeRepo();
    write(root, 'packages/a/src/café.ts');
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('related');
    expect(r.files).toEqual(['packages/a/src/café.ts']);
    expect(fs.existsSync(path.join(root, r.files[0]))).toBe(true);
  });
});

describe('round-2 review regressions', () => {
  it('does not select tests by a generic file name such as index.ts', () => {
    const tests = new Map([['a/x.test.ts', "import { y } from './index.ts'"]]);
    expect(testsReferencingChanges(['packages/q/src/index.ts'], tests)).toEqual([]);
    // ...but still by its path.
    const byPath = new Map([['a/y.test.ts', "read('packages/q/src/index.ts')"]]);
    expect(testsReferencingChanges(['packages/q/src/index.ts'], byPath)).toEqual(['a/y.test.ts']);
  });

  it('changes the worktree fingerprint when an already-changed file is edited again', () => {
    const root = makeRepo();
    write(root, 'packages/a/src/base.ts', 'export const x = 2;\n');
    const first = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    write(root, 'packages/a/src/base.ts', 'export const x = 3;\n');
    const second = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(second.files).toEqual(first.files);
    expect(second.worktree).not.toBe(first.worktree);
  });
});

describe('round-3 review regressions', () => {
  it("ignores the gate's own tracked outputs: no selection, stable fingerprint", () => {
    const root = makeRepo();
    write(root, 'artifacts/coverage/lcov.info', 'TN:\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'tracked gate output');
    const before = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(before.scope).toBe('none');
    // A gate run rewrites the tracked output; nothing about the change moved.
    write(root, 'artifacts/coverage/lcov.info', 'TN:\nSF:x\n');
    const after = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(after.scope).toBe('none');
    expect(after.worktree).toBe(before.worktree);
  });
});
