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
import { buildRecord } from '../lib/review-metrics.mjs';
import { codexExecArgs } from '../lib/review-commands.mjs';
import { isModelUnavailable } from '../lib/review-policy.mjs';
import { guardSharedGitConfig } from './shared-git-config-guard';
import { gitEnv } from '../lib/preship-git.mjs';
import { collectNumstat } from '../lib/codex-chunk-review.mjs';

guardSharedGitConfig();

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
    // the Claude fallback's model (Sonnet, owner ruling 27/11/2026) reaches the metrics `model`
    expect(summarizeRuns([{ reviewer: 'claude', model: 'sonnet', costUsd: 0.1 }])).toMatchObject({
      reviewer: 'claude',
      model: 'sonnet',
    });
    expect(
      buildRecord({
        reviewer: 'claude',
        model: summarizeRuns([{ reviewer: 'claude', model: 'sonnet' }]).model,
      })
    ).toMatchObject({ reviewer: 'claude', model: 'sonnet' });
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

describe('createGate: a model or effort the plan lacks falls back to the codex config', () => {
  // Real argv through a fake codex program: it fails like codex does when -m names a model that
  // is not on the ChatGPT plan, and works when no -m is given.
  const FAKE = [
    'const a = process.argv.slice(2);',
    "const fs = require('node:fs');",
    'const mode = process.env.FAKE_CODEX_MODE;',
    'fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(a) + String.fromCharCode(10));',
    "const m = a.indexOf('-m');",
    "if (mode === 'capacity') { console.error('ERROR: usage limit reached. try again later'); process.exit(1); }",
    "if (mode === 'not-on-plan' && m !== -1) {",
    '  console.error("ERROR: The \'gpt-6.2-sol\' model is not supported when using Codex with a ChatGPT account.");',
    '  process.exit(1);',
    '}',
    "if (mode === 'both-fail') { console.error('ERROR: model gpt-6.2-sol does not exist'); process.exit(1); }",
    "fs.writeFileSync(a[a.indexOf('-o') + 1], JSON.stringify({ findings: [] }));",
    'process.exit(0);',
  ].join(String.fromCharCode(10));

  function setup(mode: string) {
    const bigCode = text(Array.from({ length: 200 }, (_, i) => `export const v${i} = ${i};`));
    const { dir } = makeRepo({ 'apps/web/src/a.ts': bigCode });
    const fakePath = path.join(dir, 'fake-codex.cjs');
    fs.writeFileSync(fakePath, FAKE);
    const argvLog = path.join(dir, 'fake-codex-argv.log');
    const calls = () =>
      fs.existsSync(argvLog)
        ? fs
            .readFileSync(argvLog, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l) as string[])
        : [];
    const runCodexReviewer = (
      input: string,
      last: string,
      cwd: string,
      _spawn: unknown,
      tier: object
    ) =>
      spawnSync(process.execPath, [fakePath, ...codexExecArgs(last, tier)], {
        input,
        cwd,
        encoding: 'utf8',
        env: { ...process.env, FAKE_CODEX_MODE: mode, FAKE_CODEX_LOG: argvLog },
      });
    return { dir, calls, runCodexReviewer };
  }

  const writeCache = (dir: string, models: object[]) => {
    fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.codex/models_cache.json'), JSON.stringify({ models }));
  };

  it('model not on the plan: retries once without -m and the effort flag, then passes, and records why', () => {
    const { dir, calls, runCodexReviewer } = setup('not-on-plan');
    const g = gate(dir, { runCodexReviewer });
    expect(g.run()).toBe(0);
    const argv = calls();
    expect(argv).toHaveLength(2);
    expect(argv[0]).toContain('-m');
    expect(argv[0]).toContain('gpt-6.2-sol');
    expect(argv[1]).not.toContain('-m');
    expect(argv[1].some((x) => x.startsWith('model_reasoning_effort='))).toBe(false);
    const rec = g.metrics().at(-1);
    expect(rec).toMatchObject({ verdict: 'PASS', reviewer: 'codex', model: null });
    expect(rec.why).toMatch(/gpt-6\.2-sol\/high is not available on the plan/);
    expect(rec.note).toMatch(/^model fallback:/);
  });

  it('a capacity error is a deferral, not a model fallback', () => {
    const { dir, calls, runCodexReviewer } = setup('capacity');
    const g = gate(dir, { runCodexReviewer });
    expect(g.run()).toBe(1);
    expect(calls()).toHaveLength(1);
    expect(g.out()).toMatch(/REVIEW_DEFERRED: codex unavailable \(usage cap\)/);
    expect(g.metrics().at(-1)).toMatchObject({ verdict: 'DEFERRED' });
  });

  it('model not on the plan and the retry fails too: deferred, with the fallback recorded', () => {
    const { dir, calls, runCodexReviewer } = setup('both-fail');
    const g = gate(dir, { runCodexReviewer });
    expect(g.run()).toBe(1);
    expect(calls()).toHaveLength(2);
    const rec = g.metrics().at(-1);
    expect(rec).toMatchObject({ verdict: 'DEFERRED' });
    expect(rec.why).toMatch(/is not available on the plan/);
    expect(g.out()).toMatch(/REVIEW_DEFERRED/);
  });

  it('an unknown slug in models_cache.json is skipped up front: no -m, no failed call', () => {
    const { dir, calls, runCodexReviewer } = setup('not-on-plan');
    writeCache(dir, [{ slug: 'gpt-6.1-sol', supported_reasoning_levels: [{ effort: 'high' }] }]);
    const g = gate(dir, { runCodexReviewer });
    expect(g.run()).toBe(0);
    const argv = calls();
    expect(argv).toHaveLength(1);
    expect(argv[0]).not.toContain('-m');
    expect(g.metrics().at(-1).why).toMatch(/gpt-6\.2-sol is not on the plan/);
  });

  it('a known model whose cached efforts lack the chosen one keeps -m and drops the effort flag', () => {
    const { dir, calls, runCodexReviewer } = setup('ok');
    writeCache(dir, [{ slug: 'gpt-6.2-sol', supported_reasoning_levels: [{ effort: 'low' }] }]);
    const g = gate(dir, { runCodexReviewer });
    expect(g.run()).toBe(0);
    const argv = calls()[0];
    expect(argv).toContain('gpt-6.2-sol');
    expect(argv.some((x) => x.startsWith('model_reasoning_effort='))).toBe(false);
  });
});

describe('isModelUnavailable', () => {
  it('reads codex model/effort errors, and never a usage cap', () => {
    expect(
      isModelUnavailable("The 'x' model is not supported when using Codex with a ChatGPT account.")
    ).toBe(true);
    expect(isModelUnavailable('{"error":{"code":"model_not_found"}}')).toBe(true);
    expect(isModelUnavailable('Unsupported value: reasoning effort ultra is not supported')).toBe(
      true
    );
    expect(
      isModelUnavailable('You hit your usage limit. model gpt is not available until reset')
    ).toBe(false);
    expect(isModelUnavailable('network error: ECONNRESET')).toBe(false);
    expect(isModelUnavailable('')).toBe(false);
  });
});

describe('createGate: the codex config model is missing from the plan catalog', () => {
  // A fake codex that fails like the real one for any -m model outside FAKE_CODEX_OK (a comma
  // list), and treats "no -m" as the config model, which FAKE_CODEX_CONFIG_OK says works or not.
  const FAKE = [
    "const fs = require('node:fs');",
    'const a = process.argv.slice(2);',
    'fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(a) + String.fromCharCode(10));',
    "const m = a.indexOf('-m');",
    "const ok = (process.env.FAKE_CODEX_OK || '').split(',');",
    "const bad = (slug) => { console.error('ERROR: The ' + slug + ' model is not supported when using Codex with a ChatGPT account.'); process.exit(1); };",
    "if (m === -1 && process.env.FAKE_CODEX_CONFIG_OK !== '1') bad('gpt-6.2-astra');",
    'if (m !== -1 && !ok.includes(a[m + 1])) bad(a[m + 1]);',
    "fs.writeFileSync(a[a.indexOf('-o') + 1], JSON.stringify({ findings: [] }));",
    'process.exit(0);',
  ].join(String.fromCharCode(10));

  const CONFIG = 'model = "gpt-6.2-astra"\nmodel_reasoning_effort = "high"\n';

  function setup(opts: { catalog: string[]; config: string; configOk?: boolean; ok?: string }) {
    const bigCode = text(Array.from({ length: 200 }, (_, i) => `export const v${i} = ${i};`));
    const { dir } = makeRepo({ 'apps/web/src/a.ts': bigCode });
    const fakePath = path.join(dir, 'fake-codex.cjs');
    fs.writeFileSync(fakePath, FAKE);
    const argvLog = path.join(dir, 'fake-codex-argv.log');
    const catalogPath = path.join(dir, 'fake-models-cache.json');
    const configPath = path.join(dir, 'fake-config.toml');
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        models: opts.catalog.map((slug) => ({
          slug,
          supported_reasoning_levels: [{ effort: 'high' }, { effort: 'medium' }],
        })),
      })
    );
    fs.writeFileSync(configPath, opts.config);
    const calls = () =>
      fs.existsSync(argvLog)
        ? fs
            .readFileSync(argvLog, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l) as string[])
        : [];
    const runCodexReviewer = (
      input: string,
      last: string,
      cwd: string,
      _spawn: unknown,
      tier: object
    ) =>
      spawnSync(process.execPath, [fakePath, ...codexExecArgs(last, tier)], {
        input,
        cwd,
        encoding: 'utf8',
        env: {
          ...gitEnv(process.env),
          FAKE_CODEX_LOG: argvLog,
          FAKE_CODEX_OK: opts.ok ?? '',
          FAKE_CODEX_CONFIG_OK: opts.configOk ? '1' : '0',
        },
      });
    const env = {
      CODEX_REVIEW_MAX_WAIT_MIN: '0',
      CODEX_REVIEW_MODELS_CACHE: catalogPath,
      CODEX_REVIEW_CODEX_CONFIG: configPath,
    };
    return { dir, calls, runCodexReviewer, env, configPath };
  }

  const usedModels = (calls: string[][]) =>
    calls.map((argv) => (argv.includes('-m') ? argv[argv.indexOf('-m') + 1] : null));

  it('config model missing: retries on the first catalog-listed preference, passes, records which', () => {
    const t = setup({
      catalog: ['gpt-6-sol', 'gpt-5.6-sol', 'gpt-6-luna'],
      config: CONFIG,
      ok: 'gpt-6-sol',
    });
    const before = fs.readFileSync(t.configPath, 'utf8');
    const g = gate(t.dir, { runCodexReviewer: t.runCodexReviewer, env: t.env });
    expect(g.run()).toBe(0);
    const used = usedModels(t.calls());
    expect(used.at(-1)).toBe('gpt-6-sol');
    expect(used).not.toContain('gpt-5.6-sol');
    const rec = g.metrics().at(-1);
    expect(rec).toMatchObject({ verdict: 'PASS', reviewer: 'codex', model: 'gpt-6-sol' });
    expect(rec.why).toMatch(/config model gpt-6\.2-astra is missing from the plan catalog/);
    expect(rec.why).toMatch(/retried with gpt-6-sol\/high/);
    expect(fs.readFileSync(t.configPath, 'utf8')).toBe(before);
  });

  it('config model on the plan: current behaviour, no catalog fallback is tried', () => {
    const t = setup({ catalog: ['gpt-6.2-astra', 'gpt-6.1-sol'], config: CONFIG, configOk: true });
    const g = gate(t.dir, { runCodexReviewer: t.runCodexReviewer, env: t.env });
    expect(g.run()).toBe(0);
    const used = usedModels(t.calls());
    expect(used).not.toContain('gpt-6.1-sol');
    expect(used.at(-1)).toBeNull();
    expect(g.metrics().at(-1).why).not.toMatch(/catalog/);

    const u = setup({
      catalog: ['gpt-6.2-astra', 'gpt-6.1-sol'],
      config: CONFIG,
      ok: 'gpt-6.1-sol',
    });
    const gu = gate(u.dir, { runCodexReviewer: u.runCodexReviewer, env: u.env });
    expect(gu.run()).toBe(1);
    expect(usedModels(u.calls())).not.toContain('gpt-6.1-sol');
    expect(gu.out()).toMatch(/REVIEW_DEFERRED: codex unavailable/);
  });

  it('nothing in the catalog is a preferred model: deferred as before', () => {
    const t = setup({ catalog: ['unrelated-model'], config: CONFIG, ok: 'unrelated-model' });
    const g = gate(t.dir, { runCodexReviewer: t.runCodexReviewer, env: t.env });
    expect(g.run()).toBe(1);
    expect(usedModels(t.calls())).not.toContain('unrelated-model');
    expect(g.out()).toMatch(/REVIEW_DEFERRED: codex unavailable/);
    expect(g.metrics().at(-1)).toMatchObject({ verdict: 'DEFERRED' });
  });
});
