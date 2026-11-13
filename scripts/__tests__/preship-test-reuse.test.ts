/**
 * scripts/lib/preship-test-reuse.mjs: the unit-tests step takes its verdict from
 * the coverage run of the same commit and scope instead of running the tests
 * a second time.
 */
import { describe, it, expect } from 'vitest';
import {
  COVERAGE_PROJECTS,
  planUnitRuns,
  remainingRuns,
  reuseVerdict,
  scopeSignature,
  unitProjects,
} from '../lib/preship-test-reuse.mjs';

const ALL = [...COVERAGE_PROJECTS, 'property', 'webhooks'].sort();
const HEAD = 'a'.repeat(40);
const FULL = { scope: 'full', reason: 'x', files: [] as string[] };
const RELATED = { scope: 'related', reason: 'x', files: ['apps/web/src/a.ts'] };

function record(over: Record<string, unknown> = {}) {
  return {
    headSha: HEAD,
    signature: 'full',
    allowTestFailures: false,
    results: COVERAGE_PROJECTS.map((project) => ({ project, testFailures: 0, code: 0 })),
    ...over,
  };
}

describe('scopeSignature', () => {
  it('is the same for the same selection, whatever the order', () => {
    expect(scopeSignature(null)).toBe('full');
    expect(scopeSignature(['b', 'a'], ['web'])).toBe(scopeSignature(['a', 'b'], ['web']));
    expect(scopeSignature(['a'], [])).not.toBe(scopeSignature(['a'], ['web']));
  });
});

describe('unitProjects', () => {
  it('lists what the unit step would run, never integration', () => {
    expect(unitProjects(FULL, ALL)).not.toContain('integration');
    expect(unitProjects(FULL, ALL)).toHaveLength(ALL.length - 1);
    expect(unitProjects(RELATED, ALL)).toHaveLength(ALL.length - 1);
    expect(unitProjects({ ...RELATED, files: [], projects: ['web', 'integration'] }, ALL)).toEqual([
      'web',
    ]);
    expect(unitProjects({ scope: 'none', files: [] }, ALL)).toEqual([]);
  });
});

describe('reuseVerdict', () => {
  const want = { headSha: HEAD, signature: 'full', needed: unitProjects(FULL, ALL) };

  it('reuses a clean record for this commit and scope; runs the uncovered projects here', () => {
    expect(reuseVerdict(record(), want)).toEqual({
      reuse: true,
      failed: [],
      covered: want.needed.filter((p) => COVERAGE_PROJECTS.includes(p)),
      remaining: ['property', 'webhooks'],
    });
  });

  it('reports the projects whose coverage run failed', () => {
    const r = record({
      results: COVERAGE_PROJECTS.map((project) => ({
        project,
        testFailures: ({ api: 2, web: -1 } as Record<string, number>)[project] ?? 0,
        code: 0,
      })),
    });
    expect(reuseVerdict(r, want)).toMatchObject({ reuse: true, failed: ['api', 'web'] });
  });

  it.each([
    [null, 'no coverage record'],
    ['text', 'no coverage record'],
    [record({ headSha: 'b'.repeat(40) }), 'another commit'],
    [record({ signature: scopeSignature(['x.ts']) }), 'another test scope'],
    [record({ allowTestFailures: true }), 'allowed test failures'],
    [record({ results: [{ project: 'web', testFailures: 0, code: 0 }] }), 'no coverage result for'],
    [record({ results: 'nope' }), 'no coverage result for'],
  ])('does not reuse %#', (rec, why) => {
    const v = reuseVerdict(rec, want);
    expect(v.reuse).toBe(false);
    expect((v as { why: string }).why).toContain(why);
  });

  it('does not reuse without a commit to match', () => {
    expect(reuseVerdict(record(), { ...want, headSha: null }).reuse).toBe(false);
  });
});

describe('remainingRuns', () => {
  it('runs the uncovered projects in the same scope', () => {
    expect(remainingRuns(FULL, ['property', 'webhooks'])).toEqual([
      ['run', '--project=property', '--project=webhooks'],
    ]);
    expect(remainingRuns(RELATED, ['property'])).toEqual([
      ['related', '--run', '--passWithNoTests', '--project=property', 'apps/web/src/a.ts'],
    ]);
    expect(remainingRuns({ ...RELATED, projects: ['webhooks'] }, ['property', 'webhooks'])).toEqual(
      [
        ['run', '--project=webhooks'],
        ['related', '--run', '--passWithNoTests', '--project=property', 'apps/web/src/a.ts'],
      ]
    );
    expect(remainingRuns({ ...RELATED, files: [] }, ['property'])).toEqual([]);
    expect(remainingRuns(FULL, [])).toEqual([]);
  });
});

describe('planUnitRuns', () => {
  it('takes the coverage verdict and runs only what it does not cover', () => {
    const plan = planUnitRuns({ scope: FULL, names: ALL, record: record(), headSha: HEAD });
    expect(plan.runs).toEqual([['run', '--project=property', '--project=webhooks']]);
    expect(plan.failed).toEqual([]);
    expect(plan.log[0]).toMatch(
      /^taking 18 project\(s\) from this commit's coverage run; running property, webhooks here$/
    );
  });

  it('runs the tests itself when the record does not match', () => {
    const plan = planUnitRuns({ scope: FULL, names: ALL, record: null, headSha: HEAD });
    expect(plan.runs).toEqual([['run', '--project=!integration']]);
    expect(plan.log).toEqual(['running the tests here (no coverage record)']);
  });

  it('falls back to the full suite when the project list cannot be read', () => {
    const plan = planUnitRuns({
      scope: { ...RELATED, projects: ['web'] },
      names: null,
      record: record(),
      headSha: HEAD,
    });
    expect(plan.runs).toEqual([['run', '--project=!integration']]);
    expect(plan.log[0]).toMatch(/cannot read the vitest project list/);
  });

  it('runs nothing for an empty scope', () => {
    expect(
      planUnitRuns({ scope: { scope: 'none', files: [] }, names: ALL, record: null, headSha: HEAD })
        .runs
    ).toEqual([]);
  });

  it('reports coverage failures for the step to fail on', () => {
    const rec = record({
      signature: scopeSignature(RELATED.files, []),
      results: COVERAGE_PROJECTS.map((project) => ({
        project,
        testFailures: project === 'root' ? 1 : 0,
        code: 1,
      })),
    });
    expect(planUnitRuns({ scope: RELATED, names: ALL, record: rec, headSha: HEAD }).failed).toEqual(
      ['root']
    );
  });
});
