/**
 * Tests for scripts/lib/preship-lint-scope.mjs — which files the local pre-ship
 * format-check, lint and lint-promises steps check.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

import {
  chunkArgs,
  classifyLintFiles,
  eslintGlobs,
  formatTargets,
  lintPlan,
  promisesPlan,
  resolveLintScope,
  runScopedLint,
  FULL_COMMAND,
  FULL_LINT_ENV,
} from '../lib/preship-lint-scope.mjs';

describe('classifyLintFiles', () => {
  it('keeps the changed files for a UI-only diff', () => {
    const r = classifyLintFiles([
      'apps/web/src/app/leads/page.tsx',
      'apps/web/src/components/LeadCard.tsx',
      'apps/web/src/components/LeadCard.tsx',
    ]);
    expect(r.scope).toBe('changed');
    expect(r.files).toEqual([
      'apps/web/src/app/leads/page.tsx',
      'apps/web/src/components/LeadCard.tsx',
    ]);
  });

  it.each([
    'package.json',
    'apps/web/package.json',
    'pnpm-lock.yaml',
    'tsconfig.base.json',
    'apps/web/tsconfig.json',
    'eslint.config.mjs',
    'apps/web/eslint.config.mjs',
    'apps/project-tracker/eslint.config.js',
    'eslint.promises.config.mjs',
    '.prettierrc',
    '.prettierignore',
    'eslint-rules/test-quality.mjs',
    'packages/typescript-config/base.json',
    'scripts/lint-promises.mjs',
    'scripts/lib/preship-lint-scope.mjs',
  ])('goes repo-wide when %s changes', (file) => {
    const r = classifyLintFiles(['apps/web/src/a.tsx', file]);
    expect(r.scope).toBe('full');
    expect(r.reason).toContain(file);
  });

  it('normalises backslashes', () => {
    expect(classifyLintFiles(['apps\\web\\src\\a.tsx']).files).toEqual(['apps/web/src/a.tsx']);
  });
});

describe('resolveLintScope', () => {
  const fakeGit =
    (out: Record<string, string | null>) =>
    (args: string[]): string | null =>
      out[args[0]] ?? null;

  it('is full under CI', () => {
    expect(resolveLintScope({ cwd: '.', env: { CI: 'true' } }).scope).toBe('full');
  });

  it(`is full with ${FULL_LINT_ENV}=1`, () => {
    expect(resolveLintScope({ cwd: '.', env: { [FULL_LINT_ENV]: '1' } }).scope).toBe('full');
  });

  it('is full when the merge-base cannot be resolved', () => {
    const r = resolveLintScope({ cwd: '.', env: {}, git: fakeGit({ 'merge-base': null }) });
    expect(r.scope).toBe('full');
  });

  it('is full when git diff fails', () => {
    const r = resolveLintScope({
      cwd: '.',
      env: {},
      git: fakeGit({ 'merge-base': 'abc\n', diff: null, 'ls-files': '' }),
    });
    expect(r.scope).toBe('full');
  });

  it('joins tracked and untracked changes', () => {
    const r = resolveLintScope({
      cwd: '.',
      env: {},
      git: fakeGit({
        'merge-base': 'abc\n',
        diff: 'apps/web/src/a.tsx\n',
        'ls-files': 'apps/web/src/new.tsx\n',
      }),
    });
    expect(r).toEqual({
      scope: 'changed',
      reason: '2 changed file(s)',
      files: ['apps/web/src/a.tsx', 'apps/web/src/new.tsx'],
    });
  });
});

describe('formatTargets', () => {
  it('keeps the extensions format:check globs', () => {
    expect(
      formatTargets([
        'a.ts',
        'b.tsx',
        'c.md',
        'd.json',
        'e.yml',
        'f.yaml',
        'g.mjs',
        'h.css',
        'i.py',
      ])
    ).toEqual(['a.ts', 'b.tsx', 'c.md', 'd.json', 'e.yml', 'f.yaml']);
  });
});

describe('eslintGlobs', () => {
  it.each([
    ['eslint "src/**/*.ts"', ['src/**/*.ts']],
    ['eslint "src/**/*.{ts,tsx}"', ['src/**/*.{ts,tsx}']],
    ['eslint "src/**/*.ts" "scripts/**/*.ts"', ['src/**/*.ts', 'scripts/**/*.ts']],
    ['eslint .', ['**/*']],
    ['eslint src/', ['src/**/*']],
  ])('%s', (script, globs) => {
    expect(eslintGlobs(script)).toEqual(globs);
  });

  it.each([
    [undefined],
    ['pnpm --filter a --filter b run lint'],
    ['eslint --fix "src/**/*.ts"'],
    ['next lint'],
  ])('is null for %s', (script) => {
    expect(eslintGlobs(script)).toBeNull();
  });
});

describe('lintPlan', () => {
  const packages = [
    { name: '@x/web', dir: 'apps/web', lint: 'eslint "src/**/*.{ts,tsx}"' },
    { name: '@x/ui', dir: 'packages/ui', lint: 'eslint "src/**/*.ts"' },
    { name: '@x/tracker', dir: 'apps/project-tracker', lint: 'eslint .' },
    { name: '@x/workers', dir: 'apps/workers', lint: 'pnpm --filter a run lint' },
    { name: '@x/events', dir: 'apps/workers/events-worker', lint: 'eslint "src/**/*.ts"' },
    { name: '@x/types', dir: 'packages/typescript-config' },
  ];

  it('lints only the files each package lint script covers', () => {
    const plan = lintPlan(
      [
        'apps/web/src/app/page.tsx',
        'apps/web/e2e/spec.ts', // outside web's src/ glob
        'packages/ui/src/button.ts',
        'packages/ui/src/card.tsx', // ui lints *.ts only
        'apps/project-tracker/lib/x.ts',
        'apps/web/src/styles.css', // not a lintable extension
        'scripts/pre-ship.mjs', // no package lints root scripts
      ],
      packages
    );
    expect(plan.eslint).toEqual([
      { name: '@x/tracker', dir: 'apps/project-tracker', files: ['lib/x.ts'] },
      { name: '@x/ui', dir: 'packages/ui', files: ['src/button.ts'] },
      { name: '@x/web', dir: 'apps/web', files: ['src/app/page.tsx'] },
    ]);
    expect(plan.whole).toEqual([]);
  });

  it('assigns a file to the deepest package', () => {
    const plan = lintPlan(['apps/workers/events-worker/src/a.ts'], packages);
    expect(plan.eslint).toEqual([
      { name: '@x/events', dir: 'apps/workers/events-worker', files: ['src/a.ts'] },
    ]);
  });

  it('runs a non-eslint lint script whole', () => {
    const plan = lintPlan(['apps/workers/shared.ts'], packages);
    expect(plan).toEqual({ eslint: [], whole: ['@x/workers'] });
  });
});

describe('promisesPlan', () => {
  it('groups ts/tsx files by source root', () => {
    expect(
      promisesPlan(
        ['apps/web/src/a.tsx', 'apps/web/src/b.md', 'apps/web/e2e/c.ts', 'packages/db/src/d.ts'],
        ['apps/web/src', 'apps/api/src', 'packages/db/src']
      )
    ).toEqual([
      { root: 'apps/web/src', files: ['apps/web/src/a.tsx'] },
      { root: 'packages/db/src', files: ['packages/db/src/d.ts'] },
    ]);
  });
});

describe('chunkArgs', () => {
  it('splits long lists and keeps every item', () => {
    const items = Array.from({ length: 50 }, (_, i) => `file-${i}.ts`);
    const chunks = chunkArgs(items, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(items);
    for (const c of chunks) expect(c.join(' ').length).toBeLessThanOrEqual(100);
  });

  it('is empty for no items', () => {
    expect(chunkArgs([])).toEqual([]);
  });
});

describe('runScopedLint', () => {
  const changed = (files: string[]) => ({ scope: 'changed' as const, reason: 'r', files });
  function io(overrides: Record<string, unknown> = {}) {
    const run = vi.fn(() => 0);
    const log = vi.fn();
    return {
      run,
      log,
      io: {
        root: '/repo',
        run,
        log,
        exists: () => true,
        packages: () => [
          { name: '@x/web', dir: 'apps/web', lint: 'eslint "src/**/*.{ts,tsx}"' },
          { name: '@x/workers', dir: 'apps/workers', lint: 'pnpm --filter a run lint' },
        ],
        promiseRoots: async () => ['apps/web/src'],
        join: (...p: string[]) => p.join('/'),
        ...overrides,
      },
    };
  }

  it.each(['format', 'lint', 'promises'] as const)(
    '%s runs the repo-wide command on a full scope',
    async (mode) => {
      const t = io();
      const status = await runScopedLint(mode, { scope: 'full', reason: 'CI', files: [] }, t.io);
      expect(status).toBe(0);
      expect(t.run).toHaveBeenCalledWith('pnpm', FULL_COMMAND[mode], '/repo');
    }
  );

  it('format: prettier --check on the changed files that still exist', async () => {
    const t = io({ exists: (f: string) => f !== 'apps/web/src/gone.ts' });
    await runScopedLint(
      'format',
      changed(['apps/web/src/a.tsx', 'apps/web/src/gone.ts', 'x.css']),
      t.io
    );
    expect(t.run).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'prettier', '--check', '--ignore-unknown', 'apps/web/src/a.tsx'],
      '/repo'
    );
  });

  it('format: nothing to do when no formattable file changed', async () => {
    const t = io();
    expect(await runScopedLint('format', changed(['a.css']), t.io)).toBe(0);
    expect(t.run).not.toHaveBeenCalled();
  });

  it('lint: per-package eslint in the package dir, and a non-eslint script whole', async () => {
    const t = io();
    await runScopedLint('lint', changed(['apps/web/src/a.tsx', 'apps/workers/x.ts']), t.io);
    expect(t.run).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'eslint', '--no-warn-ignored', 'src/a.tsx'],
      '/repo/apps/web'
    );
    expect(t.run).toHaveBeenCalledWith('pnpm', ['--filter', '@x/workers', 'run', 'lint'], '/repo');
  });

  it('lint: nothing to do when no linted file changed', async () => {
    const t = io();
    expect(await runScopedLint('lint', changed(['README.md']), t.io)).toBe(0);
    expect(t.run).not.toHaveBeenCalled();
  });

  it('promises: type-aware eslint per source root, failing on any problem', async () => {
    const t = io();
    t.run.mockReturnValue(1);
    const status = await runScopedLint('promises', changed(['apps/web/src/a.tsx']), t.io);
    expect(status).not.toBe(0);
    expect(t.run).toHaveBeenCalledWith(
      'pnpm',
      [
        'exec',
        'eslint',
        '-c',
        'eslint.promises.config.mjs',
        '--no-warn-ignored',
        'apps/web/src/a.tsx',
      ],
      '/repo'
    );
    expect(t.log).toHaveBeenCalledWith('[scoped-lint] promises: floating promises found');
  });

  it('promises: nothing to do outside the source roots', async () => {
    const t = io();
    expect(await runScopedLint('promises', changed(['scripts/a.mjs']), t.io)).toBe(0);
    expect(t.run).not.toHaveBeenCalled();
  });

  it('keeps a failure from any chunk', async () => {
    const t = io();
    t.run.mockReturnValueOnce(0).mockReturnValueOnce(2);
    const files = Array.from({ length: 800 }, (_, i) => `apps/web/src/component-number-${i}.tsx`);
    expect(await runScopedLint('format', changed(files), t.io)).not.toBe(0);
    expect(t.run.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('resolveLintScope against this checkout', () => {
  it('reads the real diff, ignoring a git hook GIT_DIR', () => {
    const r = resolveLintScope({ cwd: process.cwd(), env: { GIT_DIR: '/nowhere/.git' } });
    expect(['full', 'changed']).toContain(r.scope);
    expect(Array.isArray(r.files)).toBe(true);
  });

  it('is full against a base ref that does not exist', () => {
    const r = resolveLintScope({
      cwd: process.cwd(),
      env: {},
      baseRef: 'refs/heads/no-such-base-ref',
    });
    expect(r.scope).toBe('full');
  });

  it('defaults to the process env', () => {
    expect(['full', 'changed']).toContain(resolveLintScope({ cwd: process.cwd() }).scope);
  });
});

describe('runScopedLint path joining', () => {
  it('joins the package dir with node:path by default', async () => {
    const run = vi.fn(() => 0);
    await runScopedLint(
      'lint',
      { scope: 'changed', reason: 'r', files: ['apps/web/src/a.tsx'] },
      {
        root: 'repo',
        run,
        log: () => {},
        exists: () => true,
        packages: () => [{ name: '@x/web', dir: 'apps/web', lint: 'eslint "src/**/*.tsx"' }],
        promiseRoots: () => [],
      }
    );
    expect(run.mock.calls[0][2]).toBe(path.join('repo', 'apps/web'));
  });
});
