/**
 * Tests for scripts/lib/preship-db-scope.mjs — whether a branch needs the test
 * database seeded and the integration suite run locally.
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';

import { FULL_DB_ENV, parseListedTests, resolveDbScope } from '../lib/preship-db-scope.mjs';

const fakeGit =
  (out: Record<string, string | null>) =>
  (args: string[]): string | null =>
    out[args[0]] ?? null;

function resolve(diff: string, list: string[] | null = [], untracked = '') {
  const listIntegration = vi.fn(() => list);
  const r = resolveDbScope({
    cwd: '.',
    env: {},
    git: fakeGit({ 'merge-base': 'base123\n', 'cat-file': '', diff, 'ls-files': untracked }),
    listIntegration,
  });
  return { r, listIntegration };
}

describe('resolveDbScope', () => {
  it('is needed under CI', () => {
    expect(resolveDbScope({ cwd: '.', env: { CI: 'true' } }).needed).toBe(true);
  });

  it(`is needed with ${FULL_DB_ENV}=1`, () => {
    expect(resolveDbScope({ cwd: '.', env: { [FULL_DB_ENV]: '1' } }).needed).toBe(true);
  });

  it('is needed when the merge-base cannot be resolved', () => {
    const r = resolveDbScope({ cwd: '.', env: {}, git: fakeGit({ 'merge-base': null }) });
    expect(r.needed).toBe(true);
  });

  it('is needed when git diff fails', () => {
    const r = resolveDbScope({
      cwd: '.',
      env: {},
      git: fakeGit({ 'merge-base': 'b\n', 'cat-file': '', diff: null, 'ls-files': '' }),
    });
    expect(r.needed).toBe(true);
  });

  it('is not needed for a UI change no integration test imports', () => {
    const { r, listIntegration } = resolve('apps/web/src/app/leads/page.tsx\napps/web/src/c.tsx\n');
    expect(r).toEqual({
      needed: false,
      reason: 'no integration test imports any of the 2 changed file(s)',
      tests: [],
    });
    expect(listIntegration).toHaveBeenCalledWith('base123', '.', {});
  });

  it('is needed when an integration test imports a changed file', () => {
    const { r } = resolve('packages/adapters/src/repositories/PrismaLeadRepository.ts\n', [
      'tests/integration/dsar.test.ts',
    ]);
    expect(r.needed).toBe(true);
    expect(r.tests).toEqual(['tests/integration/dsar.test.ts']);
  });

  it('is needed when the integration tests cannot be listed', () => {
    expect(resolve('packages/domain/src/a.ts\n', null).r.needed).toBe(true);
  });

  it.each([
    'packages/db/prisma/schema.prisma',
    'packages/db/src/client.ts',
    'apps/api/src/routers/lead.router.ts',
    'apps/ai-worker/src/agent.ts',
    'tests/integration/new.test.ts',
    'package.json',
    'apps/web/package.json',
    'pnpm-lock.yaml',
    'vitest.config.ts',
    'tsconfig.base.json',
    'docker-compose.yml',
    '.env.test',
    'scripts/test-db.mjs',
    'scripts/lib/ephemeral-test-db.mjs',
  ])('is needed when %s changes, without listing tests', (file) => {
    const { r, listIntegration } = resolve(`apps/web/src/a.tsx\n${file}\n`);
    expect(r.needed).toBe(true);
    expect(r.reason).toContain(file);
    expect(listIntegration).not.toHaveBeenCalled();
  });

  it('counts untracked and deleted files', () => {
    expect(resolve('', [], 'apps/api/src/new.ts\n').r.needed).toBe(true);
  });

  it('is not needed when nothing changed', () => {
    const { r, listIntegration } = resolve('');
    expect(r.needed).toBe(false);
    expect(listIntegration).not.toHaveBeenCalled();
  });
});

describe('parseListedTests', () => {
  it('reads the integration files and ignores everything else', () => {
    expect(
      parseListedTests(
        [
          '[integration] tests/integration/dsar.test.ts',
          '[integration] tests/integration/ingestion/file-ingestion.e2e.test.ts\r',
          'some warning',
          '',
        ].join('\n')
      )
    ).toEqual([
      'tests/integration/dsar.test.ts',
      'tests/integration/ingestion/file-ingestion.e2e.test.ts',
    ]);
  });

  it('is empty for no output', () => {
    expect(parseListedTests('')).toEqual([]);
    expect(parseListedTests(undefined)).toEqual([]);
  });
});

describe('resolveDbScope against this checkout', () => {
  it('reads the real diff, ignoring a git hook GIT_DIR', () => {
    const r = resolveDbScope({
      cwd: process.cwd(),
      env: { GIT_DIR: '/nowhere/.git' },
      listIntegration: () => [],
    });
    expect(typeof r.needed).toBe('boolean');
  });

  it('is needed against a base ref that does not exist', () => {
    expect(
      resolveDbScope({ cwd: process.cwd(), env: {}, baseRef: 'refs/heads/no-such-base' }).needed
    ).toBe(true);
  });
});

describe('the real integration listing', () => {
  it('asks vitest which integration tests the diff reaches', () => {
    const base = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], {
      encoding: 'utf8',
    }).stdout.trim();
    // Only a web file "changed": the listing runs against the real merge-base.
    const r = resolveDbScope({
      cwd: process.cwd(),
      env: {},
      git: fakeGit({
        'merge-base': `${base}\n`,
        'cat-file': '',
        diff: 'apps/web/src/components/ModuleGate.tsx\n',
        'ls-files': '',
      }),
    });
    expect(typeof r.needed).toBe('boolean');
    expect(r.reason).toMatch(/integration test|could not list/);
  }, 180_000);

  it('is needed when the merge-base is not a commit (vitest would list nothing)', () => {
    const listIntegration = vi.fn(() => []);
    const r = resolveDbScope({
      cwd: process.cwd(),
      env: {},
      git: (args: string[]) => {
        if (args[0] === 'merge-base') return 'not-a-real-ref\n';
        return spawnSync('git', args, { encoding: 'utf8' }).status === 0 ? '' : null;
      },
      listIntegration,
    });
    expect(r).toMatchObject({ needed: true, reason: 'merge-base not-a-real-ref is not a commit' });
    expect(listIntegration).not.toHaveBeenCalled();
  });
});
