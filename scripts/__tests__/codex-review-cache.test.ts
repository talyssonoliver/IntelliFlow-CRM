/**
 * Tests for scripts/lib/codex-review-cache.mjs — one semantic review per head,
 * and LOW findings that go to a follow-up issue instead of blocking.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

import {
  cacheRecord,
  cachedFindings,
  CACHE_VERSION,
  diffHash,
  findingEntry,
  followupBody,
  followupTitle,
  ghRunner,
  isLow,
  judge,
  listedFingerprints,
  lookupReview,
  lowFindingsLine,
  makeReviewIo,
  NO_CACHE_ENV,
  recordLowFindings,
  recordToStore,
  reviewReport,
} from '../lib/codex-review-cache.mjs';

const finding = (fingerprint: string, severity = 'low', extra = {}) => ({
  severity,
  file: 'apps/web/src/a.tsx',
  line: 12,
  rule: 'off-by-one',
  issue: 'loop stops one short',
  evidence: 'for (i < n - 1)',
  fix: 'use i < n',
  fingerprint,
  ...extra,
});

describe('diffHash', () => {
  const a = [{ file: 'x.ts', text: '@@ -1 +1 @@\n-a\n+b\n' }];

  it('is stable for the same diff', () => {
    expect(diffHash(a)).toBe(diffHash([{ ...a[0] }]));
  });

  it('changes when the text or the file changes', () => {
    expect(diffHash(a)).not.toBe(diffHash([{ file: 'x.ts', text: '@@ -1 +1 @@\n-a\n+c\n' }]));
    expect(diffHash(a)).not.toBe(diffHash([{ file: 'y.ts', text: a[0].text }]));
  });

  it('does not let a file boundary move unnoticed', () => {
    expect(diffHash([{ file: 'ab', text: 'c' }])).not.toBe(diffHash([{ file: 'a', text: 'bc' }]));
  });
});

describe('cachedFindings', () => {
  const record = cacheRecord({
    head: 'h1',
    hash: 'd1',
    baseRef: 'origin/main',
    reviewer: 'codex',
    findings: [finding('f1')],
    now: new Date('2026-11-10T22:00:00Z'),
  });
  const text = JSON.stringify(record);

  it('hits for the same head and diff', () => {
    const hit = cachedFindings(text, { head: 'h1', hash: 'd1', env: {} });
    expect(hit?.findings).toHaveLength(1);
    expect(hit?.reviewer).toBe('codex');
    expect(hit?.version).toBe(CACHE_VERSION);
  });

  it.each([
    ['another head', { head: 'h2', hash: 'd1' }],
    ['another diff', { head: 'h1', hash: 'd2' }],
    ['no head', { head: '', hash: 'd1' }],
  ])('misses for %s', (_name, key) => {
    expect(cachedFindings(text, { ...key, env: {} })).toBeNull();
  });

  it('misses when forced', () => {
    expect(
      cachedFindings(text, { head: 'h1', hash: 'd1', env: { [NO_CACHE_ENV]: '1' } })
    ).toBeNull();
  });

  it.each([
    [''],
    ['{'],
    ['null'],
    [JSON.stringify({ ...record, version: 0 })],
    [JSON.stringify({ ...record, findings: 'x' })],
  ])('misses on a malformed cache %#', (bad) => {
    expect(cachedFindings(bad, { head: 'h1', hash: 'd1', env: {} })).toBeNull();
  });
});

describe('judge', () => {
  it('blocks on critical, high and medium; not on low', () => {
    const r = judge(
      [finding('a', 'critical'), finding('b', 'high'), finding('c', 'medium'), finding('d', 'low')],
      new Map()
    );
    expect(r.blocking.map((f) => f.fingerprint)).toEqual(['a', 'b', 'c']);
    expect(r.low.map((f) => f.fingerprint)).toEqual(['d']);
    expect(r.verdict).toBe('FAIL');
  });

  it('passes with only LOW findings', () => {
    const r = judge([finding('d', 'low'), finding('e', 'LOW')], new Map());
    expect(r.verdict).toBe('PASS');
    expect(r.low).toHaveLength(2);
  });

  it('keeps waivers working for every severity', () => {
    const r = judge(
      [finding('a', 'high'), finding('d', 'low')],
      new Map([
        ['a', {}],
        ['d', {}],
      ])
    );
    expect(r.waived).toHaveLength(2);
    expect(r.low).toHaveLength(0);
    expect(r.verdict).toBe('PASS');
  });

  it.each([[undefined], [''], ['info'], ['minor']])('blocks on an unknown severity %j', (sev) => {
    expect(isLow({ severity: sev })).toBe(false);
    expect(judge([{ ...finding('x'), severity: sev }], new Map()).verdict).toBe('FAIL');
  });
});

describe('follow-up issue body', () => {
  it('lists each finding once, with a fingerprint marker', () => {
    const body = followupBody({
      existing: '',
      branch: 'feat/x',
      pr: '42',
      head: 'abcdef1234567',
      findings: [finding('aa11'), finding('aa11'), finding('bb22')],
    });
    expect(body).toContain('Pull request: #42');
    expect([...listedFingerprints(body)]).toEqual(['aa11', 'bb22']);
  });

  it('names the branch when there is no PR yet', () => {
    const body = followupBody({
      existing: '',
      branch: 'feat/x',
      pr: null,
      head: 'h',
      findings: [finding('aa11')],
    });
    expect(body).toContain('Branch: `feat/x`');
  });

  it('appends only new findings, and is null when nothing is new', () => {
    const first = followupBody({
      existing: '',
      branch: 'b',
      pr: null,
      head: 'h',
      findings: [finding('aa11')],
    });
    const second = followupBody({
      existing: first,
      branch: 'b',
      pr: null,
      head: 'h',
      findings: [finding('aa11'), finding('cc33')],
    });
    expect([...listedFingerprints(second)]).toEqual(['aa11', 'cc33']);
    expect(second.startsWith(first.trimEnd())).toBe(true);
    expect(
      followupBody({
        existing: second,
        branch: 'b',
        pr: null,
        head: 'h',
        findings: [finding('cc33')],
      })
    ).toBeNull();
  });

  it('keeps each entry on one line per field', () => {
    const entry = findingEntry(finding('aa11', 'low', { issue: 'line one\nline two' }), 'h');
    expect(entry).toContain('Issue: line one line two');
  });
});

describe('recordLowFindings', () => {
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const writeBodyFile = vi.fn(() => 'body.md');

  it('does nothing without LOW findings', () => {
    const gh = vi.fn();
    expect(recordLowFindings({ gh, branch: 'b', head: 'h', findings: [], writeBodyFile }).ok).toBe(
      true
    );
    expect(gh).not.toHaveBeenCalled();
  });

  it('refuses a detached HEAD without calling gh', () => {
    const gh = vi.fn();
    const r = recordLowFindings({
      gh,
      branch: 'HEAD',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile,
    });
    expect(r.ok).toBe(false);
    expect(gh).not.toHaveBeenCalled();
  });

  it('creates the issue the first time', () => {
    const gh = vi.fn((args: string[]) => {
      if (args[0] === 'pr') return { status: 1, stdout: '', stderr: 'no pull requests found' };
      if (args[1] === 'list') return ok('[]');
      return ok('https://github.com/o/r/issues/7\n');
    });
    const r = recordLowFindings({
      gh,
      branch: 'feat/x',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile,
    });
    expect(r.ok).toBe(true);
    const create = gh.mock.calls.find((c) => c[0][1] === 'create')![0];
    expect(create).toEqual([
      'issue',
      'create',
      '--title',
      followupTitle('feat/x'),
      '--body-file',
      'body.md',
    ]);
  });

  it('extends the existing issue with new findings only', () => {
    const existing = followupBody({
      existing: '',
      branch: 'feat/x',
      pr: '9',
      head: 'h',
      findings: [finding('a')],
    });
    const gh = vi.fn((args: string[]) => {
      if (args[0] === 'pr') return ok('9\n');
      if (args[1] === 'list')
        return ok(JSON.stringify([{ number: 7, title: followupTitle('feat/x'), body: existing }]));
      return ok();
    });
    const r = recordLowFindings({
      gh,
      branch: 'feat/x',
      head: 'h',
      findings: [finding('a'), finding('b')],
      writeBodyFile,
    });
    expect(r).toEqual({ ok: true, message: 'LOW findings recorded in #7' });
    expect(gh.mock.calls.some((c) => c[0][1] === 'edit' && c[0][2] === '7')).toBe(true);
  });

  it('skips the edit when the issue already lists everything', () => {
    const existing = followupBody({
      existing: '',
      branch: 'feat/x',
      pr: null,
      head: 'h',
      findings: [finding('a')],
    });
    const gh = vi.fn((args: string[]) =>
      args[1] === 'list'
        ? ok(JSON.stringify([{ number: 7, title: followupTitle('feat/x'), body: existing }]))
        : ok()
    );
    const r = recordLowFindings({
      gh,
      branch: 'feat/x',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile,
    });
    expect(r.ok).toBe(true);
    expect(gh.mock.calls.some((c) => c[0][1] === 'edit')).toBe(false);
  });

  it('ignores an issue whose title only resembles this branch', () => {
    const gh = vi.fn((args: string[]) => {
      if (args[1] === 'list')
        return ok(JSON.stringify([{ number: 3, title: followupTitle('feat/x-2'), body: '' }]));
      return ok('https://github.com/o/r/issues/8\n');
    });
    recordLowFindings({ gh, branch: 'feat/x', head: 'h', findings: [finding('a')], writeBodyFile });
    expect(gh.mock.calls.some((c) => c[0][1] === 'create')).toBe(true);
  });

  it('reports a gh failure instead of throwing', () => {
    const gh = vi.fn(() => ({ status: 1, stdout: '', stderr: 'gh: not logged in' }));
    const r = recordLowFindings({
      gh,
      branch: 'feat/x',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('not logged in');
  });
});

describe('lookupReview', () => {
  const sections = [{ file: 'apps/web/src/a.tsx', text: 'diff' }];
  const stored = (head: string, hash: string) =>
    JSON.stringify(
      cacheRecord({ head, hash, baseRef: 'origin/main', reviewer: 'codex', findings: [] })
    );

  it('hits when head and diff match the stored review', () => {
    const hash = diffHash(sections);
    const r = lookupReview({
      head: 'h1',
      scope: { scoped: ['apps/web/src/a.tsx'] },
      collect: () => sections,
      readCache: () => stored('h1', hash),
      env: {},
    });
    expect(r.hit?.reviewer).toBe('codex');
    expect(r.hash).toBe(hash);
    expect(r.scopedFiles).toEqual(['apps/web/src/a.tsx']);
  });

  it('misses, with a key to store, when the diff changed', () => {
    const r = lookupReview({
      head: 'h1',
      scope: { scoped: ['apps/web/src/a.tsx'] },
      collect: () => sections,
      readCache: () => stored('h1', 'old'),
      env: {},
    });
    expect(r.hit).toBeNull();
    expect(r.hash).toBe(diffHash(sections));
  });

  it.each([
    ['no head', { head: '', scope: { scoped: ['a'] } }],
    ['a scope error', { head: 'h', scope: { message: 'bad base', scoped: [] } }],
    ['nothing in scope', { head: 'h', scope: { scoped: [] } }],
  ])('misses with %s and never reads the cache', (_n, key) => {
    const readCache = vi.fn(() => '');
    const r = lookupReview({ ...key, collect: () => sections, readCache, env: {} });
    expect(r.hit).toBeNull();
    expect(readCache).not.toHaveBeenCalled();
  });

  it('misses when the diff cannot be collected', () => {
    const r = lookupReview({
      head: 'h',
      scope: { scoped: ['a'] },
      collect: () => {
        throw new Error('empty diff');
      },
      readCache: () => '',
      env: {},
    });
    expect(r).toEqual({ head: 'h', hit: null });
  });
});

describe('ghRunner', () => {
  it('passes the args and returns the result', () => {
    const spawn = vi.fn(() => ({ status: 0, stdout: 'out', stderr: '' }));
    expect(ghRunner(spawn, '/repo')(['issue', 'list'])).toEqual({
      status: 0,
      stdout: 'out',
      stderr: '',
    });
    expect(spawn).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list'],
      expect.objectContaining({ cwd: '/repo' })
    );
  });

  it('reads a spawn error as a failure', () => {
    const spawn = vi.fn(() => ({ error: new Error('ENOENT gh'), status: null }));
    const r = ghRunner(spawn, '.')(['x']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ENOENT');
  });
});

describe('lowFindingsLine', () => {
  it('reports success and failure', () => {
    expect(
      lowFindingsLine({ ok: true, message: 'LOW findings recorded in #7' }, 's.txt')
    ).toContain('#7');
    expect(lowFindingsLine({ ok: false, message: 'gh down' }, 's.txt')).toContain(
      'warn: could not file LOW findings (gh down); they are in s.txt'
    );
  });
});

describe('reviewReport', () => {
  const base = {
    baseRef: 'origin/main',
    scopedFiles: ['apps/web/src/a.tsx'],
    reviewerUsed: 'codex',
    chunkCount: 1,
    waivedLines: (f: { fingerprint: string }, w: { reason: string }) => [
      `  waived ${f.fingerprint}: ${w.reason}`,
    ],
    now: new Date('2026-11-10T22:00:00Z'),
  };

  it('passes with only LOW findings and lists them apart', () => {
    const r = reviewReport({ ...base, findings: [finding('l1', 'low')], waivers: new Map() });
    expect(r.verdict).toBe('PASS');
    expect(r.artifact).toMatchObject({
      low_count: 1,
      blocking_count: 0,
      unwaived_count: 1,
      verdict: 'PASS',
    });
    expect(r.summary).toContain('LOW FINDINGS (not blocking, filed as a follow-up):');
    expect(r.summary).not.toContain('UNWAIVED FINDINGS (BLOCKING):');
    expect(r.summary).toContain('Verdict: PASS');
  });

  it('fails on a blocking finding and shows waived ones with their reason', () => {
    const r = reviewReport({
      ...base,
      findings: [finding('h1', 'high'), finding('w1', 'medium')],
      waivers: new Map([['w1', { reason: 'false positive: guarded upstream' }]]),
    });
    expect(r.verdict).toBe('FAIL');
    expect(r.blocking.map((f: { fingerprint: string }) => f.fingerprint)).toEqual(['h1']);
    expect(r.summary).toContain('[HIGH] apps/web/src/a.tsx:12 — off-by-one');
    expect(r.summary).toContain('waived w1: false positive: guarded upstream');
    expect(r.summary).toContain('Unwaived     : 1 (1 blocking, 0 low)');
  });
});

describe('recordToStore', () => {
  it('stores a fresh review and skips a reuse', () => {
    const now = new Date('2026-11-10T22:00:00Z');
    expect(
      recordToStore({ cache: null, baseRef: 'b', reviewer: 'r', findings: [], now })
    ).toBeNull();
    expect(
      recordToStore({ cache: { head: 'h' }, baseRef: 'b', reviewer: 'r', findings: [], now })
    ).toBeNull();
    expect(
      recordToStore({
        cache: { head: 'h', hash: 'd' },
        baseRef: 'b',
        reviewer: 'r',
        findings: [],
        now,
      })
    ).toEqual(
      cacheRecord({ head: 'h', hash: 'd', baseRef: 'b', reviewer: 'r', findings: [], now })
    );
  });
});

describe('makeReviewIo', () => {
  function memFs() {
    const files = new Map<string, string>();
    return {
      files,
      existsSync: (p: string) => files.has(p),
      readFileSync: (p: string) => files.get(p) ?? '',
      writeFileSync: (p: string, text: string) => void files.set(p, text),
    };
  }
  const sections = [{ file: 'apps/web/src/a.tsx', text: 'diff --git a b' }];
  function spawnFor(gh: (args: string[]) => { status: number; stdout: string; stderr: string }) {
    return vi.fn((bin: string, args: string[]) => {
      if (bin === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD')
        return { status: 0, stdout: 'abc123def456\n' };
      if (bin === 'git') return { status: 0, stdout: 'feat/x\n' };
      return gh(args);
    });
  }
  function make(
    fs: ReturnType<typeof memFs>,
    spawn = spawnFor(() => ({ status: 0, stdout: '[]', stderr: '' }))
  ) {
    const out = vi.fn();
    const io = makeReviewIo({
      repoRoot: '/repo',
      outDir: '/repo/artifacts/codex-review',
      baseRef: 'origin/main',
      isInScope: () => true,
      spawn,
      fs,
      out,
      env: {},
      now: () => new Date('2026-11-10T22:00:00Z'),
      scope: () => ({ scoped: ['apps/web/src/a.tsx'] }),
      collect: () => sections,
    });
    return { io, out };
  }
  const complete = (io: ReturnType<typeof makeReviewIo>, cache: unknown, raw: object[]) =>
    io.complete({
      rawFindings: raw,
      findings: raw,
      waivers: new Map(),
      cache,
      scopedFiles: ['apps/web/src/a.tsx'],
      reviewerUsed: 'codex',
      chunkCount: 1,
      waivedLines: () => [],
    });

  it('stores a fresh review, then reuses it for the same head and diff', () => {
    const fs = memFs();
    const first = make(fs);
    const key = first.io.lookup();
    expect(key.hit).toBeNull();
    const report = complete(first.io, key, [finding('h1', 'high')]);
    expect(report.verdict).toBe('FAIL');
    expect(fs.files.has(path.join('/repo/artifacts/codex-review', 'review-cache.json'))).toBe(true);
    expect(fs.files.has(path.join('/repo/artifacts/codex-review', 'findings.json'))).toBe(true);
    expect(fs.files.get(path.join('/repo/artifacts/codex-review', 'summary.txt'))).toContain(
      'Verdict: FAIL'
    );

    const second = make(fs);
    const again = second.io.lookup();
    expect(again.reuse).toEqual({
      scopedFiles: ['apps/web/src/a.tsx'],
      findings: [finding('h1', 'high')],
      reviewerUsed: 'codex, reused',
      chunkCount: 0,
    });
    expect(second.out.mock.calls[0][0]).toContain('reusing the codex review of abc123def');
  });

  it('does not store again on a reuse', () => {
    const fs = memFs();
    const { io } = make(fs);
    complete(io, null, []);
    expect(fs.files.has(path.join('/repo/artifacts/codex-review', 'review-cache.json'))).toBe(
      false
    );
  });

  it('files LOW findings in the follow-up issue and reports where', () => {
    const fs = memFs();
    const gh = vi.fn((args: string[]) => {
      if (args[0] === 'pr') return { status: 0, stdout: '12\n', stderr: '' };
      if (args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
      return { status: 0, stdout: 'https://github.com/o/r/issues/99\n', stderr: '' };
    });
    const { io } = make(fs, spawnFor(gh));
    const report = complete(io, null, [finding('l1', 'low')]);
    expect(report.verdict).toBe('PASS');
    expect(report.lowLine).toContain('issues/99');
    const body = fs.files.get(path.join('/repo/artifacts/codex-review', 'low-followup.md'));
    expect(body).toContain('Pull request: #12');
    expect(body).toContain('<!-- fp:l1 -->');
    const create = gh.mock.calls.find((c) => c[0][1] === 'create')![0];
    expect(create).toContain(followupTitle('feat/x'));
  });

  it('has no low line when there is nothing LOW', () => {
    const { io } = make(memFs());
    expect(complete(io, null, []).lowLine).toBeUndefined();
  });
});

describe('edges', () => {
  it('uses the real env and clock by default', () => {
    const rec = cacheRecord({ head: 'h', hash: 'd', baseRef: 'b', reviewer: 'r', findings: [] });
    expect(cachedFindings(JSON.stringify(rec), { head: 'h', hash: 'd' })?.head).toBe('h');
    expect(
      recordToStore({ cache: { head: 'h', hash: 'd' }, baseRef: 'b', reviewer: 'r', findings: [] })
        ?.reviewed_at
    ).toMatch(/^\d{4}-/);
    expect(
      lookupReview({ head: '', scope: { scoped: [] }, collect: () => [], readCache: () => '' }).hit
    ).toBeNull();
    const r = reviewReport({
      findings: [],
      waivers: new Map(),
      baseRef: 'b',
      scopedFiles: [],
      reviewerUsed: 'r',
      chunkCount: 0,
      waivedLines: () => [],
    });
    expect(r.verdict).toBe('PASS');
  });

  it('tolerates missing and very long fields in an issue entry', () => {
    const entry = findingEntry({ ...finding('aa11'), fix: undefined, issue: 'x'.repeat(400) }, 'h');
    expect(entry).toContain('Fix: \n');
    expect(entry).toContain(`${'x'.repeat(299)}…`);
  });

  it('reads an empty issue list as no issue', () => {
    const gh = vi.fn((args: string[]) =>
      args[1] === 'list'
        ? { status: 0, stdout: '', stderr: '' }
        : { status: 0, stdout: 'u\n', stderr: '' }
    );
    const r = recordLowFindings({
      gh,
      branch: 'b',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile: () => 'f',
    });
    expect(r.ok).toBe(true);
  });

  it('reports unreadable JSON from gh issue list', () => {
    const gh = vi.fn((args: string[]) =>
      args[1] === 'list'
        ? { status: 0, stdout: '{not json', stderr: '' }
        : { status: 1, stdout: '', stderr: '' }
    );
    const r = recordLowFindings({
      gh,
      branch: 'b',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile: () => 'f',
    });
    expect(r).toEqual({ ok: false, message: 'gh issue list returned unreadable JSON' });
  });

  it.each([
    ['edit', [{ number: 7, title: followupTitle('b'), body: '' }]],
    ['create', []],
  ])('reports a failed gh issue %s', (verb, issues) => {
    const gh = vi.fn((args: string[]) => {
      if (args[0] === 'pr') return { status: 1, stdout: '', stderr: '' };
      if (args[1] === 'list') return { status: 0, stdout: JSON.stringify(issues), stderr: '' };
      return { status: 1, stdout: '', stderr: 'HTTP 403' };
    });
    const r = recordLowFindings({
      gh,
      branch: 'b',
      head: 'h',
      findings: [finding('a')],
      writeBodyFile: () => 'f',
    });
    expect(r).toEqual({ ok: false, message: `gh issue ${verb} failed: HTTP 403` });
  });

  it('makeReviewIo misses quietly when git has nothing to say', () => {
    const fs = { existsSync: () => false, readFileSync: () => '', writeFileSync: vi.fn() };
    const spawn = vi.fn(() => ({ status: 1, stdout: '', stderr: 'not a repo' }));
    const io = makeReviewIo({
      repoRoot: '/r',
      outDir: '/r/o',
      baseRef: 'origin/main',
      isInScope: () => true,
      spawn,
      fs,
    });
    expect(io.lookup().hit).toBeNull();
  });
});
