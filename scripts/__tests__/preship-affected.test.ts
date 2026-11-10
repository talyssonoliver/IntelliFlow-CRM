/**
 * Tests for scripts/lib/preship-affected.mjs — which packages the local pre-ship
 * library-build, typecheck and build steps cover.
 */
import { describe, it, expect } from 'vitest';

import {
  AFFECTED_ENV,
  affectedFromEnvOrResolve,
  buildFilters,
  describeScope,
  FULL_BUILD_ENV,
  isTestOrDoc,
  libraryBuildFilters,
  resolveAffected,
  typecheckFilters,
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
