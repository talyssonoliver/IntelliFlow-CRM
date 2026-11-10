/**
 * Tests for scripts/lib/preship-lint-scope.mjs — which files the local pre-ship
 * format-check, lint and lint-promises steps check.
 */
import { describe, it, expect } from 'vitest';

import {
  chunkArgs,
  classifyLintFiles,
  eslintGlobs,
  formatTargets,
  lintPlan,
  promisesPlan,
  resolveLintScope,
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
