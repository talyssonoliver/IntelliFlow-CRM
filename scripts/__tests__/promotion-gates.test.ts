/**
 * Tests for scripts/ops/promotion-gates.mjs: the checks a main commit must have
 * passed before promote-production.yml may move any production image tag.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ATTESTATION_CHECK,
  REQUIRED_MAIN_CHECKS,
  evaluateChecks,
  imageBuildFor,
  latestByName,
  main,
  pickMergedPr,
  verdict,
} from '../ops/promotion-gates.mjs';

const SHA = 'a'.repeat(40);
const PR_HEAD = 'b'.repeat(40);

let nextId = 1;
const run = (name: string, conclusion: string | null = 'success', status = 'completed') => ({
  id: nextId++,
  name,
  status,
  conclusion,
});
const allGreen = () => REQUIRED_MAIN_CHECKS.map((n) => run(n));
const mergedPr = (over: Record<string, unknown> = {}) => ({
  number: 42,
  merged_at: '2026-10-05T18:00:00Z',
  merge_commit_sha: SHA,
  base: { ref: 'main' },
  head: { sha: PR_HEAD },
  ...over,
});

describe('evaluateChecks', () => {
  it('passes when every required check succeeded', () => {
    const r = evaluateChecks(allGreen(), REQUIRED_MAIN_CHECKS);
    expect(r.ok).toBe(true);
    expect(r.passed).toEqual(REQUIRED_MAIN_CHECKS);
  });

  it('treats skipped, cancelled and failed as not passed: a gate that did not run did not pass', () => {
    const runs = allGreen();
    runs.push(run('Unit Tests (sharded) / SonarCloud Scan', 'skipped'));
    runs.push(run('Build', 'failure'));
    runs.push(run('Type Check', 'cancelled'));
    const r = evaluateChecks(runs, REQUIRED_MAIN_CHECKS);
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([
      'Type Check (cancelled)',
      'Build (failure)',
      'Unit Tests (sharded) / SonarCloud Scan (skipped)',
    ]);
  });

  it('reports a check still running, and one that never reported', () => {
    const runs = allGreen().filter((r) => r.name !== 'Integration Tests');
    runs.push(run('Lint & Format', null, 'in_progress'));
    const r = evaluateChecks(runs, REQUIRED_MAIN_CHECKS);
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual(['Lint & Format (in_progress)']);
    expect(r.missing).toEqual(['Integration Tests']);
  });

  it('judges a re-run by its newest attempt', () => {
    const runs = allGreen();
    const latest = latestByName([run('Build', 'failure'), run('Build', 'success')]);
    expect(latest.get('Build')?.conclusion).toBe('success');
    runs.push(run('Build', 'failure'));
    expect(evaluateChecks(runs, ['Build']).ok).toBe(false);
  });
});

describe('pickMergedPr', () => {
  it('finds the PR whose merge put this commit on main', () => {
    const prs = [mergedPr({ number: 1, merge_commit_sha: 'c'.repeat(40) }), mergedPr()];
    expect(pickMergedPr(prs, SHA)?.number).toBe(42);
  });

  it('ignores open PRs and PRs into other branches', () => {
    expect(pickMergedPr([mergedPr({ merged_at: null })], SHA)).toBeNull();
    expect(pickMergedPr([mergedPr({ base: { ref: 'develop' } })], SHA)).toBeNull();
  });
});

describe('imageBuildFor', () => {
  it('needs a completed, successful image build of exactly this SHA', () => {
    const ok = { id: 7, head_sha: SHA, status: 'completed', conclusion: 'success', event: 'push' };
    expect(imageBuildFor([ok], SHA)?.id).toBe(7);
    expect(imageBuildFor([{ ...ok, conclusion: 'failure' }], SHA)).toBeNull();
    expect(imageBuildFor([{ ...ok, status: 'in_progress' }], SHA)).toBeNull();
    expect(imageBuildFor([{ ...ok, head_sha: PR_HEAD }], SHA)).toBeNull();
  });
});

describe('verdict', () => {
  const green = evaluateChecks(allGreen(), REQUIRED_MAIN_CHECKS);
  const attested = evaluateChecks([run(ATTESTATION_CHECK)], [ATTESTATION_CHECK]);
  const imageRun = { id: 9 };

  it('passes only when all three gates pass', () => {
    const v = verdict({
      sha: SHA,
      mainChecks: green,
      pr: mergedPr(),
      attestation: attested,
      imageRun,
    });
    expect(v.ok).toBe(true);
    expect(v.lines.join('\n')).toMatch(/PASS {2}Pre-ship Attestation on the merged PR head \(#42/);
  });

  it('fails without a merged PR, naming why', () => {
    const v = verdict({ sha: SHA, mainChecks: green, pr: null, attestation: attested, imageRun });
    expect(v.ok).toBe(false);
    expect(v.lines.join('\n')).toMatch(/no merged PR found/);
  });

  it('fails without an image build and lists failed and missing checks', () => {
    const red = evaluateChecks([run('Build', 'failure')], ['Build', 'Type Check']);
    const unattested = evaluateChecks([], [ATTESTATION_CHECK]);
    const v = verdict({
      sha: SHA,
      mainChecks: red,
      pr: mergedPr(),
      attestation: unattested,
      imageRun: null,
    });
    expect(v.ok).toBe(false);
    const text = v.lines.join('\n');
    expect(text).toMatch(/FAILED {3}Build \(failure\)/);
    expect(text).toMatch(/MISSING {2}Type Check/);
    expect(text).toMatch(/FAIL {2}Build & Push Images/);
    expect(text).toMatch(/Pre-ship Attestation/);
  });
});

describe('main (CLI)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const quiet = () => {
    const logs: string[] = [];
    return { logs, out: { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m) } };
  };

  /** A fetch that answers the four GitHub API calls main() makes. */
  function stubGitHub({
    checks = allGreen(),
    prs = [mergedPr()],
    attest = 'success',
    image = 'success',
  } = {}) {
    const responses: Array<[RegExp, unknown]> = [
      [new RegExp(`/commits/${SHA}/check-runs`), { check_runs: checks }],
      [new RegExp(`/commits/${SHA}/pulls`), prs],
      [
        new RegExp(`/commits/${PR_HEAD}/check-runs`),
        { check_runs: [run(ATTESTATION_CHECK, attest)] },
      ],
      [
        /build-images\.yml\/runs/,
        { workflow_runs: [{ id: 5, head_sha: SHA, status: 'completed', conclusion: image }] },
      ],
    ];
    const fetchStub = vi.fn(async (url: string) => {
      const hit = responses.find(([re]) => re.test(url));
      return hit
        ? { ok: true, json: async () => hit[1], text: async () => '' }
        : { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    });
    vi.stubGlobal('fetch', fetchStub);
    return fetchStub;
  }

  const env = { GITHUB_TOKEN: 'test-token-placeholder', GITHUB_REPOSITORY: 'owner/repo' };

  it('exits 0 when every gate passes, and writes the step summary', async () => {
    stubGitHub();
    const summary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'promo-')), 'summary.md');
    const { logs, out } = quiet();
    expect(await main([`--sha=${SHA}`], { ...env, GITHUB_STEP_SUMMARY: summary }, out)).toBe(0);
    expect(logs[0]).toBe(`Promotion gates for ${SHA}`);
    expect(fs.readFileSync(summary, 'utf8')).toMatch(/PASS {2}required checks/);
  });

  it('exits 1 when the main commit failed a required check', async () => {
    const checks = allGreen();
    checks.push(run('Unit Tests (sharded) / Merge Coverage Gate', 'failure'));
    stubGitHub({ checks });
    const { out } = quiet();
    expect(await main([`--sha=${SHA}`], env, out)).toBe(1);
  });

  it('exits 1 when no merged PR is found (no attestation can be checked)', async () => {
    stubGitHub({ prs: [] });
    const { logs, out } = quiet();
    expect(await main([`--sha=${SHA}`], env, out)).toBe(1);
    expect(logs.join('\n')).toMatch(/no merged PR found/);
  });

  it('exits 1 when the PR head was not attested or the image build failed', async () => {
    stubGitHub({ attest: 'failure' });
    expect(await main([`--sha=${SHA}`], env, quiet().out)).toBe(1);
    stubGitHub({ image: 'failure' });
    expect(await main([`--sha=${SHA}`], env, quiet().out)).toBe(1);
  });

  it('pages through check runs past 100', async () => {
    const many = Array.from({ length: 100 }, (_, i) => run(`noise ${i}`));
    const pages = [{ check_runs: many }, { check_runs: allGreen() }];
    let page = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes(`/commits/${SHA}/check-runs`))
          return { ok: true, json: async () => pages[page++] };
        if (url.includes('/pulls')) return { ok: true, json: async () => [mergedPr()] };
        if (url.includes(`/commits/${PR_HEAD}/check-runs`)) {
          return { ok: true, json: async () => ({ check_runs: [run(ATTESTATION_CHECK)] }) };
        }
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [{ id: 1, head_sha: SHA, status: 'completed', conclusion: 'success' }],
          }),
        };
      })
    );
    expect(await main([`--sha=${SHA}`], env, quiet().out)).toBe(0);
    expect(page).toBe(2);
  });

  it('surfaces a GitHub API error instead of passing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, text: async () => 'bad gateway' }))
    );
    await expect(main([`--sha=${SHA}`], env, quiet().out)).rejects.toThrow(/502/);
  });

  it('refuses a short or missing SHA and a missing token as usage errors', async () => {
    const { logs, out } = quiet();
    expect(await main(['--sha=abc1234'], env, out)).toBe(2);
    expect(await main([], env, out)).toBe(2);
    expect(await main([`--sha=${SHA}`], {}, out)).toBe(2);
    expect(logs.join('\n')).toMatch(/full 40-character/);
    expect(logs.join('\n')).toMatch(/GITHUB_TOKEN/);
  });
});
