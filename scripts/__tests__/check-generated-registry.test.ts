import { describe, expect, it } from 'vitest';
import { evaluate, findEntry, globToRegExp, inZone } from '../check-generated-registry.mjs';

const READER = '.github/workflows/drift.yml';
const FILE = 'artifacts/reports/new-report.json';

function context(over: Record<string, unknown> = {}) {
  return {
    changes: [{ status: 'A', file: FILE }],
    tracked: new Set<string>(),
    registry: { entries: [] },
    grandfathered: new Set<string>(),
    baseGrandfathered: null,
    scripts: [],
    readFile: (file: string) => (file === READER ? `reads ${FILE}` : null),
    sizeKb: () => 1,
    isIgnored: () => false,
    isCited: () => false,
    ...over,
  };
}

const entry = (over: Record<string, unknown> = {}) => ({
  path: FILE,
  writer: 'tools/scripts/report.ts',
  readers: [{ file: READER, contains: FILE }],
  outcome: 'tracked',
  ...over,
});
const registered = (over: Record<string, unknown> = {}) => ({ entries: [entry(over)] });

describe('generated zones', () => {
  it.each([
    'artifacts/x.json',
    'packages/domain/artifacts/y.json',
    '.lighthouseci/lhr.json',
    '.specify/sprints/sprint-18/execution/PG-1/run.txt',
    '.specify/sprints/sprint-18/context/PG-1/ctx.json',
    'apps/web/eslint-sonar-output.json',
    'apps/web/results.sarif',
    'coverage/lcov.info',
    'reports/junit-web.xml',
  ])('covers %s', (file) => expect(inZone(file)).toBe(true));

  it.each([
    'apps/web/src/page.tsx',
    '.specify/sprints/sprint-18/attestations/PG-1/attestation.json',
    '.specify/sprints/sprint-18/specifications/PG-1-spec.md',
  ])('leaves %s alone', (file) => expect(inZone(file)).toBe(false));
});

describe('globs', () => {
  it('keeps * inside a folder and lets ** cross folders', () => {
    expect(globToRegExp('a/*/c.json').test('a/b/c.json')).toBe(true);
    expect(globToRegExp('a/*/c.json').test('a/b/x/c.json')).toBe(false);
    expect(globToRegExp('a/**/c.json').test('a/b/x/c.json')).toBe(true);
    expect(globToRegExp('a/**/c.json').test('a/c.json')).toBe(true);
    expect(globToRegExp('a.json').test('axjson')).toBe(false);
  });

  it('finds the entry that matches', () => {
    expect(findEntry(registered(), FILE)?.path).toBe(FILE);
    expect(findEntry(registered(), 'artifacts/other.json')).toBeUndefined();
  });
});

describe('a change in a zone', () => {
  it('is refused with no entry, naming the file and what to do', () => {
    const [problem] = evaluate(context());
    expect(problem).toContain(FILE);
    expect(problem).toContain('tools/generated-paths.yml');
  });

  it('passes with an entry whose reader names it', () => {
    expect(evaluate(context({ registry: registered() }))).toEqual([]);
  });

  it('is refused when the reader file has gone', () => {
    const registry = registered({ readers: [{ file: 'gone.yml', contains: FILE }] });
    expect(evaluate(context({ registry })).join()).toContain('no longer exists');
  });

  it('is refused when the reader no longer names it', () => {
    const readFile = () => 'something else';
    expect(evaluate(context({ registry: registered(), readFile })).join()).toContain(
      'no longer contains'
    );
  });

  it.each([
    ['a test', 'scripts/__tests__/report.test.ts'],
    ['a doc', 'docs/report.md'],
    ['its own writer', 'tools/scripts/report.ts'],
    ['.gitignore', '.gitignore'],
    ['a lint exclusion', 'tools/lint/artifact-paths.ts'],
  ])('is refused when the only reader is %s', (_name, file) => {
    const registry = registered({ readers: [{ file, contains: FILE }] });
    const problems = evaluate(context({ registry, readFile: () => FILE }));
    expect(problems.join()).toContain('nothing reads it');
  });

  it('is refused when ignored and force-added without a reason', () => {
    const isIgnored = () => true;
    expect(evaluate(context({ registry: registered(), isIgnored })).join()).toContain(
      'force: true and a reason'
    );
    expect(
      evaluate(context({ registry: registered({ force: true }), isIgnored })).join()
    ).toContain('force: true and a reason');
    expect(
      evaluate(context({ registry: registered({ force: true, reason: 'why' }), isIgnored }))
    ).toEqual([]);
  });

  it('is refused over the size limit, which an entry can raise', () => {
    const sizeKb = () => 2000;
    expect(evaluate(context({ registry: registered(), sizeKb })).join()).toContain('1024 KB');
    expect(evaluate(context({ registry: registered({ max_kb: 4096 }), sizeKb }))).toEqual([]);
  });

  it('is refused when registered as untracked, even with readers', () => {
    const registry = registered({ outcome: 'untracked' });
    expect(evaluate(context({ registry })).join()).toContain('must not be committed');
  });

  it('passes when grandfathered, for changes too', () => {
    const grandfathered = new Set([FILE]);
    const tracked = new Set([FILE]);
    const changes = [{ status: 'M', file: FILE }];
    expect(evaluate(context({ grandfathered, tracked, changes }))).toEqual([]);
  });

  it('passes for a deletion', () => {
    expect(evaluate(context({ changes: [{ status: 'D', file: FILE }] }))).toEqual([]);
  });

  it('passes outside the zones', () => {
    expect(evaluate(context({ changes: [{ status: 'A', file: 'src/a.ts' }] }))).toEqual([]);
  });
});

describe('evidence', () => {
  const log = '.specify/sprints/sprint-18/execution/PG-1/run.txt';

  it('refuses a raw log nobody cites', () => {
    const changes = [{ status: 'A', file: log }];
    expect(evaluate(context({ changes }))).toHaveLength(1);
  });

  it('allows a raw log an attestation cites, though .gitignore ignores it', () => {
    const changes = [{ status: 'A', file: log }];
    const isCited = (file: string) => file === log;
    expect(evaluate(context({ changes, isCited, isIgnored: () => true }))).toEqual([]);
  });

  it('allows Lighthouse JSON a KPI cites and refuses an uncited rerun', () => {
    const report = 'artifacts/lighthouse/PG-1/run.json';
    const changes = [{ status: 'A', file: report }];
    expect(evaluate(context({ changes, isCited: () => true }))).toEqual([]);
    expect(evaluate(context({ changes }))).toHaveLength(1);
  });

  it('refuses Lighthouse HTML even when cited', () => {
    const changes = [{ status: 'A', file: 'artifacts/lighthouse/PG-1/run.html' }];
    expect(evaluate(context({ changes, isCited: () => true })).join()).toContain('Lighthouse HTML');
  });
});

describe('the grandfather list', () => {
  const tracked = new Set(['artifacts/a.json', 'artifacts/b.json']);

  it('can shrink', () => {
    const problems = evaluate(
      context({
        changes: [],
        tracked,
        grandfathered: new Set(['artifacts/a.json']),
        baseGrandfathered: new Set(['artifacts/a.json', 'artifacts/b.json']),
      })
    );
    expect(problems).toEqual([]);
  });

  it('cannot grow', () => {
    const problems = evaluate(
      context({
        changes: [],
        tracked,
        grandfathered: new Set(['artifacts/a.json', 'artifacts/b.json']),
        baseGrandfathered: new Set(['artifacts/a.json']),
      })
    );
    expect(problems.join()).toContain('can only shrink');
  });

  it('must drop a file that is no longer tracked', () => {
    const problems = evaluate(
      context({ changes: [], tracked, grandfathered: new Set(['artifacts/gone.json']) })
    );
    expect(problems.join()).toContain('no longer tracked');
  });
});

describe('staging in workflows and hooks', () => {
  const scan = (text: string) =>
    evaluate(context({ changes: [], scripts: [{ file: '.github/workflows/x.yml', text }] }));

  it.each([
    'git add artifacts/',
    'git add artifacts',
    'git add .',
    'git add -A',
    'git add --all',
    'git add -f .',
  ])('refuses "%s"', (line) => {
    expect(scan(`  run: |\n    ${line}\n`).join()).toContain('.github/workflows/x.yml:2');
  });

  it.each(['git add artifacts/benchmarks/baseline.json', 'git add -f src/a.ts', '# git add .'])(
    'allows "%s"',
    (line) => {
      expect(scan(line)).toEqual([]);
    }
  );
});
