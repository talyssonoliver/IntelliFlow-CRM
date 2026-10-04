/**
 * scripts/lib/sonar-scope.mjs — reads SonarCloud's scope from
 * sonar-project.properties so the local diff-coverage gate cannot drift from it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  listProperty,
  loadSonarScope,
  parseProperties,
  sonarGlobToRegExp,
  sonarScopeFromProperties,
} from '../lib/sonar-scope.mjs';
import { TOOLING_ROOTS } from '../lib/coverage-floor.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('parseProperties', () => {
  it('joins backslash continuations and skips comments and blank lines', () => {
    const props = parseProperties(
      [
        '# comment',
        '! also a comment',
        '',
        'sonar.sources=\\',
        '  apps/api/src,\\',
        '  scripts',
        'sonar.projectKey = key ',
        'not-a-property-line',
      ].join('\r\n')
    );
    expect(props.get('sonar.sources')).toBe('apps/api/src,scripts');
    expect(props.get('sonar.projectKey')).toBe('key');
    expect(props.has('not-a-property-line')).toBe(false);
  });

  it('keeps a trailing backslash on the last line rather than reading past the end', () => {
    expect(parseProperties('a=b\\').get('a')).toBe('b\\');
  });
});

describe('listProperty', () => {
  it('splits on commas, trims, and drops empty entries', () => {
    const props = new Map([['k', ' a , b,, c ,']]);
    expect(listProperty(props, 'k')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list for a missing key', () => {
    expect(listProperty(new Map(), 'missing')).toEqual([]);
  });
});

describe('sonarGlobToRegExp', () => {
  it.each([
    ['**/*.test.ts', 'a.test.ts', true],
    ['**/*.test.ts', 'apps/web/src/x.test.ts', true],
    ['**/*.test.ts', 'apps/web/src/x.test.tsx', false],
    ['apps/web/src/app/**/page.tsx', 'apps/web/src/app/page.tsx', true],
    ['apps/web/src/app/**/page.tsx', 'apps/web/src/app/a/b/page.tsx', true],
    ['apps/api/src/modules/legal/*.router.ts', 'apps/api/src/modules/legal/cases.router.ts', true],
    [
      'apps/api/src/modules/legal/*.router.ts',
      'apps/api/src/modules/legal/x/cases.router.ts',
      false,
    ],
    ['apps/project-tracker/app/api/**', 'apps/project-tracker/app/api/x/route.ts', true],
    ['scripts/check-?.mjs', 'scripts/check-a.mjs', true],
    ['scripts/check-?.mjs', 'scripts/check-ab.mjs', false],
    ['a.b(c)+[d]{e}^$|.ts', 'a.b(c)+[d]{e}^$|.ts', true],
    ['a.b(c)+[d]{e}^$|.ts', 'aXb(c)+[d]{e}^$|.ts', false],
  ])('%s matches %s → %s', (glob, file, expected) => {
    expect(sonarGlobToRegExp(glob).test(file)).toBe(expected);
  });
});

describe('sonarScopeFromProperties', () => {
  it('strips trailing slashes from source roots and compiles the exclusion lists', () => {
    const scope = sonarScopeFromProperties(
      'sonar.sources=apps/api/src/,tools\nsonar.exclusions=**/*.py\nsonar.coverage.exclusions=tools/x.mjs'
    );
    expect(scope.sourceRoots).toEqual(['apps/api/src', 'tools']);
    expect(scope.exclusions[0].test('tools/a/b.py')).toBe(true);
    expect(scope.coverageExclusions[0].test('tools/x.mjs')).toBe(true);
  });

  it('refuses a properties file with no sonar.sources', () => {
    expect(() => sonarScopeFromProperties('sonar.projectKey=x')).toThrow(/no sonar.sources/);
  });
});

describe('the committed sonar-project.properties', () => {
  const scope = loadSonarScope(REPO_ROOT);
  const excluded = (f: string) => scope.exclusions.some((re) => re.test(f));

  it('puts repo tooling in scope', () => {
    expect(scope.sourceRoots).toEqual(expect.arrayContaining(['scripts', 'tools']));
  });

  it('agrees with the coverage floor about which roots are tooling', () => {
    for (const root of TOOLING_ROOTS) expect(scope.sourceRoots).toContain(root);
  });

  it('keeps tooling tests, fixtures and non-JS files out of analysis', () => {
    expect(excluded('scripts/__tests__/check-diff-coverage.test.ts')).toBe(true);
    expect(excluded('tools/scripts/__tests__/helper.ts')).toBe(true);
    expect(excluded('tools/scripts/security/fixtures/gitleaks-postgres-literal.fixture.yml')).toBe(
      true
    );
    expect(excluded('tools/audit/run_audit.py')).toBe(true);
    expect(excluded('tools/scripts/pgvector-test.sql')).toBe(true);
    expect(excluded('scripts/ci/run.sh')).toBe(true);
  });

  // The local gate never counts a test file as coverable (and Vitest never
  // instruments one), so Sonar must not analyse one as source either — for
  // every extension, or a new scripts/foo.test.mjs passes pre-ship and is
  // scored as uncovered source by Sonar.
  it.each(['ts', 'tsx', 'js', 'mjs', 'cjs'])(
    'excludes .test.%s and .spec.%s files anywhere in sources',
    (ext) => {
      for (const kind of ['test', 'spec']) {
        for (const dir of ['scripts', 'tools/scripts/lib', 'apps/web/src']) {
          expect(excluded(`${dir}/foo.${kind}.${ext}`)).toBe(true);
        }
      }
    }
  );

  // Replays the committed scope over every tracked tooling file: only
  // JavaScript/TypeScript may remain (owner decision: JS/TS only, Python later).
  it('leaves only JavaScript/TypeScript tooling in analysis', () => {
    const tracked = execFileSync('git', ['ls-files', 'scripts', 'tools'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(0);
    const analysedNonJs = tracked.filter((f) => !excluded(f) && !/\.(ts|tsx|js|mjs|cjs)$/.test(f));
    expect(analysedNonJs).toEqual([]);
  });

  it('analyses tooling JavaScript/TypeScript', () => {
    expect(excluded('scripts/lib/diff-coverage.mjs')).toBe(false);
    expect(excluded('tools/scripts/lib/contract-parser.ts')).toBe(false);
  });

  it('keeps analysing product test helpers, but expects no coverage of them', () => {
    const helper = 'apps/web/src/components/deals/__tests__/deal-test-utils.tsx';
    expect(excluded(helper)).toBe(false);
    expect(scope.coverageExclusions.some((re) => re.test(helper))).toBe(true);
    expect(
      scope.coverageExclusions.some((re) => re.test('apps/web/src/__mocks__/next/navigation.ts'))
    ).toBe(true);
  });

  // Owner decision 2026-10-04: S4036 (command run by name via PATH) is ignored
  // for repo tooling only. Any widening of that ignore to app code fails here.
  it('ignores rule S4036 only under scripts/ and tools/', () => {
    const props = parseProperties(
      fs.readFileSync(path.join(REPO_ROOT, 'sonar-project.properties'), 'utf8')
    );
    const keys = listProperty(props, 'sonar.issue.ignore.multicriteria');
    const s4036 = keys.filter((k) =>
      /:S4036$/.test(props.get(`sonar.issue.ignore.multicriteria.${k}.ruleKey`) ?? '')
    );
    expect(s4036.length).toBeGreaterThan(0);
    for (const k of s4036) {
      expect(props.get(`sonar.issue.ignore.multicriteria.${k}.resourceKey`)).toMatch(
        /^(scripts|tools)\//
      );
    }
  });
});
