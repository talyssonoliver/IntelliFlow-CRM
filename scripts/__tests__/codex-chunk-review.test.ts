/**
 * The review loop of codex-review.mjs (#1274): every chunk of the diff is reviewed, and a diff
 * that was not reviewed whole never adds up to a PASS. Reviewers are stand-ins: nothing starts.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  chunkOutcome,
  diffInputMessage,
  failureArtifact,
  isStaleReviewArtifact,
  listChangedFiles,
  makeCodexRunner,
  reviewChunks,
  reviewWithFallback,
  runChunkedReview,
  scopeChanges,
} from '../lib/codex-chunk-review.mjs';
import { DiffInputError } from '../lib/codex-diff.mjs';

const quietLog = () => ({ out: vi.fn(), err: vi.fn() });
const extract = (raw: string) => (raw.startsWith('{') ? JSON.parse(raw) : null);
const finding = (file: string) => ({
  severity: 'high',
  file,
  line: 1,
  rule: 'r',
  issue: 'i',
  evidence: 'e',
  fix: 'f',
});

describe('listing changed files', () => {
  it('unions committed and staged files, without a shell', () => {
    const calls: Array<{ args: string[]; options: Record<string, unknown> }> = [];
    const spawn = (_cmd: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ args, options });
      return args.includes('--cached')
        ? { status: 0, stdout: 'b.ts\nc.ts\n' }
        : { status: 0, stdout: 'a.ts\nb.ts\n\n' };
    };
    expect(listChangedFiles('origin/main', spawn)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(calls[0].args).toContain('origin/main...HEAD');
    for (const c of calls) expect(c.options.shell).toBeUndefined();
  });

  it('ignores a failed staged listing', () => {
    const spawn = (_c: string, args: string[]) =>
      args.includes('--cached') ? { status: 128, stdout: '' } : { status: 0, stdout: 'a.ts\n' };
    expect(listChangedFiles('main', spawn)).toEqual(['a.ts']);
  });

  it('throws when the base does not resolve, instead of passing as "nothing changed"', () => {
    const spawn = () => ({
      status: 128,
      stdout: '',
      stderr: "fatal: ambiguous argument 'x...HEAD'",
    });
    expect(() => listChangedFiles('x', spawn)).toThrow(
      expect.objectContaining({
        code: 'base-unresolved',
        message: expect.stringContaining('ambiguous'),
      })
    );
  });

  it('throws on a spawn error and on a silent non-zero exit', () => {
    expect(() =>
      listChangedFiles('x', () => ({ error: new Error('ENOENT git'), status: null }))
    ).toThrow(/ENOENT git/);
    expect(() => listChangedFiles('x', () => ({ status: 2, stdout: '' }))).toThrow(/exit 2/);
  });
});

describe('one review with the Claude fallback', () => {
  const ok = JSON.stringify({ findings: [finding('a.ts')] });

  it('takes the codex answer when it parses', () => {
    const runClaude = vi.fn();
    const r = reviewWithFallback('P', {
      codexUsable: true,
      claudeUsable: true,
      runCodex: () => ({ raw: ok, status: 0 }),
      runClaude,
      extract,
      log: quietLog(),
    });
    expect(r.reviewer).toBe('codex');
    expect(r.parsed.findings).toHaveLength(1);
    expect(runClaude).not.toHaveBeenCalled();
  });

  it('falls back to Claude when codex answers with an error', () => {
    const log = quietLog();
    const r = reviewWithFallback('P', {
      codexUsable: true,
      claudeUsable: true,
      runCodex: () => ({ raw: 'usage cap reached', status: 1, stderr: 'cap' }),
      runClaude: () => ok,
      extract,
      log,
    });
    expect(r.reviewer).toBe('claude');
    expect(log.err).toHaveBeenCalledWith(expect.stringContaining('exit 1'));
    expect(log.err).toHaveBeenCalledWith('cap\n');
  });

  it('goes straight to Claude when codex is unusable (CODEX_REVIEW_FORCE_FALLBACK)', () => {
    const runCodex = vi.fn();
    const r = reviewWithFallback('P', {
      codexUsable: false,
      claudeUsable: true,
      runCodex,
      runClaude: () => ok,
      extract,
      log: quietLog(),
    });
    expect(runCodex).not.toHaveBeenCalled();
    expect(r.reviewer).toBe('claude');
  });

  it('returns no review when neither reviewer gives parseable output', () => {
    const r = reviewWithFallback('P', {
      codexUsable: true,
      claudeUsable: true,
      runCodex: () => ({ raw: '', status: null }),
      runClaude: () => '',
      extract,
      log: quietLog(),
    });
    expect(r).toEqual({ parsed: null, reviewer: null, raw: '' });
  });
});

describe('reviewing every chunk', () => {
  const chunks = [
    { files: ['a.ts'], text: 'DIFF-A' },
    { files: ['b.ts', 'c.ts'], text: 'DIFF-B' },
    { files: ['d.ts'], text: 'DIFF-C' },
  ];
  const buildPrompt = (files: string[], part: string, text: string) =>
    `${files.join(',')}|${part}|${text}`;

  it('sends each chunk once, numbers the artifacts and collects all findings', () => {
    const written: Record<string, string> = {};
    const prompts: string[] = [];
    const out = reviewChunks(chunks, {
      buildPrompt,
      review: (prompt: string) => {
        prompts.push(prompt);
        const file = prompt.split('|')[0].split(',')[0];
        return { parsed: { findings: [finding(file)] }, reviewer: 'claude', raw: `raw ${file}` };
      },
      write: (name: string, text: string) => {
        written[name] = text;
      },
      log: quietLog(),
    });
    expect(prompts).toEqual([
      'a.ts| (part 1 of 3)|DIFF-A',
      'b.ts,c.ts| (part 2 of 3)|DIFF-B',
      'd.ts| (part 3 of 3)|DIFF-C',
    ]);
    expect(Object.keys(written).sort()).toEqual([
      'codex-prompt-1.txt',
      'codex-prompt-2.txt',
      'codex-prompt-3.txt',
      'codex-raw-1.txt',
      'codex-raw-2.txt',
      'codex-raw-3.txt',
    ]);
    expect(out.findings.map((f: { file: string }) => f.file)).toEqual(['a.ts', 'b.ts', 'd.ts']);
    expect(out.reviewers).toEqual(['claude']);
    expect(out.unreviewed).toEqual([]);
  });

  it('keeps the old artifact names for a single chunk', () => {
    const written: string[] = [];
    reviewChunks([chunks[0]], {
      buildPrompt,
      review: () => ({ parsed: { findings: [] }, reviewer: 'codex', raw: '{}' }),
      write: (name: string) => written.push(name),
      log: quietLog(),
    });
    expect(written).toEqual(['codex-prompt.txt', 'codex-raw.txt']);
  });

  it('records the chunks no reviewer answered', () => {
    let n = 0;
    const out = reviewChunks(chunks, {
      buildPrompt,
      review: () => {
        n += 1;
        return n === 2
          ? { parsed: null, reviewer: null, raw: '' }
          : { parsed: { findings: [] }, reviewer: n === 1 ? 'codex' : 'claude', raw: '{}' };
      },
      write: () => undefined,
      log: quietLog(),
    });
    expect(out.unreviewed).toEqual([2]);
    expect(out.reviewers).toEqual(['codex', 'claude']);
  });
});

describe('what the chunks add up to', () => {
  it('is a review only when every chunk was reviewed', () => {
    expect(chunkOutcome(3, [])).toEqual({ kind: 'reviewed' });
  });

  it('fails a partial review rather than passing it', () => {
    const o = chunkOutcome(4, [2, 4]);
    expect(o.kind).toBe('incomplete');
    expect(o.message).toMatch(/chunk\(s\) 2, 4 of 4 .*Gate FAIL/);
  });

  it('degrades to SKIPPED_PRECONDITION only when no chunk got a review', () => {
    const o = chunkOutcome(2, [1, 2]);
    expect(o.kind).toBe('skip');
    expect(o.message).toMatch(/^SKIPPED_PRECONDITION/);
  });
});

describe('scoping the change', () => {
  it('splits changed files into the review scope', () => {
    const spawn = (_c: string, args: string[]) =>
      args.includes('--cached')
        ? { status: 0, stdout: '' }
        : { status: 0, stdout: 'apps/a.ts\ndocs/b.md\n' };
    expect(scopeChanges('main', spawn, (f: string) => f.startsWith('apps/'))).toEqual({
      changed: ['apps/a.ts', 'docs/b.md'],
      scoped: ['apps/a.ts'],
    });
  });

  it('returns a FAIL message when the base does not resolve', () => {
    const r = scopeChanges(
      'nope',
      () => ({ status: 128, stderr: 'unknown revision' }),
      () => true
    );
    expect(r.message).toMatch(/^DIFF_INPUT_ERROR \(base-unresolved\).*unknown revision/);
  });
});

describe('the codex runner', () => {
  const fakeFs = (lastMessage: string | null) => ({
    rmSync: vi.fn(),
    existsSync: () => lastMessage !== null,
    readFileSync: () => lastMessage,
  });

  it('clears the last message first, then reads codex answer from it', () => {
    const fs = fakeFs('{"findings":[]}');
    const runCodexReviewer = vi.fn(() => ({ status: 0, stdout: 'ignored', stderr: '' }));
    const log = quietLog();
    const run = makeCodexRunner({
      lastMsgPath: '/out/last.txt',
      repoRoot: '/repo',
      fs,
      runCodexReviewer,
      spawn: 'SPAWN',
      verbose: true,
      log,
    });
    expect(run('PROMPT')).toEqual({ raw: '{"findings":[]}', status: 0, stderr: '' });
    expect(fs.rmSync).toHaveBeenCalledWith('/out/last.txt', { force: true });
    expect(runCodexReviewer).toHaveBeenCalledWith('PROMPT', '/out/last.txt', '/repo', 'SPAWN');
    expect(log.err).toHaveBeenCalledWith(expect.stringContaining('--- codex stdout ---'));
  });

  it('falls back to stdout, then stderr, when codex wrote no last message', () => {
    const base = {
      lastMsgPath: '/l',
      repoRoot: '/r',
      spawn: null,
      verbose: false,
      log: quietLog(),
    };
    const fromStdout = makeCodexRunner({
      ...base,
      fs: fakeFs(null),
      runCodexReviewer: () => ({ status: 1, stdout: 'out', stderr: 'err' }),
    });
    expect(fromStdout('P').raw).toBe('out');
    const fromStderr = makeCodexRunner({
      ...base,
      fs: fakeFs(null),
      runCodexReviewer: () => ({ status: 1, stdout: '', stderr: 'cap reached' }),
    });
    expect(fromStderr('P').raw).toBe('cap reached');
    const nothing = makeCodexRunner({
      ...base,
      fs: fakeFs(null),
      runCodexReviewer: () => ({ status: null }),
    });
    expect(nothing('P').raw).toBe('');
  });
});

describe('the whole chunked review', () => {
  const diffFor = (files: string[]) =>
    files
      .map(
        (f) =>
          `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1 +1 @@\n-a\n+${'x'.repeat(30_000)}\n`
      )
      .join('');
  const gitSpawn = (_c: string, args: string[]) =>
    args.includes('--cached')
      ? { status: 0, stdout: '' }
      : { status: 0, stdout: diffFor(args.slice(args.indexOf('--') + 1)) };
  const base = {
    baseRef: 'origin/main',
    repoRoot: '/repo',
    spawn: gitSpawn,
    buildPrompt: (files: string[], part: string) => `${files.join(',')}${part}`,
    write: () => undefined,
    log: quietLog(),
  };

  it('reviews a diff over the cap in several chunks and reports them', () => {
    const clearStale = vi.fn();
    const prompts: string[] = [];
    const r = runChunkedReview({
      ...base,
      scopedFiles: ['a.ts', 'b.ts', 'c.ts'],
      clearStale,
      review: (p: string) => {
        prompts.push(p);
        return {
          parsed: { findings: [finding(p.split(/[ ,]/)[0])] },
          reviewer: 'claude',
          raw: '{}',
        };
      },
    });
    expect(r).toMatchObject({ kind: 'reviewed', reviewerUsed: 'claude', chunkCount: 3 });
    expect(prompts).toEqual(['a.ts (part 1 of 3)', 'b.ts (part 2 of 3)', 'c.ts (part 3 of 3)']);
    expect(r.findings).toHaveLength(3);
    expect(clearStale).toHaveBeenCalledTimes(1);
  });

  it('fails when one chunk got no review', () => {
    let n = 0;
    const r = runChunkedReview({
      ...base,
      scopedFiles: ['a.ts', 'b.ts'],
      clearStale: () => undefined,
      review: () => {
        n += 1;
        return n === 1
          ? { parsed: { findings: [] }, reviewer: 'codex', raw: '{}' }
          : { parsed: null, reviewer: null, raw: '' };
      },
    });
    expect(r.kind).toBe('fail');
    expect(r.message).toMatch(/^INCOMPLETE_REVIEW: chunk\(s\) 2 of 2/);
  });

  it('skips only when no chunk got any review', () => {
    const r = runChunkedReview({
      ...base,
      scopedFiles: ['a.ts'],
      clearStale: () => undefined,
      review: () => ({ parsed: null, reviewer: null, raw: '' }),
    });
    expect(r.kind).toBe('skip');
  });

  it('fails before any review when git returns no diff', () => {
    const review = vi.fn();
    const r = runChunkedReview({
      ...base,
      spawn: () => ({ status: 0, stdout: '' }),
      scopedFiles: ['a.ts'],
      clearStale: () => undefined,
      review,
    });
    expect(r).toMatchObject({ kind: 'fail', chunkCount: 0, findings: [] });
    expect(r.message).toMatch(/^DIFF_INPUT_ERROR \(empty-diff\)/);
    expect(review).not.toHaveBeenCalled();
  });
});

describe('failure messages and artifacts', () => {
  it('turns a diff-input error into a FAIL message', () => {
    expect(diffInputMessage(new DiffInputError('empty-diff', 'git returned no diff'))).toBe(
      'DIFF_INPUT_ERROR (empty-diff): git returned no diff. Gate FAIL — nothing was reviewed.'
    );
  });

  it('rethrows anything that is not a diff-input error', () => {
    expect(() => diffInputMessage(new TypeError('bug'))).toThrow(TypeError);
  });

  it('writes a FAIL artifact with the reason', () => {
    expect(
      failureArtifact({ baseRef: 'origin/main', scopedFiles: ['a.ts'], message: 'm' })
    ).toEqual({
      base_ref: 'origin/main',
      scoped_files: ['a.ts'],
      findings: [],
      verdict: 'FAIL',
      error: 'm',
    });
  });

  it('clears only the prompt and raw files a run rewrites', () => {
    for (const name of [
      'codex-prompt.txt',
      'codex-prompt-3.txt',
      'codex-raw.txt',
      'codex-raw-12.txt',
    ]) {
      expect(isStaleReviewArtifact(name)).toBe(true);
    }
    for (const name of [
      'findings.json',
      'summary.txt',
      'codex-last-message.txt',
      'codex-prompt-x.txt',
    ]) {
      expect(isStaleReviewArtifact(name)).toBe(false);
    }
  });
});
