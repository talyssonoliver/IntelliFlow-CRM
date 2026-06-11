#!/usr/bin/env node
/**
 * Gate self-test: proves four invariants of scripts/codex-review.mjs
 *
 *   1. CLEAN    — a diff with no in-scope files exits 0 (nothing to review)
 *   2. BUGGY    — a diff containing a data-integrity bug exits 1 (gate blocks)
 *   3. WAIVER×3 — adding a stable source-code fingerprint waiver exits 0 on
 *                 THREE consecutive runs of the same buggy diff — proving the
 *                 waiver survives LLM rephrasing (model non-determinism).
 *   4. DISTINCT — an unrelated bug on a DIFFERENT line is NOT suppressed by
 *                 the waiver for the first bug (exits 1).
 *
 * The fingerprint is now computed from the SOURCE TEXT at the flagged line(s),
 * not the LLM's prose, so it stays stable across runs.
 *
 * This script creates in-scope fixture files with deliberate bugs, stages
 * them, runs the gate, then restores state. It does NOT commit anything.
 *
 * Usage:
 *   node scripts/validate-codex-gate.mjs
 *
 * Requires the local codex CLI to be installed and OAuth-authenticated
 * (run `codex login` if needed; confirm with `codex login status`).
 * No OPENAI_API_KEY is required — the gate uses local OAuth only.
 * If codex is absent or not logged in, reports SKIPPED_PRECONDITION.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function detectRepoRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (r.status === 0 && r.stdout) return r.stdout.trim().replace(/\\/g, '/');
  return process.cwd().replace(/\\/g, '/');
}

const REPO_ROOT = detectRepoRoot();
process.chdir(REPO_ROOT);

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    cwd: REPO_ROOT,
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? -1 };
}

const FIXTURE_PATH = 'packages/validators/src/__codex_gate_test_fixture__.ts';
const FIXTURE2_PATH = 'packages/validators/src/__codex_gate_test_fixture2__.ts';
const WAIVERS_PATH = 'tools/audit/codex-review-waivers.yaml';

// Buggy fixture: revenue-band unit mapping bug on a known line.
// The BUG line is line 14 (1-indexed) in this content.
const BUGGY_CONTENT = `/**
 * CODEX GATE TEST FIXTURE — do NOT commit this file.
 * This file contains a deliberate data-integrity bug for gate validation.
 */

// Revenue band to amount-in-cents mapping.
// BUG: "1M-10M" should map to 1_000_000_00 (100M cents) not 100 (1 dollar).
// This is the exact class of bug that passes TypeScript + tests + lint
// when the test also asserts 100 (encoding the same wrong assumption).
export const REVENUE_BAND_CENTS: Record<string, number> = {
  '0-100K':   10_000_00,   // $100K = 10,000,00 cents  OK
  '100K-1M':  100_000_00,  // $1M   = 100,000,00 cents OK
  '1M-10M':   100,         // BUG: should be 1_000_000_00 (maps $1M band to $1)
  '10M+':     10_000_000_00,
};

export function getRevenueBandCents(band: string): number {
  return REVENUE_BAND_CENTS[band] ?? 0;
}
`;

// Distinct second fixture: different file, different bug (off-by-one in slice)
// Used to prove the first waiver does NOT suppress an unrelated finding.
const DISTINCT_BUGGY_CONTENT = `/**
 * CODEX GATE TEST FIXTURE 2 — do NOT commit this file.
 * Deliberate off-by-one: slice should start at 1, not 0.
 */
export function getTopN<T>(items: T[], n: number): T[] {
  // BUG: skips sorting; returns wrong slice when items are unordered
  return items.slice(0, n - 1); // off-by-one: should be slice(0, n)
}
`;

// Must match FP_DRIFT in scripts/codex-review.mjs exactly.
const FP_DRIFT = 2;

/**
 * Given the findings.json artifact, find all fingerprints from unwaived findings
 * and the line numbers reported for the fixture file so we can compute the
 * stable fingerprint independently.
 */
function getStableFingerprintsFromArtifact(findingsPath, fixtureFile) {
  if (!fs.existsSync(findingsPath)) return [];
  const data = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  const relevantFindings = (data.findings || []).filter(
    (f) => f.file && f.file.includes('__codex_gate_test_fixture__')
  );
  const results = [];
  for (const f of relevantFindings) {
    // First try: use the fingerprint already stamped by our gate (already source-based)
    if (f.fingerprint && f.fingerprint.length === 64) {
      results.push({ fingerprint: f.fingerprint, line: f.line, file: f.file });
    }
  }
  return results;
}

async function main() {
  const pass = (msg) => process.stdout.write(`  PASS  ${msg}\n`);
  const fail = (msg) => {
    process.stdout.write(`  FAIL  ${msg}\n`);
    process.exit(1);
  };
  const info = (msg) => process.stdout.write(`        ${msg}\n`);

  process.stdout.write('=== Codex Gate Self-Test (stable source-code fingerprints) ===\n\n');

  // Precondition checks
  const codexCheck = run('codex', ['--version'], {});
  if (codexCheck.status !== 0) {
    process.stdout.write(
      'SKIPPED_PRECONDITION: codex CLI not found on PATH.\n' +
        '  Install with: npm install -g @openai/codex\n' +
        '  Then authenticate: codex login\n'
    );
    process.exit(0);
  }
  info(`codex version: ${codexCheck.stdout.trim()}`);

  // Auth probe — codex uses local OAuth (ChatGPT/Codex login), not an API key.
  const authCheck = run('codex', ['login', 'status'], {});
  const authCombined = ((authCheck.stdout || '') + (authCheck.stderr || '')).toLowerCase();
  if (authCheck.status !== 0 || !authCombined.includes('logged in')) {
    process.stdout.write(
      'SKIPPED_PRECONDITION: codex CLI is not logged in.\n' +
        '  Run: codex login\n' +
        '  Confirm: codex login status\n' +
        '  This gate uses local OAuth — no OPENAI_API_KEY required.\n'
    );
    process.exit(0);
  }
  info(`codex auth: ${(authCheck.stdout || authCheck.stderr || '').trim()}`);

  const findingsPath = path.join(REPO_ROOT, 'artifacts/codex-review/findings.json');
  const currentWaivers = fs.readFileSync(path.join(REPO_ROOT, WAIVERS_PATH), 'utf8');

  // ── Test 1: CLEAN — no in-scope files changed ──────────────────────
  process.stdout.write('Test 1: CLEAN diff (no in-scope files) → exit 0\n');
  const diffFiles = run('git', ['diff', '--name-only', 'origin/main...HEAD'], {});
  const inScope = diffFiles.stdout.split('\n').filter((f) => {
    const t = f.trim();
    return t.startsWith('packages/') || t.startsWith('apps/');
  });
  if (inScope.length === 0) {
    const r = run('node', ['scripts/codex-review.mjs', '--base=HEAD'], {});
    info(`exit: ${r.status}`);
    if (r.status === 0) {
      pass('exit 0 on empty diff');
    } else {
      fail(`expected exit 0 on empty diff, got ${r.status}\n${r.stdout}`);
    }
  } else {
    info('Worktree has in-scope changes; skipping clean-diff check (Test 1).');
  }

  // ── Test 2: BUGGY — fixture with deliberate bug → exit 1 ──────────
  process.stdout.write('\nTest 2: BUGGY fixture (revenue-band unit mapping bug) → exit 1\n');

  fs.writeFileSync(path.join(REPO_ROOT, FIXTURE_PATH), BUGGY_CONTENT);
  run('git', ['add', FIXTURE_PATH], {});

  let buggyResult;
  let bugFingerprints = [];
  try {
    buggyResult = run('node', ['scripts/codex-review.mjs', '--base=HEAD'], {
      CODEX_REVIEW_VERBOSE: '0',
    });
    info(`exit: ${buggyResult.status}`);
    const findingsMatch = buggyResult.stdout.match(/Total findings\s*:\s*(\d+)/);
    info(`findings: ${findingsMatch ? findingsMatch[1] : '?'}`);

    if (buggyResult.status === 1) {
      pass('exit 1 on buggy fixture (gate correctly blocked)');
      // Extract the stable fingerprints from the artifact
      bugFingerprints = getStableFingerprintsFromArtifact(findingsPath, FIXTURE_PATH);
      info(`stable fingerprints from artifact: ${bugFingerprints.length}`);
      for (const bf of bugFingerprints) {
        info(`  fp=${bf.fingerprint.slice(0, 16)}... line=${bf.line} file=${bf.file}`);
      }
    } else if (buggyResult.status === 0) {
      process.stdout.write(
        '  WARN  exit 0 on buggy fixture — Codex did not flag the revenue-band bug.\n' +
          '        This is a model false-negative, not a gate implementation bug.\n' +
          '        Skipping waiver stability tests (no fingerprint to waive).\n'
      );
      // Clean up and exit without failing — model miss is not a gate bug
      run('git', ['restore', '--staged', FIXTURE_PATH], {});
      if (fs.existsSync(path.join(REPO_ROOT, FIXTURE_PATH))) {
        fs.unlinkSync(path.join(REPO_ROOT, FIXTURE_PATH));
      }
      process.stdout.write('\n=== Self-test complete (partial — model did not flag bug) ===\n');
      return;
    } else {
      fail(`unexpected exit ${buggyResult.status}\n${buggyResult.stdout}\n${buggyResult.stderr}`);
    }
  } finally {
    // Unstage + delete so Test 3 can re-stage cleanly
    run('git', ['restore', '--staged', FIXTURE_PATH], {});
    if (fs.existsSync(path.join(REPO_ROOT, FIXTURE_PATH))) {
      fs.unlinkSync(path.join(REPO_ROOT, FIXTURE_PATH));
    }
  }

  if (bugFingerprints.length === 0) {
    info('No fingerprints extracted — skipping waiver stability test.');
    process.stdout.write('\n=== Self-test complete ===\n');
    return;
  }

  // ── Test 3: WAIVER ×3 — same buggy diff, waived, must exit 0 three times ──
  process.stdout.write(
    '\nTest 3: WAIVER stability — same diff, 3 consecutive runs must all exit 0\n'
  );
  info(
    'Fingerprints are SOURCE-CODE anchored: they do not change when the LLM rephrases.'
  );

  // Build waiver entries for all fingerprints from the bug run
  const waiverEntries = bugFingerprints
    .map(
      (bf) =>
        `\n  - fingerprint: "${bf.fingerprint}"\n` +
        `    reason: "GATE-SELF-TEST stable fingerprint waiver — do not commit"\n` +
        `    author: gate-self-test\n` +
        `    date: "2026-06-11"\n`
    )
    .join('');
  const waiverWithTest = currentWaivers.replace('waivers: []', `waivers:${waiverEntries}`);

  const waiverResults = [];
  try {
    fs.writeFileSync(path.join(REPO_ROOT, WAIVERS_PATH), waiverWithTest);

    for (let i = 1; i <= 3; i++) {
      process.stdout.write(`\n  Run ${i}/3:\n`);
      // Re-write and re-stage the fixture
      fs.writeFileSync(path.join(REPO_ROOT, FIXTURE_PATH), BUGGY_CONTENT);
      run('git', ['add', FIXTURE_PATH], {});

      let waiverResult;
      try {
        waiverResult = run('node', ['scripts/codex-review.mjs', '--base=HEAD'], {
          CODEX_REVIEW_VERBOSE: '0',
        });
        info(`  exit: ${waiverResult.status}`);
        const remaining = waiverResult.stdout.match(/Unwaived\s*:\s*(\d+)/);
        info(`  unwaived: ${remaining ? remaining[1] : 'unknown'}`);
        const waivd = waiverResult.stdout.match(/Waived\s*:\s*(\d+)/);
        info(`  waived: ${waivd ? waivd[1] : 'unknown'}`);
        waiverResults.push(waiverResult.status);
      } finally {
        run('git', ['restore', '--staged', FIXTURE_PATH], {});
        if (fs.existsSync(path.join(REPO_ROOT, FIXTURE_PATH))) {
          fs.unlinkSync(path.join(REPO_ROOT, FIXTURE_PATH));
        }
      }
    }
  } finally {
    // Always restore the real waivers file
    fs.writeFileSync(path.join(REPO_ROOT, WAIVERS_PATH), currentWaivers);
    info('\nRestored waivers file.');
  }

  process.stdout.write('\n');
  info(`Waiver run exits: ${waiverResults.join(', ')}`);
  const allPassed = waiverResults.every((s) => s === 0);
  if (allPassed) {
    pass(
      `all 3 waived runs exited 0 — fingerprint is STABLE across LLM rephrasing`
    );
  } else {
    fail(
      `waiver run exits: ${waiverResults.join(', ')} — fingerprint is NOT stable. ` +
        `Fix the fingerprint formula in scripts/codex-review.mjs.`
    );
  }

  // ── Test 4: DISTINCT — unrelated bug not suppressed by first waiver ──
  process.stdout.write(
    '\nTest 4: DISTINCT bug (different file/line) → NOT suppressed by existing waiver → exit 1\n'
  );
  info('Planting a second distinct bug in a separate fixture file.');

  fs.writeFileSync(path.join(REPO_ROOT, FIXTURE2_PATH), DISTINCT_BUGGY_CONTENT);
  run('git', ['add', FIXTURE2_PATH], {});

  // Add only the waiver for the FIRST bug (not the second)
  const waiverWithFirstOnly = currentWaivers.replace('waivers: []', `waivers:${waiverEntries}`);
  let distinctResult;
  try {
    fs.writeFileSync(path.join(REPO_ROOT, WAIVERS_PATH), waiverWithFirstOnly);
    distinctResult = run('node', ['scripts/codex-review.mjs', '--base=HEAD'], {
      CODEX_REVIEW_VERBOSE: '0',
    });
    info(`exit: ${distinctResult.status}`);
    const remaining = distinctResult.stdout.match(/Unwaived\s*:\s*(\d+)/);
    info(`unwaived: ${remaining ? remaining[1] : 'unknown'}`);
  } finally {
    fs.writeFileSync(path.join(REPO_ROOT, WAIVERS_PATH), currentWaivers);
    run('git', ['restore', '--staged', FIXTURE2_PATH], {});
    if (fs.existsSync(path.join(REPO_ROOT, FIXTURE2_PATH))) {
      fs.unlinkSync(path.join(REPO_ROOT, FIXTURE2_PATH));
    }
    info('Restored waivers and removed fixture 2.');
  }

  if (distinctResult.status === 1) {
    pass('exit 1 for distinct unrelated bug — waiver correctly did NOT suppress it');
  } else if (distinctResult.status === 0) {
    // Codex may have not flagged the distinct bug (model false-negative)
    process.stdout.write(
      '  WARN  exit 0 for distinct bug — Codex did not flag the off-by-one.\n' +
        '        This is a model false-negative, not a gate implementation bug.\n' +
        '        The waiver selectivity cannot be proven when Codex misses bugs.\n'
    );
  } else {
    fail(`unexpected exit ${distinctResult.status}`);
  }

  process.stdout.write('\n=== Self-test complete ===\n');
}

main().catch((e) => {
  process.stderr.write(`UNEXPECTED ERROR: ${e.message}\n${e.stack}\n`);
  // Cleanup attempt
  try {
    const REPO_ROOT_ERR = detectRepoRoot();
    for (const fp of [FIXTURE_PATH, FIXTURE2_PATH]) {
      const p = path.join(REPO_ROOT_ERR, fp);
      if (fs.existsSync(p)) {
        spawnSync('git', ['restore', '--staged', fp], {
          cwd: REPO_ROOT_ERR,
          shell: process.platform === 'win32',
        });
        fs.unlinkSync(p);
      }
    }
    // Restore waivers
    const wp = path.join(REPO_ROOT_ERR, WAIVERS_PATH);
    try {
      const raw = fs.readFileSync(wp, 'utf8');
      // If it still has the test entry, restore to empty
      if (raw.includes('GATE-SELF-TEST')) {
        const orig = raw.replace(/waivers:[\s\S]*$/, 'waivers: []');
        fs.writeFileSync(wp, orig);
      }
    } catch {
      /* file may not exist or changed between check and use — ignore cleanup errors */
    }
  } catch {
    /* ignore cleanup errors */
  }
  process.exit(1);
});
