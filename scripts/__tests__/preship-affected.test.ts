/**
 * Tests for scripts/lib/preship-affected.mjs — which packages the local pre-ship
 * library-build, typecheck and build steps cover.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

import {
  AFFECTED_ENV,
  affectedFromEnvOrResolve,
  buildFilters,
  describeScope,
  FULL_BUILD_ENV,
  isTestOrDoc,
  libraryBuildFilters,
  resolveAffected,
  runLibraryBuild,
  typecheckFilters,
  WEB_PACKAGE,
  WEB_SKIP_LINE,
  webBuildScope,
} from '../lib/preship-affected.mjs';

const packages = [
  { name: '@x/web', dir: 'apps/web', deps: ['@x/ui', '@x/domain'] },
  { name: '@x/api', dir: 'apps/api', deps: ['@x/domain'] },
  { name: '@x/ui', dir: 'packages/ui', deps: [] },
  { name: '@x/domain', dir: 'packages/domain', deps: [] },
];

const fakeGit =
  (out: Record<string, string | null>) =>
  (args: string[]): string | null =>
    out[args[0]] ?? null;

function resolve(diff: string, untracked = '') {
  return resolveAffected({
    cwd: '.',
    env: {},
    packages,
    git: fakeGit({ 'merge-base': 'abc\n', diff, 'ls-files': untracked }),
  });
}

describe('resolveAffected', () => {
  it('is full under CI', () => {
    expect(resolveAffected({ cwd: '.', env: { CI: 'true' }, packages }).mode).toBe('full');
  });

  it(`is full with ${FULL_BUILD_ENV}=1`, () => {
    expect(resolveAffected({ cwd: '.', env: { [FULL_BUILD_ENV]: '1' }, packages }).mode).toBe(
      'full'
    );
  });

  it('is full when the merge-base cannot be resolved', () => {
    const r = resolveAffected({
      cwd: '.',
      env: {},
      packages,
      git: fakeGit({ 'merge-base': null }),
    });
    expect(r.mode).toBe('full');
  });

  it('is full when git diff fails', () => {
    const r = resolveAffected({
      cwd: '.',
      env: {},
      packages,
      git: fakeGit({ 'merge-base': 'abc\n', diff: null, 'ls-files': '' }),
    });
    expect(r.mode).toBe('full');
  });

  it('covers a UI change in the web app only', () => {
    const r = resolve('apps/web/src/app/page.tsx\napps/web/src/components/Card.tsx\n');
    expect(r.mode).toBe('affected');
    expect(r.packages).toEqual(['@x/web']);
    expect(r.testsOrDocsOnly).toBe(false);
  });

  it('adds the dependents of a changed library', () => {
    const r = resolve('packages/domain/src/lead.ts\n');
    expect(r.packages).toEqual(['@x/api', '@x/domain', '@x/web']);
  });

  it('counts untracked files', () => {
    expect(resolve('', 'packages/ui/src/new.tsx\n').packages).toEqual(['@x/ui', '@x/web']);
  });

  it('is full when a root file changes', () => {
    expect(resolve('apps/web/src/a.tsx\nturbo.json\n').mode).toBe('full');
  });

  it('is none for a docs-only diff', () => {
    const r = resolve('docs/guide.md\nREADME.md\n');
    expect(r.mode).toBe('none');
    expect(r.testsOrDocsOnly).toBe(true);
  });

  it('flags a change outside every package', () => {
    expect(resolve('scripts/pre-ship.mjs\n').outsidePackages).toBe(true);
    expect(resolve('tests/integration/a.test.ts\n').outsidePackages).toBe(true);
    expect(resolve('apps/web/src/a.tsx\ndocs/a.md\n').outsidePackages).toBe(false);
  });

  it('flags a tests-only diff', () => {
    const r = resolve('apps/web/src/components/__tests__/Card.test.tsx\n');
    expect(r.mode).toBe('affected');
    expect(r.testsOrDocsOnly).toBe(true);
  });

  it('is full when the workspace cannot be read', () => {
    const r = resolveAffected({
      cwd: '/definitely/not/a/repo',
      env: {},
      git: fakeGit({ 'merge-base': 'abc\n', diff: 'apps/web/src/a.tsx\n', 'ls-files': '' }),
    });
    expect(r.mode).toBe('full');
  });
});

describe('isTestOrDoc', () => {
  it.each([
    'apps/web/src/a.test.tsx',
    'packages/domain/src/x.spec.ts',
    'apps/web/src/__tests__/helpers.ts',
    'packages/ui/src/__mocks__/x.ts',
    'packages/ui/src/button.stories.tsx',
    'docs/a.md',
    'apps/web/README.md',
    'tests/e2e/a.spec.ts',
  ])('%s is a test or doc', (f) => {
    expect(isTestOrDoc(f)).toBe(true);
  });

  it.each(['apps/web/src/page.tsx', 'packages/ui/src/button.tsx', 'apps/web/next.config.js'])(
    '%s is not',
    (f) => {
      expect(isTestOrDoc(f)).toBe(false);
    }
  );
});

describe('filters', () => {
  const affected = {
    mode: 'affected' as const,
    reason: 'r',
    packages: ['@intelliflow/web', '@intelliflow/ui'],
    testsOrDocsOnly: false,
    outsidePackages: false,
  };
  const full = {
    mode: 'full' as const,
    reason: 'r',
    packages: [],
    testsOrDocsOnly: false,
    outsidePackages: true,
  };
  const none = {
    mode: 'none' as const,
    reason: 'r',
    packages: [],
    testsOrDocsOnly: true,
    outsidePackages: false,
  };

  it('typecheck: every package, none, or the affected ones', () => {
    expect(typecheckFilters(full)).toBeNull();
    expect(typecheckFilters(none)).toEqual([]);
    expect(typecheckFilters(affected)).toEqual([
      '--filter=@intelliflow/ui',
      '--filter=@intelliflow/web',
    ]);
  });

  it('library-build: an affected app contributes only its dependencies', () => {
    expect(libraryBuildFilters(full)).toBeNull();
    expect(libraryBuildFilters(none)).toEqual([]);
    expect(libraryBuildFilters(affected)).toEqual([
      '--filter=@intelliflow/ui',
      '--filter=@intelliflow/web^...',
    ]);
  });

  it('library-build: every library when a file outside the packages changed', () => {
    expect(libraryBuildFilters({ ...affected, outsidePackages: true })).toBeNull();
  });

  it('build: skipped for docs or tests only', () => {
    expect(buildFilters(full)).toBeNull();
    expect(buildFilters(none)).toEqual([]);
    expect(buildFilters({ ...affected, testsOrDocsOnly: true })).toEqual([]);
    expect(buildFilters(affected)).toEqual([
      '--filter=@intelliflow/ui',
      '--filter=@intelliflow/web',
    ]);
  });

  it('describeScope says what will run', () => {
    expect(describeScope(full, null)).toContain('all packages');
    expect(describeScope(none, [])).toContain('nothing to do');
    expect(describeScope(affected, ['--filter=a'])).toContain('--filter=a');
  });
});

describe('affectedFromEnvOrResolve', () => {
  it('reads the scope pre-ship handed down', () => {
    const scope = { mode: 'affected', reason: 'r', packages: ['@x/web'], testsOrDocsOnly: false };
    expect(
      affectedFromEnvOrResolve({ cwd: '.', env: { [AFFECTED_ENV]: JSON.stringify(scope) } })
    ).toEqual(scope);
  });

  it('resolves afresh (full under CI) when the hand-off is malformed', () => {
    const r = affectedFromEnvOrResolve({ cwd: '.', env: { [AFFECTED_ENV]: '{', CI: 'true' } });
    expect(r.mode).toBe('full');
  });
});

describe('runLibraryBuild', () => {
  const scope = (over = {}) => ({
    mode: 'affected',
    reason: 'r',
    packages: ['@intelliflow/web', '@intelliflow/ui'],
    testsOrDocsOnly: false,
    outsidePackages: false,
    ...over,
  });

  it('builds the affected libraries and the dependencies of affected apps', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const code = runLibraryBuild({
      scope: scope(),
      root: 'repo',
      spawn,
      execPath: 'node-bin',
      log: () => {},
    });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      'node-bin',
      [
        path.join('repo', 'node_modules', 'turbo', 'bin', 'turbo'),
        'run',
        'build',
        '--filter=@intelliflow/ui',
        '--filter=@intelliflow/web^...',
      ],
      { cwd: 'repo', stdio: 'inherit' }
    );
  });

  it('builds every library on a full scope, as before', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    runLibraryBuild({
      scope: scope({ mode: 'full', packages: [] }),
      root: 'repo',
      spawn,
      log: () => {},
    });
    expect(spawn.mock.calls[0][1].slice(1)).toEqual([
      'run',
      'build',
      '--filter=!@intelliflow/web',
      '--filter=!@intelliflow/api',
      '--filter=!@intelliflow/project-tracker',
      '--filter=!@intelliflow/workers',
    ]);
  });

  it('spawns nothing when nothing is affected', () => {
    const spawn = vi.fn();
    const code = runLibraryBuild({
      scope: scope({ mode: 'none', packages: [] }),
      root: 'r',
      spawn,
      log: () => {},
    });
    expect(code).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fails when turbo cannot start or exits non-zero', () => {
    const log = vi.fn();
    const failed = vi.fn(() => ({ error: new Error('ENOENT'), status: null }));
    expect(runLibraryBuild({ scope: scope(), root: 'r', spawn: failed, log })).toBe(1);
    expect(log.mock.calls.at(-1)[0]).toContain('could not start turbo: ENOENT');
    expect(runLibraryBuild({ scope: scope(), root: 'r', spawn: () => ({ status: 3 }), log })).toBe(
      3
    );
  });
});

describe('resolveAffected against this checkout', () => {
  it('reads the real diff and workspace, ignoring a git hook GIT_DIR', () => {
    const r = resolveAffected({ cwd: process.cwd(), env: { GIT_DIR: '/nowhere/.git' } });
    expect(['full', 'affected', 'none']).toContain(r.mode);
  });

  it('is full against a base ref that does not exist', () => {
    expect(
      resolveAffected({ cwd: process.cwd(), env: {}, baseRef: 'refs/heads/no-such-base' }).mode
    ).toBe('full');
  });

  it('defaults to the process env', () => {
    expect(['full', 'affected', 'none']).toContain(resolveAffected({ cwd: process.cwd() }).mode);
  });

  it('is none when nothing changed', () => {
    const r = resolveAffected({
      cwd: '.',
      env: {},
      packages,
      git: fakeGit({ 'merge-base': 'abc\n', diff: '', 'ls-files': '' }),
    });
    expect(r).toMatchObject({ mode: 'none', testsOrDocsOnly: true, outsidePackages: false });
  });

  it('resolves afresh when no scope was handed down', () => {
    expect(affectedFromEnvOrResolve({ cwd: '.', env: { CI: 'true' } }).mode).toBe('full');
  });
});

describe('web build only when web build inputs change (audit 2026-11-13, item 3)', () => {
  const ws = [
    { name: WEB_PACKAGE, dir: 'apps/web', deps: ['@intelliflow/ui', '@intelliflow/api'] },
    { name: '@intelliflow/api', dir: 'apps/api', deps: ['@intelliflow/domain'] },
    { name: '@intelliflow/ui', dir: 'packages/ui', deps: [] },
    { name: '@intelliflow/domain', dir: 'packages/domain', deps: [] },
    { name: '@intelliflow/ai-worker', dir: 'apps/ai-worker', deps: ['@intelliflow/domain'] },
  ];
  const affected = (files: string[]) => webBuildScope(files, ws).affected;

  it('builds web for its own source and config, and for any package it uses, transitively', () => {
    expect(affected(['apps/web/src/a.tsx'])).toBe(true);
    expect(affected(['apps/web/next.config.js'])).toBe(true);
    expect(affected(['apps/web/package.json'])).toBe(true);
    expect(affected(['packages/ui/src/b.tsx'])).toBe(true);
    expect(affected(['packages/domain/src/c.ts'])).toBe(true); // via api
  });

  it('builds web for the lockfile and any root file not known to be outside it', () => {
    for (const f of [
      'pnpm-lock.yaml',
      'package.json',
      'turbo.json',
      'tsconfig.base.json',
      'odd.file',
    ]) {
      expect(affected([f])).toBe(true);
    }
  });

  it('leaves web out for tooling, CI, docs, tests and packages it does not use', () => {
    expect(
      affected([
        'scripts/pre-ship.mjs',
        'tools/scripts/x.ts',
        '.github/workflows/ci.yml',
        '.husky/pre-commit',
        'docs/a.md',
        'apps/ai-worker/src/x.ts',
        'apps/web/src/__tests__/a.test.tsx',
        'vitest.config.ts',
      ])
    ).toBe(false);
  });

  it('treats a workspace without the web package as affected', () => {
    expect(webBuildScope(['scripts/x.mjs'], ws.slice(1)).affected).toBe(true);
  });

  it('drops web from the build filters, or excludes it from a full build', () => {
    const skip = { affected: false, reason: 'r' };
    const base = { reason: 'r', testsOrDocsOnly: false, outsidePackages: false };
    expect(
      buildFilters({
        ...base,
        mode: 'affected',
        packages: ['@intelliflow/ai-worker', WEB_PACKAGE],
        webBuild: skip,
      })
    ).toEqual(['--filter=@intelliflow/ai-worker']);
    expect(buildFilters({ ...base, mode: 'full', packages: [], webBuild: skip })).toEqual([
      `--filter=!${WEB_PACKAGE}`,
    ]);
    expect(
      buildFilters({
        ...base,
        mode: 'affected',
        packages: [WEB_PACKAGE],
        webBuild: { affected: true, reason: 'r' },
      })
    ).toEqual([`--filter=${WEB_PACKAGE}`]);
    expect(WEB_SKIP_LINE).toBe('web build not affected; CI build check is the guard');
  });

  it('records the decision on the resolved scope; full scopes keep web', () => {
    const r = resolveAffected({
      cwd: '.',
      env: {},
      packages: ws,
      git: fakeGit({ 'merge-base': 'abc\n', diff: 'scripts/pre-ship.mjs\n', 'ls-files': '' }),
    });
    expect(r.webBuild.affected).toBe(false);
    expect(resolveAffected({ cwd: '.', env: { CI: 'true' } }).webBuild.affected).toBe(true);
    expect(resolveAffected({ cwd: '.', env: {}, git: fakeGit({}) }).webBuild.affected).toBe(true);
  });
});
