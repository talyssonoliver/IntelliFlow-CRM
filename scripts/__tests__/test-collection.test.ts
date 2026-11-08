/**
 * scripts/lib/test-collection.mjs: a tracked test file that no vitest project collects must be
 * allowlisted with a reason and a ref, and the allowlist cannot keep stale entries (#1216).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TEST_FILE,
  allowlistProblems,
  compareCollection,
  matchesAllowlistPath,
  toRepoPath,
} from '../lib/test-collection.mjs';

describe('toRepoPath', () => {
  it('makes collected absolute paths repo-relative with forward slashes', () => {
    expect(toRepoPath('C:\\repo\\apps\\web\\a.test.ts', 'C:\\repo')).toBe('apps/web/a.test.ts');
    expect(toRepoPath('c:/repo/apps/web/a.test.ts', 'C:/repo/')).toBe('apps/web/a.test.ts');
    expect(toRepoPath('/home/ci/repo/x.test.ts', '/home/ci/repo')).toBe('x.test.ts');
    expect(toRepoPath('elsewhere/x.test.ts', '/home/ci/repo')).toBe('elsewhere/x.test.ts');
  });
});

describe('which files count as tests', () => {
  it('matches .test and .spec sources only', () => {
    expect(TEST_FILE.test('a/b.test.ts')).toBe(true);
    expect(TEST_FILE.test('a/b.spec.tsx')).toBe(true);
    expect(TEST_FILE.test('a/b.test.mjs')).toBe(true);
    expect(TEST_FILE.test('a/b.ts')).toBe(false);
    expect(TEST_FILE.test('a/b.test.ts.snap')).toBe(false);
  });

  it('matches an exact path or everything under dir/**', () => {
    expect(matchesAllowlistPath('tests/e2e/a.spec.ts', 'tests/e2e/**')).toBe(true);
    expect(matchesAllowlistPath('tests/e2e-other/a.spec.ts', 'tests/e2e/**')).toBe(false);
    expect(matchesAllowlistPath('x/a.test.ts', 'x/a.test.ts')).toBe(true);
    expect(matchesAllowlistPath('x/a.test.ts', 'x/b.test.ts')).toBe(false);
  });
});

describe('compareCollection', () => {
  const allowlist = [
    { path: 'tests/e2e/**', reason: 'Playwright', ref: 'playwright.config.ts' },
    { path: 'apps/api/x.integration.test.ts', reason: 'needs a DB', ref: '#1257' },
  ];

  it('fails on a test file no project collects and the allowlist does not name', () => {
    const result = compareCollection({
      trackedFiles: [
        'apps/web/a.test.ts',
        'apps/web/forgotten.test.ts',
        'tests/e2e/flow.spec.ts',
        'apps/api/x.integration.test.ts',
        'apps/web/helper.ts',
      ],
      collectedFiles: ['apps/web/a.test.ts'],
      allowlist,
    });
    expect(result).toEqual({
      uncollected: ['apps/web/forgotten.test.ts'],
      stale: [],
      allowlisted: 2,
    });
  });

  it('reports an allowlist entry whose files are now collected or gone', () => {
    const result = compareCollection({
      trackedFiles: ['apps/api/x.integration.test.ts'],
      collectedFiles: ['apps/api/x.integration.test.ts'],
      allowlist,
    });
    expect(result.uncollected).toEqual([]);
    expect(result.stale).toEqual(['tests/e2e/**', 'apps/api/x.integration.test.ts']);
  });
});

describe('allowlistProblems', () => {
  const exists = (f: string) => f === 'playwright.config.ts';

  it('accepts an issue ref or an existing file', () => {
    expect(
      allowlistProblems(
        [
          { path: 'a', reason: 'r', ref: '#12' },
          { path: 'b/**', reason: 'r', ref: 'playwright.config.ts' },
        ],
        exists
      )
    ).toEqual([]);
  });

  it('rejects entries with no path, reason or ref, or a ref that points nowhere', () => {
    expect(
      allowlistProblems(
        [
          { reason: 'r', ref: '#1' },
          { path: 'b', reason: ' ', ref: '#1' },
          { path: 'c', reason: 'r' },
          { path: 'd', reason: 'r', ref: 'gone.ts' },
        ],
        exists
      )
    ).toEqual([
      'entry 0: no path',
      'b: no reason',
      'c: no ref (an issue like #123, or the file that runs it)',
      'd: ref gone.ts is neither an issue (#123) nor an existing file',
    ]);
  });
});

describe('the repo allowlist', () => {
  it('is well formed: every entry has a path, a reason and a valid ref', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const { entries } = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'tools/scripts/test-collection.allowlist.json'), 'utf8')
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(
      allowlistProblems(entries, (f: string) => fs.existsSync(path.join(repoRoot, f)))
    ).toEqual([]);
  });
});
