/**
 * The red-main report (scripts/ci/main-red-report.mjs): which commits a failure could
 * have come from, and which tests failed, read from the reports the jobs already write.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  describeRange,
  failuresFromJunit,
  failuresFromVitestJson,
  formatReport,
  main,
  MAX_LISTED,
  parseArgs,
  readReport,
} from '../ci/main-red-report.mjs';

const vitestReport = {
  testResults: [
    {
      name: 'apps/api/src/a.test.ts',
      status: 'failed',
      assertionResults: [
        { status: 'passed', fullName: 'a works' },
        {
          status: 'failed',
          fullName: 'a rejects a bad id',
          failureMessages: ['\nAssertionError: expected 1 to be 2\n    at a.test.ts:3'],
        },
      ],
    },
    {
      name: 'apps/api/src/b.test.ts',
      status: 'failed',
      message: 'Cannot find module x',
      assertionResults: [],
    },
    {
      name: 'apps/api/src/c.test.ts',
      status: 'passed',
      assertionResults: [{ status: 'passed', title: 'c' }],
    },
  ],
};

const junit = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="web">
    <testcase classname="apps/web/x.test.tsx" name="renders the &quot;empty&quot; state" time="0.1"/>
    <testcase classname="apps/web/y.test.tsx" name="saves &amp; closes" time="0.2">
      <failure message="expected &lt;div&gt; to be visible" type="AssertionError">stack</failure>
    </testcase>
    <testcase file="apps/web/z.test.tsx" name="loads" time="0.3"><error message="boom"/></testcase>
  </testsuite>
</testsuites>`;

describe('failuresFromVitestJson', () => {
  it('lists failed assertions with their first message line, and files that failed to load', () => {
    expect(failuresFromVitestJson(vitestReport)).toEqual([
      {
        file: 'apps/api/src/a.test.ts',
        name: 'a rejects a bad id',
        message: 'AssertionError: expected 1 to be 2',
      },
      {
        file: 'apps/api/src/b.test.ts',
        name: '(file failed to run)',
        message: 'Cannot find module x',
      },
    ]);
  });

  it('cuts a long first message line to 200 characters', () => {
    const long = 'x'.repeat(250);
    const [f] = failuresFromVitestJson({
      testResults: [
        {
          name: 'f',
          assertionResults: [{ status: 'failed', fullName: 'n', failureMessages: [long] }],
        },
      ],
    });
    expect(f.message).toHaveLength(200);
    expect(f.message.endsWith('...')).toBe(true);
  });

  it('names an unnamed test and file instead of dropping it', () => {
    expect(
      failuresFromVitestJson({ testResults: [{ assertionResults: [{ status: 'failed' }] }] })
    ).toEqual([{ file: '(unknown file)', name: '(unnamed test)', message: '' }]);
    expect(failuresFromJunit('<testcase><failure/></testcase>')).toEqual([
      { file: '(unknown file)', name: '(unnamed test)', message: '' },
    ]);
  });

  it('returns nothing for an empty or green report', () => {
    expect(failuresFromVitestJson({})).toEqual([]);
    expect(failuresFromVitestJson({ testResults: [vitestReport.testResults[2]] })).toEqual([]);
  });

  it('falls back to the test title and the file path fields', () => {
    const r = failuresFromVitestJson({
      testResults: [
        { testFilePath: '/r/t.test.ts', assertionResults: [{ status: 'failed', title: 't' }] },
      ],
    });
    expect(r).toEqual([{ file: '/r/t.test.ts', name: 't', message: '' }]);
  });
});

describe('failuresFromJunit', () => {
  it('lists failure and error cases, unescaping XML entities', () => {
    expect(failuresFromJunit(junit)).toEqual([
      {
        file: 'apps/web/y.test.tsx',
        name: 'saves & closes',
        message: 'expected <div> to be visible',
      },
      { file: 'apps/web/z.test.tsx', name: 'loads', message: 'boom' },
    ]);
  });

  it('returns nothing when every case passed', () => {
    expect(failuresFromJunit('<testsuite><testcase name="a" classname="f"/></testsuite>')).toEqual(
      []
    );
  });
});

describe('readReport', () => {
  it('reads JSON and XML reports by extension', () => {
    const files: Record<string, string> = {
      'u.json': JSON.stringify(vitestReport),
      'm.xml': junit,
    };
    const read = (p: string) => files[p];
    expect(readReport('u.json', read).failures).toHaveLength(2);
    expect(readReport('m.xml', read).failures).toHaveLength(2);
  });

  it('marks a missing or unreadable report instead of skipping it', () => {
    const missing = () => {
      throw new Error('ENOENT');
    };
    expect(readReport('gone.json', missing)).toEqual({
      error: 'missing (the job may have stopped before writing it)',
    });
    expect(readReport('bad.json', () => '{ not json')).toEqual({ error: 'unreadable' });
  });
});

describe('describeRange', () => {
  it('names the batch since the last green run, a single commit, or everything', () => {
    expect(describeRange('aaaaaaaaa111', 'bbbbbbbbb222')).toBe(
      '`aaaaaaaaa..bbbbbbbbb` (after the last green run, up to this one)'
    );
    expect(describeRange('ccccccccc333', 'ccccccccc333')).toBe('`ccccccccc` only');
    expect(describeRange('', 'ddddddddd444')).toBe(
      'everything up to `ddddddddd` (no earlier green run of this workflow)'
    );
  });
});

describe('formatReport', () => {
  it('lists the commits, run, jobs that are not green, failing tests and unread reports', () => {
    const body = formatReport({
      from: 'aaaaaaaaa111',
      to: 'bbbbbbbbb222',
      runUrl: 'https://example.invalid/run/1',
      jobs: { unit: 'failure', integration: 'success', property: 'skipped', build: 'cancelled' },
      reports: [
        { file: 'u.json', failures: [{ file: 'f.test.ts', name: 'breaks', message: 'boom' }] },
        { file: 'p.json', error: 'unreadable' },
      ],
    });
    expect(body).toContain('- Commits: `aaaaaaaaa..bbbbbbbbb`');
    expect(body).toContain('- Run: https://example.invalid/run/1');
    expect(body).toContain('- Jobs not green: unit (failure), build (cancelled)');
    expect(body).toContain('### Failing tests (1)');
    expect(body).toContain('- `f.test.ts` › breaks — boom');
    expect(body).toContain('- `p.json`: unreadable');
    expect(body).toContain('Nothing was reverted.');
  });

  it('says when no failing test was found, and caps a long list', () => {
    expect(formatReport({ from: '', to: 'b', reports: [] })).toContain('No failing test found');
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => ({
      file: 'f',
      name: `t${i}`,
      message: '',
    }));
    const body = formatReport({
      from: 'a',
      to: 'b',
      reports: [{ file: 'u.json', failures: many }],
    });
    expect(body).toContain(`### Failing tests (${MAX_LISTED + 3})`);
    expect(body).toContain('- …and 3 more (see the run)');
    expect(body).not.toContain(`› t${MAX_LISTED}\n`);
  });
});

describe('parseArgs and main', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses the flags and treats the rest as report files', () => {
    expect(
      parseArgs([
        '--from',
        'a',
        '--to',
        'b',
        '--run-url',
        'u',
        '--jobs',
        '{"unit":"failure"}',
        '--out',
        'o.md',
        'x.json',
      ])
    ).toEqual({
      from: 'a',
      to: 'b',
      runUrl: 'u',
      jobs: { unit: 'failure' },
      out: 'o.md',
      files: ['x.json'],
    });
    expect(parseArgs([]).jobs).toEqual({});
    // A flag at the end with no value reads as empty, not as the next file.
    expect(parseArgs(['--from', '--to'])).toMatchObject({ from: '--to', to: '' });
    expect(parseArgs(['--jobs', ''])).toMatchObject({ jobs: {} });
  });

  it('prints the body without --out or a job summary', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(main(['--to', 'b'], {})).toBe(0);
    expect(String(write.mock.calls[0][0])).toContain('No failing test found');
  });

  it('writes the body to --out and the job summary', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-red-'));
    try {
      const report = path.join(dir, 'u.json');
      fs.writeFileSync(report, JSON.stringify(vitestReport));
      const out = path.join(dir, 'body.md');
      const summary = path.join(dir, 'summary.md');
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      expect(
        main(['--to', 'bbbbbbbbb222', '--out', out, report], { GITHUB_STEP_SUMMARY: summary })
      ).toBe(0);
      expect(fs.readFileSync(out, 'utf8')).toContain('a rejects a bad id');
      expect(fs.readFileSync(summary, 'utf8')).toBe(fs.readFileSync(out, 'utf8'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
