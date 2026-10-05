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
  isScriptsOnlyPackageJsonChange,
  resolveTestScope,
  scopeFromEnvOrResolve,
  MAX_RELATED_FILES,
  SCOPE_ENV,
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
    expect(r).toEqual({ scope: 'none', reason: 'no source files changed', files: [] });
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

  it('falls back to the full suite when the diff is too large to pass as argv', () => {
    const many = Array.from({ length: MAX_RELATED_FILES + 1 }, (_, i) => `packages/x/src/f${i}.ts`);
    expect(classifyChangedFiles(many).scope).toBe('full');
  });

  it('normalises Windows separators and de-duplicates', () => {
    const r = classifyChangedFiles(['packages\\a\\src\\x.ts', 'packages/a/src/x.ts']);
    expect(r.files).toEqual(['packages/a/src/x.ts']);
  });
});

describe('isScriptsOnlyPackageJsonChange', () => {
  const pkg = (o: object) => JSON.stringify(o, null, 2);

  it('is true when only scripts changed, whatever the key order', () => {
    expect(
      isScriptsOnlyPackageJsonChange(
        pkg({ name: 'x', version: '1.0.0', scripts: { test: 'vitest run' } }),
        pkg({
          scripts: { test: 'node wrap.mjs vitest run', lint: 'eslint .' },
          version: '1.0.0',
          name: 'x',
        })
      )
    ).toBe(true);
  });

  it('is false when anything outside scripts changed', () => {
    const before = pkg({ name: 'x', scripts: {}, devDependencies: { vitest: '4.1.0' } });
    expect(
      isScriptsOnlyPackageJsonChange(
        before,
        pkg({ name: 'x', scripts: {}, devDependencies: { vitest: '4.1.1' } })
      )
    ).toBe(false);
    expect(
      isScriptsOnlyPackageJsonChange(
        before,
        pkg({ name: 'x', scripts: {}, devDependencies: { vitest: '4.1.0' }, type: 'module' })
      )
    ).toBe(false);
  });

  it('is false for unparseable text, so it can only widen', () => {
    expect(isScriptsOnlyPackageJsonChange('{', pkg({ name: 'x' }))).toBe(false);
    expect(isScriptsOnlyPackageJsonChange(pkg({ name: 'x' }), 'null')).toBe(false);
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

  it('does not widen to full when a package.json changed only in scripts', () => {
    const root = makeRepo();
    write(root, 'package.json', JSON.stringify({ name: 'r', scripts: { test: 'vitest run' } }));
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'pkg');
    git(root, 'branch', '-f', 'main', 'HEAD');
    // Same fields in a different order, plus a scripts edit: still scripts-only.
    write(
      root,
      'package.json',
      JSON.stringify({ scripts: { test: 'node wrap.mjs vitest run' }, name: 'r' })
    );
    write(root, 'packages/a/src/changed.ts');
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('related');
    expect(r.files).toEqual(['packages/a/src/changed.ts']);
  });

  it('still widens to full when a package.json dependency changed', () => {
    const root = makeRepo();
    write(root, 'package.json', JSON.stringify({ name: 'r', dependencies: { zod: '^4.0.0' } }));
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'pkg');
    git(root, 'branch', '-f', 'main', 'HEAD');
    write(root, 'package.json', JSON.stringify({ name: 'r', dependencies: { zod: '^4.1.0' } }));
    const r = resolveTestScope({ cwd: root, env: LOCAL_ENV, baseRef: 'main' });
    expect(r.scope).toBe('full');
    expect(r.reason).toContain('package.json');
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
