import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluate, findEntry, globToRegExp, inZone, run } from '../check-generated-registry.mjs';

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

// A real repository, so the git and file handling are exercised, not stood in for.
describe('run', { timeout: 60_000 }, () => {
  const roots: string[] = [];
  // A git hook sets GIT_DIR and friends, which would point these tests at the real
  // repository. run() must keep inheriting them: pre-commit needs GIT_INDEX_FILE.
  const hookEnv: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const key of Object.keys(process.env).filter((k) => k.startsWith('GIT_'))) {
      hookEnv[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterAll(() => {
    Object.assign(process.env, hookEnv);
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });

  const REGISTRY = [
    'entries:',
    '  - path: artifacts/read.json',
    '    readers:',
    '      - file: reader.txt',
    '        contains: artifacts/read.json',
    '    outcome: tracked',
  ].join('\n');
  const LIST = 'tools/generated-paths.grandfathered.txt';

  function repo() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-registry-'));
    roots.push(root);
    const git = (...args: string[]) => {
      const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    };
    const write = (file: string, text: string) => {
      const full = path.join(root, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    write('tools/generated-paths.yml', REGISTRY);
    write(LIST, '# list\nartifacts/old.json\n');
    write('artifacts/old.json', '{}');
    write('reader.txt', 'artifacts/read.json');
    git('add', '.');
    git('commit', '-q', '-m', 'start');
    return { root, git, write };
  }

  function check(root: string, ...args: string[]) {
    const logs: string[] = [];
    const out = { log: (t: string) => logs.push(t), error: (t: string) => logs.push(t) };
    return { code: run(args, root, out), text: logs.join('\n') };
  }

  it('passes with nothing staged', () => {
    const { root } = repo();
    expect(check(root, '--staged')).toEqual({ code: 0, text: 'check-generated-registry: OK' });
  });

  it('refuses a staged file nothing reads, and names it', () => {
    const { root, git, write } = repo();
    write('artifacts/new.json', '{}');
    git('add', 'artifacts/new.json');
    const result = check(root, '--staged');
    expect(result.code).toBe(1);
    expect(result.text).toContain('artifacts/new.json');
  });

  it('passes a staged file with a reader, and reports its size against the limit', () => {
    const { root, git, write } = repo();
    write('artifacts/read.json', '{}');
    git('add', 'artifacts/read.json');
    expect(check(root, '--staged').code).toBe(0);
    write('artifacts/read.json', 'x'.repeat(1100 * 1024));
    git('add', 'artifacts/read.json');
    expect(check(root, '--staged').text).toContain('1024 KB');
  });

  it('passes a change to a grandfathered file, and a deletion', () => {
    const { root, git, write } = repo();
    write('artifacts/old.json', '{"a":1}');
    git('add', 'artifacts/old.json');
    expect(check(root, '--staged').code).toBe(0);
    git('rm', '-q', '--cached', 'artifacts/old.json');
    expect(check(root, '--staged').text).toContain('no longer tracked');
  });

  it('accepts evidence an attestation cites, and survives a broken attestation', () => {
    const { root, git, write } = repo();
    const dir = '.specify/sprints/sprint-1/attestations';
    write(`${dir}/PG-1/attestation.json`, '{"artifact_hashes":{"artifacts\\\\cited.json":"x"}}');
    write(`${dir}/PG-2/attestation.json`, 'not json');
    write(`${dir}/PG-3/attestation.json`, '{}');
    write('artifacts/cited.json', '{}');
    git('add', '.specify', 'artifacts/cited.json');
    expect(check(root, '--staged').code).toBe(0);
  });

  it('compares a branch with its base, and refuses growth of the list', () => {
    const { root, git, write } = repo();
    git('checkout', '-q', '-b', 'work');
    write('artifacts/extra.json', '{}');
    write(LIST, 'artifacts/old.json\nartifacts/extra.json\n');
    git('add', '.');
    git('commit', '-q', '-m', 'grow');
    const result = check(root, '--base', 'main');
    expect(result.code).toBe(1);
    expect(result.text).toContain('can only shrink');
  });

  it('finds broad staging in a workflow and a hook', () => {
    const { root, git, write } = repo();
    write('.github/workflows/x.yml', 'run: git add artifacts/\n');
    write('.husky/pre-commit', 'git add .\n');
    git('add', '.github', '.husky');
    const { text } = check(root, '--staged');
    expect(text).toContain('.github/workflows/x.yml:1');
    expect(text).toContain('.husky/pre-commit:1');
  });

  it.each([
    ['no mode', []],
    ['both modes', ['--staged', '--base', 'main']],
    ['--base with no ref', ['--base']],
    ['a base that does not exist', ['--base', 'no-such-ref']],
  ])('fails closed with %s', (_name, args) => {
    const { root } = repo();
    expect(check(root, ...(args as string[])).code).toBe(1);
  });

  it('fails closed with no registry, and accepts an empty one', () => {
    const { root, write } = repo();
    write('tools/generated-paths.yml', '');
    expect(check(root, '--staged').code).toBe(0);
    fs.rmSync(path.join(root, 'tools/generated-paths.yml'));
    expect(check(root, '--staged').code).toBe(1);
  });
});
