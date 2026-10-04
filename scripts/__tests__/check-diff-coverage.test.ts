/**
 * check-diff-coverage — the local mirror of Sonar's new_coverage condition.
 *
 * These tests import the real logic from scripts/lib/diff-coverage.mjs. They
 * used to re-implement it in this file and test the copy ("kept in sync with
 * the script"), and the copy had already drifted: it still treated apps/workers/
 * as a Sonar source root, which the script did not. One CLI smoke test remains
 * to prove the entry point is wired.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  computeDiffCoverage,
  createClassifier,
  parseAddedLines,
  parseCobertura,
  parseLcov,
  runDiffCoverage,
} from '../lib/diff-coverage.mjs';
import { loadSonarScope } from '../lib/sonar-scope.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = '/repo';

const realScope = loadSonarScope(REPO_ROOT);
const real = createClassifier(realScope);

const scope = {
  sourceRoots: ['apps/web/src', 'scripts'],
  exclusions: [/^scripts\/__tests__\//, /\.sh$/],
  coverageExclusions: [/^apps\/web\/src\/app\/.*\/page\.tsx$/, /^scripts\/thin-cli\.mjs$/],
};

// ---------------------------------------------------------------------------
// File classification — against the COMMITTED sonar-project.properties
// ---------------------------------------------------------------------------

describe('classification against sonar-project.properties', () => {
  it.each([
    ['apps/web/src/components/Foo.tsx', true],
    ['packages/domain/src/crm/lead/Lead.ts', true],
    ['scripts/lib/diff-coverage.mjs', true],
    ['scripts/run-coverage.js', true],
    ['tools/scripts/lib/contract-parser.ts', true],
    ['apps/web/src/components/Foo.test.tsx', false],
    ['scripts/__tests__/check-diff-coverage.test.ts', false],
    ['tools/scripts/__tests__/helper.ts', false],
    ['tools/scripts/security/fixtures/sample.mjs', false],
    ['tools/audit/run_audit.py', true],
    ['tools/plan/src/domain/task.py', true],
    ['tools/audit/tests/test_affected.py', false],
    ['tools/audit/tests/conftest.py', false],
    ['.agents/skills/x/helper.py', false],
    ['packages/domain/src/types.d.ts', false],
    ['vitest.config.ts', false],
    ['apps/workers/notifications-worker/src/index.ts', false],
    ['infra/monitoring/x.ts', false],
  ])('%s coverable → %s', (file, expected) => {
    expect(real.isCoverableFile(file)).toBe(expected);
  });

  it('honours sonar.coverage.exclusions, including the thin CLI entry points', () => {
    expect(real.isSonarCoverageExcluded('apps/api/src/tracing/example.ts')).toBe(true);
    expect(real.isSonarCoverageExcluded('apps/api/src/modules/legal/anything.router.ts')).toBe(
      true
    );
    expect(real.isSonarCoverageExcluded('scripts/check-diff-coverage.mjs')).toBe(true);
    expect(real.isSonarCoverageExcluded('scripts/check-coverage-floor.mjs')).toBe(true);
    expect(real.isSonarCoverageExcluded('scripts/lib/diff-coverage.mjs')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Diff and lcov parsing
// ---------------------------------------------------------------------------

describe('parseAddedLines', () => {
  const diff = [
    'diff --git a/scripts/a.mjs b/scripts/a.mjs',
    'index 1..2 100644',
    '--- a/scripts/a.mjs',
    '+++ b/scripts/a.mjs',
    '@@ -1,0 +2,2 @@',
    '+const a = 1;',
    '+const b = 2;',
    '@@ -10 +11 @@',
    '-old',
    '+new',
    ' context',
    '+after context',
    '\\ No newline at end of file',
    'diff --git a/README.md b/README.md',
    '+++ b/README.md',
    '@@ -0,0 +1 @@',
    '+# not coverable',
    'diff --git a/scripts/gone.mjs b/scripts/gone.mjs',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-deleted',
    '+++ b/scripts/b.mjs',
    '@@ -0,0 +5 @@',
    '+x',
  ].join('\n');

  it('records added line numbers per coverable file and tracks context lines', () => {
    const added = parseAddedLines(diff, (f: string) => f.startsWith('scripts/'));
    expect([...added.get('scripts/a.mjs')!]).toEqual([2, 3, 11, 13]);
    expect([...added.get('scripts/b.mjs')!]).toEqual([5]);
    expect(added.has('README.md')).toBe(false);
    expect(added.has('scripts/gone.mjs')).toBe(false);
  });

  it('ignores content before the first file header', () => {
    expect(parseAddedLines('+orphan\n@@ -1 +1 @@\n+x', () => true).size).toBe(0);
  });
});

describe('parseLcov', () => {
  it('keys hits by repo-relative path, from absolute, Windows and ./-prefixed SF lines', () => {
    const hits = parseLcov(
      [
        `SF:${ROOT}/scripts/a.mjs`,
        'DA:1,3',
        'DA:2,0',
        'end_of_record',
        'SF:/repo\\scripts\\b.mjs',
        'DA:7,1',
        'end_of_record',
        'SF:./scripts/c.mjs',
        'DA:4,0',
        'end_of_record',
        'DA:9,9',
      ].join('\n'),
      ROOT
    );
    expect(hits.get('scripts/a.mjs')).toEqual(
      new Map([
        [1, 3],
        [2, 0],
      ])
    );
    expect(hits.get('scripts/b.mjs')).toEqual(new Map([[7, 1]]));
    expect(hits.get('scripts/c.mjs')).toEqual(new Map([[4, 0]]));
  });
});

// ---------------------------------------------------------------------------
// Intersection (issue #382: absent from lcov = 0%, not "skip")
// ---------------------------------------------------------------------------

describe('computeDiffCoverage', () => {
  const none = () => false;

  it('counts every added line of a file absent from lcov as uncovered', () => {
    const r = computeDiffCoverage(
      new Map([['apps/web/src/new.tsx', new Set([1, 2, 3])]]),
      new Map(),
      none
    );
    expect(r).toEqual({
      coverable: 3,
      covered: 0,
      perFile: [{ file: 'apps/web/src/new.tsx', fCov: 0, fTot: 3, absent: true }],
    });
  });

  it('counts only executable (DA) lines of a file present in lcov', () => {
    const r = computeDiffCoverage(
      new Map([['scripts/a.mjs', new Set([1, 2, 3, 4])]]),
      new Map([
        [
          'scripts/a.mjs',
          new Map([
            [1, 2],
            [2, 0],
            [3, 1],
          ]),
        ],
      ]),
      none
    );
    expect(r.coverable).toBe(3);
    expect(r.covered).toBe(2);
  });

  it('drops a present file whose added lines are all non-executable', () => {
    const r = computeDiffCoverage(
      new Map([['scripts/a.mjs', new Set([9])]]),
      new Map([['scripts/a.mjs', new Map([[1, 1]])]]),
      none
    );
    expect(r).toEqual({ coverable: 0, covered: 0, perFile: [] });
  });

  it('skips files Sonar holds no coverage expectation for, even when absent', () => {
    const r = computeDiffCoverage(
      new Map([['scripts/thin-cli.mjs', new Set([1, 2])]]),
      new Map(),
      (f: string) => f === 'scripts/thin-cli.mjs'
    );
    expect(r.coverable).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The whole gate, with git and the filesystem injected
// ---------------------------------------------------------------------------

function gate({
  diff = '',
  diffStatus = 0,
  mergeBase = { status: 0, stdout: 'abc123\n' },
  lcov = '' as string | null,
  py = null as string | null,
  env = {} as Record<string, string>,
} = {}) {
  const calls: string[][] = [];
  const out: string[] = [];
  const err: string[] = [];
  const readPaths: string[] = [];
  const code = runDiffCoverage({
    root: ROOT,
    scope,
    env,
    sh: (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      return args[0] === 'merge-base' ? mergeBase : { status: diffStatus, stdout: diff };
    },
    readFile: (p: string) => {
      readPaths.push(p.split('\\').join('/'));
      return p.endsWith('.xml') ? py : lcov;
    },
    log: (m: string) => out.push(m),
    error: (m: string) => err.push(m),
  });
  return { code, calls, out: out.join('\n'), err: err.join('\n'), readPaths };
}

const diffOf = (file: string, lines: number) =>
  [`+++ b/${file}`, `@@ -0,0 +1,${lines} @@`, ...Array.from({ length: lines }, () => '+x')].join(
    '\n'
  );

describe('runDiffCoverage', () => {
  it('diffs against the merge-base with the default base ref', () => {
    const { calls } = gate();
    expect(calls[0]).toEqual(['git', 'merge-base', 'HEAD', 'origin/main']);
    expect(calls[1]).toEqual(['git', 'diff', '--unified=0', '--no-color', 'abc123', 'HEAD']);
  });

  it('falls back to the base ref itself when there is no merge-base', () => {
    const { calls } = gate({
      mergeBase: { status: 1, stdout: '' },
      env: { DIFF_COVER_BASE: 'upstream/x' },
    });
    expect(calls[1][4]).toBe('upstream/x');
  });

  it('fails when git diff fails', () => {
    const r = gate({ diffStatus: 128 });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/git diff against origin\/main failed/);
  });

  it('passes when no coverable line changed', () => {
    const r = gate({ diff: diffOf('README.md', 2) });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no coverable source lines changed/);
  });

  it('fails when the lcov report is missing', () => {
    const r = gate({ diff: diffOf('scripts/a.mjs', 1), lcov: null });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/artifacts\/coverage\/lcov\.info missing/);
    expect(r.readPaths).toEqual(['/repo/artifacts/coverage/lcov.info']);
  });

  it('reads an absolute DIFF_COVER_LCOV as given', () => {
    const lcovPath = path.resolve('/tmp/x/lcov.info');
    const r = gate({
      diff: diffOf('scripts/a.mjs', 1),
      lcov: null,
      env: { DIFF_COVER_LCOV: lcovPath },
    });
    expect(r.readPaths).toEqual([lcovPath.split('\\').join('/')]);
  });

  it('passes when the only changed lines are coverage-excluded', () => {
    const r = gate({ diff: diffOf('scripts/thin-cli.mjs', 3), lcov: '' });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no changed lines are in coverage scope/);
  });

  it('fails a new tooling file no test loads (absent from lcov) — the #382 rule', () => {
    const r = gate({ diff: diffOf('scripts/a.mjs', 4), lcov: '' });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/0\/4 {2}scripts\/a\.mjs {2}\[no lcov/);
    expect(r.err).toMatch(/Diff coverage 0\.0% is below the 80% floor/);
  });

  it('passes at the floor and lists the worst file first', () => {
    const diff = [diffOf('scripts/a.mjs', 4), diffOf('apps/web/src/b.ts', 1)].join('\n');
    const lcov = [
      'SF:/repo/scripts/a.mjs',
      'DA:1,1',
      'DA:2,1',
      'DA:3,1',
      'DA:4,1',
      'end_of_record',
      'SF:/repo/apps/web/src/b.ts',
      'DA:1,0',
      'end_of_record',
    ].join('\n');
    const r = gate({ diff, lcov });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/TOTAL new_coverage: 80\.0% {2}\(4\/5 lines\)/);
    expect(r.out.indexOf('apps/web/src/b.ts')).toBeLessThan(r.out.indexOf('scripts/a.mjs'));
    expect(r.out).toMatch(/✅ Diff coverage meets the 80% floor/);
  });

  it('honours DIFF_COVER_MIN', () => {
    const lcov = 'SF:/repo/scripts/a.mjs\nDA:1,1\nDA:2,0\nend_of_record';
    expect(gate({ diff: diffOf('scripts/a.mjs', 2), lcov }).code).toBe(1);
    expect(
      gate({ diff: diffOf('scripts/a.mjs', 2), lcov, env: { DIFF_COVER_MIN: '50' } }).code
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Python (#755): changed .py lines are judged from the Cobertura report
// ---------------------------------------------------------------------------

const COBERTURA = [
  '<coverage><sources><source>.</source></sources><packages><package name="x"><classes>',
  '<class name="a.py" filename="scripts/a.py"><lines>',
  '<line number="1" hits="2"/><line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/>',
  '</lines></class>',
  '<class name="b.py" filename="./scripts/sub\\b.py"><lines><line number="5" hits="1"/></lines></class>',
  '</classes></package></packages></coverage>',
].join('\n');

describe('parseCobertura', () => {
  it('reads per-line hits keyed by repo-relative filename', () => {
    const hits = parseCobertura(COBERTURA);
    expect(hits.get('scripts/a.py')).toEqual(
      new Map([
        [1, 2],
        [2, 0],
      ])
    );
    expect(hits.get('scripts/sub/b.py')).toEqual(new Map([[5, 1]]));
  });

  it('merges into an existing map without dropping lcov entries', () => {
    const into = new Map([['scripts/a.mjs', new Map([[1, 1]])]]);
    parseCobertura(COBERTURA, into);
    expect([...into.keys()].sort()).toEqual(['scripts/a.mjs', 'scripts/a.py', 'scripts/sub/b.py']);
  });
});

describe('runDiffCoverage with Python changes', () => {
  it('judges changed .py lines from the Python report and does not need the lcov', () => {
    const r = gate({ diff: diffOf('scripts/a.py', 2), lcov: null, py: COBERTURA });
    expect(r.readPaths).toEqual(['/repo/artifacts/coverage/python-coverage.xml']);
    expect(r.out).toMatch(/1\/2 {2}scripts\/a\.py/);
    expect(r.code).toBe(1); // 50% < 80%
  });

  it('reads both reports when JS and Python lines changed', () => {
    const diff = [diffOf('scripts/a.mjs', 1), diffOf('scripts/sub/b.py', 5)].join('\n');
    const lcov = 'SF:/repo/scripts/a.mjs\nDA:1,1\nend_of_record';
    const r = gate({ diff, lcov, py: COBERTURA });
    expect(r.readPaths).toHaveLength(2);
    expect(r.out).toMatch(/TOTAL new_coverage: 100\.0% {2}\(2\/2 lines\)/);
    expect(r.code).toBe(0);
  });

  it('fails with the command to run when the Python report is missing', () => {
    const r = gate({ diff: diffOf('scripts/a.py', 1), py: null });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(
      /python-coverage\.xml missing — run node scripts\/run-python-coverage\.mjs/
    );
  });

  it('honours DIFF_COVER_PY', () => {
    const r = gate({
      diff: diffOf('scripts/a.py', 1),
      py: COBERTURA,
      env: { DIFF_COVER_PY: 'out/py.xml' },
    });
    expect(r.readPaths).toEqual(['/repo/out/py.xml']);
    expect(r.code).toBe(0);
  });

  it('counts a changed .py file absent from the report as 0% (the #382 rule)', () => {
    const r = gate({ diff: diffOf('scripts/untested.py', 2), py: COBERTURA });
    expect(r.out).toMatch(/0\/2 {2}scripts\/untested\.py {2}\[no Python coverage — /);
    expect(r.code).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CLI wiring (spawned — Istanbul cannot see this, which is why the entry point
// is a thin wrapper listed in sonar.coverage.exclusions)
// ---------------------------------------------------------------------------

describe('scripts/check-diff-coverage.mjs', () => {
  it('runs end to end and passes when nothing changed (HEAD as base)', () => {
    const r = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'check-diff-coverage.mjs')],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, DIFF_COVER_BASE: 'HEAD' },
      }
    );
    expect(r.stdout).toMatch(/no coverable source lines changed/);
    expect(r.status).toBe(0);
  });
});
