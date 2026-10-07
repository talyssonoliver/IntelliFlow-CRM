#!/usr/bin/env node
/**
 * Production promotion gates: may this exact main commit go to production?
 *
 * Used by .github/workflows/promote-production.yml BEFORE any image tag moves.
 * The commit must:
 *   1. carry a successful run of every required check that runs on a push to
 *      main (REQUIRED_MAIN_CHECKS: the branch-protection contexts that CI
 *      Pipeline reports on main; the PR-only contexts are checked through 2);
 *   2. come from a merged PR whose head passed "Pre-ship Attestation", i.e. a
 *      local pre-ship gate was recorded for the code that merged;
 *   3. have a successful "Build & Push Images" run for that SHA, so the
 *      sha-<40> images being promoted were built from exactly this commit.
 *
 * "Successful" means conclusion `success`. A skipped, cancelled or missing
 * check fails the gate: a gate that did not run did not pass.
 *
 * Usage (CI): GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo \
 *   node scripts/ops/promotion-gates.mjs --sha=<40-hex>
 * Exit: 0 all gates pass · 1 a gate failed · 2 usage error.
 */

import path from 'node:path';
import fs from 'node:fs';

/** Branch-protection contexts that report on a push to main (CI Pipeline). */
export const REQUIRED_MAIN_CHECKS = [
  'Lint & Format',
  'Type Check',
  'Architecture Tests',
  'Build',
  'Integration Tests',
  'Sprint Plan Validation',
  'Unit Tests (sharded) / Merge Coverage Gate',
  'Unit Tests (sharded) / SonarCloud Scan',
];

/** The PR-head check that records a local pre-ship gate for the merged code. */
export const ATTESTATION_CHECK = 'Pre-ship Attestation';

/** The workflow that builds and publishes the immutable sha-<40> images. */
export const IMAGE_WORKFLOW = 'Build & Push Images';

/**
 * Latest check run per name. A re-run creates a new check run with the same
 * name; the newest one is the verdict.
 * @param {Array<{name: string, id: number, status: string, conclusion: string|null, started_at?: string}>} runs
 */
export function latestByName(runs) {
  const latest = new Map();
  for (const r of runs) {
    const prev = latest.get(r.name);
    if (!prev || r.id > prev.id) latest.set(r.name, r);
  }
  return latest;
}

/**
 * Evaluate required checks against a commit's check runs.
 * @returns {{ok: boolean, passed: string[], failed: string[], missing: string[]}}
 */
export function evaluateChecks(runs, required) {
  const latest = latestByName(runs);
  const passed = [];
  const failed = [];
  const missing = [];
  for (const name of required) {
    const r = latest.get(name);
    if (!r) missing.push(name);
    else if (r.status === 'completed' && r.conclusion === 'success') passed.push(name);
    else failed.push(`${name} (${r.status === 'completed' ? r.conclusion : r.status})`);
  }
  return { ok: failed.length === 0 && missing.length === 0, passed, failed, missing };
}

/**
 * The PR that put `sha` on main. Linear history means a rebase merge, so the
 * main commit is not the PR head; GitHub links them through merge_commit_sha.
 * @param {Array<{number: number, merged_at: string|null, merge_commit_sha: string|null, base: {ref: string}, head: {sha: string}}>} prs
 */
export function pickMergedPr(prs, sha, baseRef = 'main') {
  return (
    prs.find((p) => p.merged_at && p.base?.ref === baseRef && p.merge_commit_sha === sha) ?? null
  );
}

/**
 * Was there a successful image build for this exact SHA?
 * @param {Array<{head_sha: string, conclusion: string|null, status: string, event: string}>} workflowRuns
 */
export function imageBuildFor(workflowRuns, sha) {
  return (
    workflowRuns.find(
      (r) => r.head_sha === sha && r.status === 'completed' && r.conclusion === 'success'
    ) ?? null
  );
}

/**
 * Combine the three gates into one verdict with human-readable lines.
 * @returns {{ok: boolean, lines: string[]}}
 */
export function verdict({ sha, mainChecks, pr, attestation, imageRun }) {
  const lines = [`Promotion gates for ${sha}`];
  const mark = (ok) => (ok ? 'PASS' : 'FAIL');

  lines.push(`${mark(mainChecks.ok)}  required checks on the main commit`);
  for (const n of mainChecks.passed) lines.push(`        ok       ${n}`);
  for (const n of mainChecks.failed) lines.push(`        FAILED   ${n}`);
  for (const n of mainChecks.missing) lines.push(`        MISSING  ${n}`);

  const attOk = Boolean(pr) && attestation.ok;
  lines.push(
    `${mark(attOk)}  ${ATTESTATION_CHECK} on the merged PR head` +
      (pr
        ? ` (#${pr.number} @ ${pr.head.sha.slice(0, 9)})`
        : ' (no merged PR found for this commit)')
  );
  if (pr)
    for (const n of [...attestation.failed, ...attestation.missing]) lines.push(`        ${n}`);

  lines.push(
    `${mark(Boolean(imageRun))}  ${IMAGE_WORKFLOW} succeeded for this SHA` +
      (imageRun ? ` (run ${imageRun.id})` : '')
  );

  return { ok: mainChecks.ok && attOk && Boolean(imageRun), lines };
}

// ─── CLI ──────────────────────────────────────────────────────────────────

async function api(token, url) {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

/** Every check run on a ref, across pages. */
async function checkRuns(token, base, ref) {
  const all = [];
  for (let page = 1; ; page++) {
    const body = await api(token, `${base}/commits/${ref}/check-runs?per_page=100&page=${page}`);
    all.push(...body.check_runs);
    if (body.check_runs.length < 100) return all;
  }
}

export async function main(argv, env = process.env, out = console) {
  const shaArg = argv.find((a) => a.startsWith('--sha='));
  const sha = shaArg ? shaArg.slice(6).trim() : '';
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    out.error(`--sha=<full 40-character commit SHA> is required, got: ${sha || '(none)'}`);
    return 2;
  }
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    out.error('GITHUB_TOKEN and GITHUB_REPOSITORY must be set.');
    return 2;
  }
  const base = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}`;

  const mainChecks = evaluateChecks(await checkRuns(token, base, sha), REQUIRED_MAIN_CHECKS);
  const pr = pickMergedPr(await api(token, `${base}/commits/${sha}/pulls`), sha);
  const attestation = pr
    ? evaluateChecks(await checkRuns(token, base, pr.head.sha), [ATTESTATION_CHECK])
    : { ok: false, passed: [], failed: [], missing: [ATTESTATION_CHECK] };
  const runs = await api(
    token,
    `${base}/actions/workflows/build-images.yml/runs?head_sha=${sha}&per_page=20`
  );
  const imageRun = imageBuildFor(runs.workflow_runs, sha);

  const v = verdict({ sha, mainChecks, pr, attestation, imageRun });
  for (const l of v.lines) out.log(l);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, ['```', ...v.lines, '```', ''].join('\n'));
  }
  return v.ok ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]).endsWith('promotion-gates.mjs');
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`promotion gates could not be evaluated: ${err.message}`);
      process.exit(1);
    }
  );
}
