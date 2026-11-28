/**
 * End to end, with no model: runs scripts/codex-review.mjs in a throw-away git repo for the paths
 * that must not call one: a docs-only diff (recorded skip), a comment-only diff (recorded skip) and a
 * branch past its round limit (human route, nothing waived). A model run is never started.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { classifyDiff } from '../lib/review-tier.mjs';
import { guardSharedGitConfig } from './shared-git-config-guard';
import { gitEnv } from '../lib/preship-git.mjs';

guardSharedGitConfig();

const SCRIPT = path.resolve(__dirname, '../codex-review.mjs');

function git(cwd: string, ...args: string[]) {
  // GIT_* from the pre-push hook must not reach a temp repo (it set core.bare=true on the real one)
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(process.env) });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function repo(files: Record<string, string>, change: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gate-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'gate@example.invalid');
  git(dir, 'config', 'user.name', 'gate');
  git(dir, 'config', 'commit.gpgsign', 'false');
  const write = (set: Record<string, string>) => {
    for (const [f, text] of Object.entries(set)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), text);
    }
  };
  write(files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'feat/x');
  write(change);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'change');
  return dir;
}

function gate(dir: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, '--base=main'], {
    cwd: dir,
    encoding: 'utf8',
    // A PATH with no codex or claude on it: nothing could review even if the script tried.
    env: {
      ...gitEnv(process.env),
      // pinned: a push run with a raised round cap must not change what these tests assert
      CODEX_REVIEW_MAX_ROUNDS: '4',
      PATH: path.dirname(process.execPath) + path.delimiter + gitDir(),
      ...env,
    },
    timeout: 60_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

let gitBin = '';
function gitDir() {
  return gitBin;
}

const readJson = (dir: string, f: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'artifacts/codex-review', f), 'utf8'));
const metrics = (dir: string) =>
  fs
    .readFileSync(path.join(dir, 'artifacts/codex-review/metrics.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

beforeAll(() => {
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], {
    encoding: 'utf8',
  });
  gitBin = path.dirname(where.stdout.split(/\r?\n/)[0]);
});

describe('codex-review.mjs without a model', () => {
  it('skips a docs-only diff visibly: output, findings.json and metrics all say why', () => {
    const dir = repo({ 'docs/a.md': '# a\n' }, { 'docs/a.md': '# a\nmore\n' });
    const r = gate(dir);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/skipped: only docs, tests, generated or tooling files changed/);
    expect(r.out).toMatch(/No model was called/);
    const f = readJson(dir, 'findings.json');
    expect(f).toMatchObject({ verdict: 'SKIPPED' });
    expect(f.skipped_reason).toMatch(/only docs/);
    const m = metrics(dir);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      mode: 'skipped',
      tier: 'skip',
      reviewer: 'none',
      verdict: 'SKIPPED',
      round: 0,
      branch: 'feat/x',
    });
    expect(m[0].note).toMatch(/^skipped: /);
  });

  it('skips a test-only diff', () => {
    const dir = repo({ 'apps/web/src/a.test.ts': 'x\n' }, { 'apps/web/src/a.test.ts': 'y\n' });
    const r = gate(dir);
    expect(r.status).toBe(0);
    expect(metrics(dir)[0]).toMatchObject({ mode: 'skipped' });
  });

  it('skips a comment-only code diff, but not a code change', () => {
    const base = { 'apps/web/src/a.ts': '// old\nexport const a = 1;\n' };
    const dir = repo(base, { 'apps/web/src/a.ts': '// new\nexport const a = 1;\n' });
    expect(gate(dir).out).toMatch(/comment or whitespace-only/);
  });

  it('defers instead of passing when a code diff cannot be reviewed (no codex, no claude)', () => {
    const dir = repo(
      { 'apps/web/src/a.ts': 'export const a = 1;\n' },
      { 'apps/web/src/a.ts': 'export const a = 2;\n' }
    );
    const r = gate(dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/REVIEW_DEFERRED: codex unavailable/);
    expect(r.out).toMatch(/NOT reviewed/);
    expect(readJson(dir, 'findings.json').verdict).toBe('FAIL');
    expect(metrics(dir)[0]).toMatchObject({
      mode: 'deferred',
      verdict: 'DEFERRED',
      tier: 'light',
      reviewer: 'none',
    });
  });

  it('a risky diff with no reviewer is deferred too, and sized strong', () => {
    const dir = repo(
      { 'apps/api/src/modules/billing/b.ts': 'export const a = 1;\n' },
      { 'apps/api/src/modules/billing/b.ts': 'export const a = 2;\n' }
    );
    const r = gate(dir);
    expect(r.status).toBe(1);
    // the script and the library agree on the sizing
    expect(
      classifyDiff([{ file: 'apps/api/src/modules/billing/b.ts', added: 1, deleted: 1 }])
    ).toMatchObject({ tier: 'strong', risky: true });
    expect(r.out).toMatch(/sizing +: strong \(risky\)/);
    expect(r.out).toMatch(/risky, but the Claude CLI is not available/);
    expect(metrics(dir)[0]).toMatchObject({ mode: 'deferred', tier: 'strong' });
  });

  it('stops at the round limit with a human route and waives nothing', () => {
    const dir = repo(
      { 'apps/web/src/a.ts': 'export const a = 1;\n' },
      { 'apps/web/src/a.ts': 'export const a = 2;\n' }
    );
    fs.mkdirSync(path.join(dir, 'artifacts/codex-review'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'artifacts/codex-review/round-state.json'),
      JSON.stringify({
        version: 1,
        branches: {
          'feat/x': {
            rounds: 4,
            lastHead: 'abc',
            reviewedHunks: [],
            findings: [
              { severity: 'high', file: 'apps/web/src/a.ts', line: 1, rule: 'wrong-unit' },
            ],
            lastRound: { round: 4, head: 'abc', at: 'now' },
          },
        },
      })
    );
    const r = gate(dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/ROUND_LIMIT: 4 semantic-review rounds on feat\/x \(limit 4\)/);
    expect(r.out).toMatch(/owner or the orchestrator decides/);
    expect(r.out).toMatch(/\[HIGH\] apps\/web\/src\/a\.ts:1 wrong-unit/);
    expect(metrics(dir)[0]).toMatchObject({ mode: 'round-limit', verdict: 'FAIL' });
    expect(fs.existsSync(path.join(dir, 'tools/audit/codex-review-waivers.yaml'))).toBe(false);
    // raising the limit is the owner's call: with room for a fifth round the gate goes on to review
    const more = gate(dir, { CODEX_REVIEW_MAX_ROUNDS: '5' });
    expect(more.out).not.toMatch(/ROUND_LIMIT/);
    expect(more.out).toMatch(/round 5\/5/);
  });
});
