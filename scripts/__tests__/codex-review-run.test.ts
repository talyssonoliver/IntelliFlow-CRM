/**
 * Tests for scripts/lib/codex-review-run.mjs: the whole review run in-process, on a real throw-away
 * git repo, with the codex and claude reviewers replaced by fakes. No model is ever started.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  countLines,
  createGate,
  deltaNoteFor,
  sectionStats,
  summarizeRuns,
} from '../lib/codex-review-run.mjs';
import { gitEnv } from '../lib/preship-git.mjs';
import { collectNumstat } from '../lib/codex-chunk-review.mjs';

// The gate's git calls run in the process's working directory (the script chdirs to the repo
// root); here each temp repo gets a spawn that defaults to it, without the hook's GIT_* variables.
const spawnIn =
  (dir: string) =>
  (cmd: string, args: string[], opts: Record<string, unknown> = {}) =>
    spawnSync(cmd, args, { cwd: dir, ...opts, env: gitEnv(process.env) } as never);

function git(cwd: string, ...args: string[]) {
  const r = spawnIn(cwd)('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

const A1 = ['export const one = 1;', 'export const two = 2;', 'export const three = 3;'];

function makeRepo(branchFiles: Record<string, string>, baseFiles?: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-run-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'run@example.invalid');
  git(dir, 'config', 'user.name', 'run');
  git(dir, 'config', 'commit.gpgsign', 'false');
  const write = (files: Record<string, string>) => {
    for (const [f, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), text);
    }
  };
  write(baseFiles ?? { 'README.md': 'base\n' });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'feat/x');
  write(branchFiles);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'change');
  return {
    dir,
    commit(files: Record<string, string>) {
      write(files);
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'next');
    },
  };
}

const text = (lines: string[]) => `${lines.join('\n')}\n`;
const finding = (over: Record<string, unknown> = {}) => ({
  severity: 'high',
  file: 'apps/web/src/a.ts',
  line: 1,
  rule: 'wrong-unit',
  issue: 'bad value',
  evidence: 'x',
  fix: 'y',
  ...over,
});
const answer = (...findings: unknown[]) => JSON.stringify({ findings });

type Reviewer = (input: string, last: string, cwd: string, spawn: unknown, tier: unknown) => object;

function gate(dir: string, over: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const errs: string[] = [];
  const codex = vi.fn<Reviewer>(() => ({ status: 0, stdout: answer(), stderr: '' }));
  const claude = vi.fn((_prompt: string) => ({
    text: answer(),
    tokens: { total: 7 },
    costUsd: 0.25,
  }));
  const deps = {
    baseRef: 'main',
    repoRoot: dir,
    outDir: path.join(dir, 'artifacts/codex-review'),
    env: { CODEX_REVIEW_MAX_WAIT_MIN: '0' } as Record<string, string>,
    spawn: spawnIn(dir),
    fs,
    homedir: () => dir,
    out: (s: string) => lines.push(s),
    err: (s: string) => errs.push(s),
    isInScope: (f: string) => f.startsWith('apps/'),
    commandAvailable: () => true,
    codexLoggedIn: () => true,
    runCodexReviewer: codex,
    runClaude: claude,
    extract: (raw: string) => {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p.findings) ? p : null;
      } catch {
        return null;
      }
    },
    buildPrompt: (note: string) => (files: string[], part: string, diff: string) =>
      `PROMPT${note}\n${files.join(',')}${part}\n${diff}`,
    writeSchema: () => undefined,
    verbose: false,
    loadWaivers: () => new Map(),
    fingerprintOf: (f: { file: string; rule: string }) => `fp-${f.file}-${f.rule}`,
    waivedLines: () => [],
    sleep: vi.fn(),
    ...over,
  };
  const run = () => createGate(deps as never).run();
  const out = () => lines.join('');
  const metrics = () =>
    fs.existsSync(path.join(dir, 'artifacts/codex-review/metrics.jsonl'))
      ? fs
          .readFileSync(path.join(dir, 'artifacts/codex-review/metrics.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l))
      : [];
  const json = (f: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, 'artifacts/codex-review', f), 'utf8'));
  return { run, out, errs, codex, claude, metrics, json, deps };
}

describe('helpers', () => {
  it('counts changed lines, summarises runs and sizes sections', () => {
    expect(countLines('+++ b/a\n--- a/a\n@@ -1 +1 @@\n-a\n+b\n+c\n ctx\n')).toBe(3);
    expect(sectionStats([{ file: 'a', text: '@@\n-a\n+b\n+c\n+++ b\n' }])).toEqual([
      { file: 'a', added: 2, deleted: 1 },
    ]);
    expect(deltaNoteFor('delta', 3)).toMatch(/round 3/);
    expect(deltaNoteFor('full', 1)).toBe('');
    expect(summarizeRuns([])).toMatchObject({
      reviewer: 'none',
      model: null,
      tokens: null,
      costUsd: null,
    });
    expect(
      summarizeRuns([
        { reviewer: 'codex', model: 'm', effort: 'low', tokens: { total: 5 } },
        { reviewer: 'claude', costUsd: 0.5 },
      ])
    ).toMatchObject({
      reviewer: 'codex+claude',
      model: 'm',
      effort: 'low',
      tokens: { total: 5 },
      costUsd: 0.5,
    });
  });

  it('sizes the change from git numstat, committed plus staged', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    fs.writeFileSync(path.join(dir, 'apps/web/src/b.ts'), 'x\n');
    git(dir, 'add', '-A');
    const stats = collectNumstat('main', spawnIn(dir) as never);
    expect(stats.map((s: { file: string }) => s.file).sort()).toEqual([
      'apps/web/src/a.ts',
      'apps/web/src/b.ts',
    ]);
    expect(() => collectNumstat('no-such-ref', spawnIn(dir) as never)).toThrow(
      /cannot size the change/
    );
  });
});

describe('createGate: no model needed', () => {
  it('records a docs-only diff as a skip and exits 0', () => {
    const { dir } = makeRepo({ 'docs/a.md': '# a\n' });
    const g = gate(dir);
    expect(g.run()).toBe(0);
    expect(g.out()).toMatch(/skipped: only docs, tests, generated or tooling files changed/);
    expect(g.json('findings.json')).toMatchObject({ verdict: 'SKIPPED' });
    expect(g.metrics()[0]).toMatchObject({ mode: 'skipped', tier: 'skip', verdict: 'SKIPPED' });
    expect(g.codex).not.toHaveBeenCalled();
    expect(g.claude).not.toHaveBeenCalled();
  });

  it('fails when the base does not resolve, with nothing reviewed', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g = gate(dir, { baseRef: 'no-such-ref' });
    expect(g.run()).toBe(1);
    expect(g.out()).toMatch(/DIFF_INPUT_ERROR/);
    expect(g.codex).not.toHaveBeenCalled();
  });
});

describe('createGate: the reviewer follows the sizing', () => {
  it('reviews a small diff on the light Codex model, passes, and records the round', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g = gate(dir);
    expect(g.run()).toBe(0);
    expect(g.codex).toHaveBeenCalledTimes(1);
    const tier = g.codex.mock.calls[0][4];
    expect(tier).toEqual({ model: 'gpt-6-luna', effort: 'medium' });
    const m = g.metrics();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      mode: 'full',
      round: 1,
      tier: 'light',
      reviewer: 'codex',
      model: 'gpt-6-luna',
      verdict: 'PASS',
      branch: 'feat/x',
    });
    expect(m[0].why).toMatch(/small diff/);
    expect(g.claude).not.toHaveBeenCalled();
  });

  it('reviews a risky diff on the strong model', () => {
    const { dir } = makeRepo({ 'apps/api/src/modules/billing/b.ts': text(A1) });
    const g = gate(dir);
    g.run();
    expect(g.codex.mock.calls[0][4]).toEqual({ model: 'gpt-6.2-sol', effort: 'high' });
    expect(g.out()).toMatch(/Claude only if Codex cannot review \(risky diff\)/);
  });

  it('uses the plan model list: a model the plan lacks is left to the codex config', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.codex/models_cache.json'),
      JSON.stringify({ models: [{ slug: 'other' }] })
    );
    const g = gate(dir);
    g.run();
    expect(g.codex.mock.calls[0][4]).toMatchObject({ model: null });
  });
});

describe('createGate: Claude only when necessary', () => {
  const capped = () => ({
    status: 1,
    stdout: '',
    stderr: "You've hit your usage limit. Try again at 11:59 PM.",
  });

  it('defers a non-risky diff when Codex is capped: exit 1, no Claude, a visible reason', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g = gate(dir, { runCodexReviewer: vi.fn(capped) });
    expect(g.run()).toBe(1);
    expect(g.claude).not.toHaveBeenCalled();
    expect(g.out()).toMatch(/REVIEW_DEFERRED: codex unavailable \(usage cap\)/);
    expect(g.json('findings.json').verdict).toBe('FAIL');
    expect(g.metrics()[0]).toMatchObject({ mode: 'deferred', verdict: 'DEFERRED', round: 0 });
  });

  it('uses Claude (priced in the metrics) for a risky diff when Codex is capped', () => {
    const { dir } = makeRepo({ 'apps/api/src/modules/billing/b.ts': text(A1) });
    const g = gate(dir, { runCodexReviewer: vi.fn(capped) });
    expect(g.run()).toBe(0);
    expect(g.claude).toHaveBeenCalledTimes(1);
    expect(g.metrics()[0]).toMatchObject({
      mode: 'full',
      reviewer: 'claude',
      cost_usd: 0.25,
      tier: 'strong',
    });
  });

  it('treats an uninstalled Codex as unavailable, and an owner override lets Claude review', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g = gate(dir, { commandAvailable: (b: string) => b === 'claude' });
    expect(g.run()).toBe(1);
    expect(g.out()).toMatch(/not installed or not logged in/);
    const { dir: dir2 } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g2 = gate(dir2, {
      commandAvailable: (b: string) => b === 'claude',
      env: { CODEX_REVIEW_ALLOW_CLAUDE: '1' },
    });
    expect(g2.run()).toBe(0);
    expect(g2.claude).toHaveBeenCalled();
  });

  it('CODEX_REVIEW_FORCE_FALLBACK=1 makes Codex unavailable, and the policy decides', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g = gate(dir, { env: { CODEX_REVIEW_FORCE_FALLBACK: '1' } });
    expect(g.run()).toBe(1);
    expect(g.codex).not.toHaveBeenCalled();
  });
});

describe('createGate: rounds, delta and the limit', () => {
  const risky = 'apps/api/src/modules/billing/b.ts';
  const edit = (lines: string[], i: number, value: string) =>
    lines.map((l, n) => (n === i ? value : l));
  /** A 90-line file on main, changed on the branch by `change`: its hunks stay apart. */
  function longFileRepo(change: (lines: string[]) => string[]) {
    const lines = Array.from({ length: 90 }, (_, i) => `export const v${i} = ${i};`);
    const repo = makeRepo(
      { [risky]: text(change(lines)) },
      { 'README.md': 'base\n', [risky]: text(lines) }
    );
    return { ...repo, lines };
  }

  it('re-reviews only the hunk changed since the last round and carries the open finding', () => {
    const { dir, commit, lines } = longFileRepo((l) => edit(l, 5, 'export const v5 = 555;'));
    const first = gate(dir, {
      runCodexReviewer: vi.fn(() => ({
        status: 0,
        stdout: answer(finding({ file: risky, line: 5 })),
        stderr: '',
      })),
    });
    expect(first.run()).toBe(1);
    expect(first.metrics()[0]).toMatchObject({
      mode: 'full',
      round: 1,
      verdict: 'FAIL',
      blocking: 1,
    });
    const state = JSON.parse(
      fs.readFileSync(path.join(dir, 'artifacts/codex-review/round-state.json'), 'utf8')
    );
    expect(state.branches['feat/x'].rounds).toBe(1);

    // an unrelated push: the finding's hunk is unchanged, another hunk far away is edited
    commit({
      [risky]: text(edit(edit(lines, 5, 'export const v5 = 555;'), 70, 'export const v70 = 7070;')),
    });
    const second = gate(dir);
    expect(second.run()).toBe(1);
    const m2 = second.metrics().at(-1);
    expect(m2).toMatchObject({ mode: 'delta', round: 2 });
    expect(m2.finding_list).toEqual([
      expect.objectContaining({ carried: true, rule: 'wrong-unit' }),
    ]);
    expect(m2.previous_round).toMatchObject({ round: 1, unchanged: 1 });
  });

  it('sends only unseen hunks and says so in the prompt', () => {
    const { dir, commit, lines } = longFileRepo((l) => edit(l, 5, 'export const v5 = 555;'));
    gate(dir, {
      runCodexReviewer: vi.fn(() => ({
        status: 0,
        stdout: answer(finding({ file: risky, line: 5 })),
        stderr: '',
      })),
    }).run();
    commit({
      [risky]: text(edit(edit(lines, 5, 'export const v5 = 555;'), 70, 'export const v70 = 7070;')),
    });
    const g = gate(dir);
    g.run();
    const prompt = String(g.codex.mock.calls[0][0]);
    expect(prompt).toMatch(/round 2/);
    expect(prompt).toMatch(/Only hunks added or changed since the last reviewed round/);
    expect(prompt).toContain('v70 = 7070');
    expect(prompt).not.toContain('v5 = 555');
  });

  it('calls no model when every hunk was reviewed, and the carried finding still fails the gate', () => {
    const { dir, commit } = makeRepo({ [risky]: text(A1) });
    const first = gate(dir, {
      runCodexReviewer: vi.fn(() => ({
        status: 0,
        stdout: answer(finding({ file: risky })),
        stderr: '',
      })),
    });
    expect(first.run()).toBe(1);
    commit({});
    const g = gate(dir);
    expect(g.run()).toBe(1);
    expect(g.codex).not.toHaveBeenCalled();
    expect(g.metrics().at(-1)).toMatchObject({ mode: 'delta-empty', round: 0, tier: 'skip' });
  });

  it('drops a finding when its code is changed and records that it led to a change', () => {
    const { dir, commit } = makeRepo({ [risky]: text(A1) });
    gate(dir, {
      runCodexReviewer: vi.fn(() => ({
        status: 0,
        stdout: answer(finding({ file: risky, line: 1 })),
        stderr: '',
      })),
    }).run();
    commit({ [risky]: text(['export const one = 100;', ...A1.slice(1)]) });
    const g = gate(dir);
    expect(g.run()).toBe(0);
    expect(g.metrics().at(-1)).toMatchObject({
      mode: 'delta',
      verdict: 'PASS',
      previous_round: { round: 1, findings: 1, changed_code: 1, unchanged: 0 },
    });
    const state = JSON.parse(
      fs.readFileSync(path.join(dir, 'artifacts/codex-review/round-state.json'), 'utf8')
    );
    expect(state.branches['feat/x'].rounds).toBe(0);
  });

  it('stops at the round limit with a human route, and CODEX_REVIEW_MAX_ROUNDS raises it', () => {
    const { dir } = makeRepo({ [risky]: text(A1) });
    fs.mkdirSync(path.join(dir, 'artifacts/codex-review'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'artifacts/codex-review/round-state.json'),
      JSON.stringify({
        version: 1,
        branches: {
          'feat/x': {
            rounds: 4,
            lastHead: 'x',
            reviewedHunks: [],
            findings: [finding({ file: risky })],
            lastRound: { round: 4, head: 'x', at: 'n' },
          },
        },
      })
    );
    const g = gate(dir);
    expect(g.run()).toBe(1);
    expect(g.out()).toMatch(/ROUND_LIMIT: 4 semantic-review rounds on feat\/x \(limit 4\)/);
    expect(g.out()).toMatch(/owner or the orchestrator decides/);
    expect(g.codex).not.toHaveBeenCalled();
    expect(g.metrics()[0]).toMatchObject({ mode: 'round-limit', verdict: 'FAIL' });
    const g2 = gate(dir, { env: { CODEX_REVIEW_MAX_ROUNDS: '5', CODEX_REVIEW_MAX_WAIT_MIN: '0' } });
    expect(g2.run()).toBe(0);
    expect(g2.codex).toHaveBeenCalled();
  });

  it('keeps rounds under CODEX_REVIEW_BRANCH when given, and per detached head otherwise', () => {
    const { dir } = makeRepo({ [risky]: text(A1) });
    const g = gate(dir, { env: { CODEX_REVIEW_BRANCH: 'pr-7', CODEX_REVIEW_MAX_WAIT_MIN: '0' } });
    g.run();
    expect(g.metrics()[0].branch).toBe('pr-7');
    git(dir, 'checkout', '-q', '--detach');
    const d = gate(dir);
    d.run();
    expect(d.metrics().at(-1).branch).toMatch(/^detached@/);
  });

  it('reuses the review of the same head and diff: no model, no round', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const first = gate(dir);
    expect(first.run()).toBe(0);
    const second = gate(dir);
    expect(second.run()).toBe(0);
    expect(second.codex).not.toHaveBeenCalled();
    expect(second.metrics().at(-1)).toMatchObject({ mode: 'reuse', round: 0 });
  });

  it('fails the gate when a diff chunk is not reviewed and records the failure', () => {
    const { dir } = makeRepo({ 'apps/web/src/a.ts': text(A1) });
    const g = gate(dir, {
      runCodexReviewer: vi.fn(() => ({ status: 0, stdout: 'not json', stderr: '' })),
    });
    expect(g.run()).toBe(1);
    expect(g.out()).toMatch(/REVIEW_DEFERRED|INCOMPLETE_REVIEW/);
  });
});
