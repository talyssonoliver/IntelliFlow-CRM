#!/usr/bin/env node
/**
 * Codex Semantic Review Gate
 * ─────────────────────────────────────────────────────────────────────
 * Drives an INDEPENDENT Codex code-review of the diff between HEAD and
 * a base ref (default: origin/main), scoped to the sonar.sources paths
 * defined in sonar-project.properties.
 *
 * Prompt to Codex: flag ONLY real correctness / security / data-integrity
 * / logic / edge-case bugs and hallucinated API/contract assumptions that
 * produce silent data corruption or wrong behaviour.  IGNORE style, naming,
 * formatting, and anything already covered by TypeScript / ESLint / Sonar.
 *
 * Structured JSON output: { findings: [...] } (schema below).
 *
 * Diff input (lib/codex-diff.mjs): git runs without a shell and file paths go in batches, so a
 * large PR no longer overflows cmd.exe's 8191-character limit (#1272 had 192 files and was
 * reviewed against an empty diff). An empty, partial or unsplittable diff FAILS the gate, and a
 * diff over the prompt cap is reviewed in chunks, every chunk in full; one unreviewed chunk FAILS.
 *
 * Sized to the diff (lib/review-tier.mjs, owner ruling 2026-11-26):
 *   - docs / tests / generated / comment-only diffs: NO model. Recorded as "skipped: <reason>".
 *   - small diffs: Codex on a light model and effort; large or risky ones: the strong Codex.
 *     Models are passed as flags per run; ~/.codex/config.toml is never edited.
 *
 * Reviewer selection (lib/review-policy.mjs):
 *   - Codex (OAuth) reviews. Claude (`claude -p`, lean flags) reviews ONLY when Codex is
 *     capped/failed/unavailable AND the diff is risky.
 *   - Otherwise the gate waits for Codex's reset when it is near (CODEX_REVIEW_MAX_WAIT_MIN) and
 *     retries once, or FAILS with "REVIEW_DEFERRED: codex unavailable". Never a silent pass.
 *
 * Rounds (lib/review-rounds.mjs): a new push re-reviews only hunks unseen since the last round
 * (state in artifacts/codex-review/round-state.json, keyed by branch); after CODEX_REVIEW_MAX_ROUNDS
 * (default 4) failed rounds the gate stops with a human route and never waives.
 * Metrics: one JSON line per run in artifacts/codex-review/metrics.jsonl
 * (summary: node scripts/codex-review-metrics.mjs).
 *
 * Policy and reuse (lib/codex-review-cache.mjs): an unwaived critical/high/medium
 * finding blocks; an unwaived LOW goes to the branch's follow-up issue; a review of
 * the same head + diff is reused, never repeated.
 *   This gate runs LOCAL-ONLY (codex OAuth / Claude CLI session); there is NO CI
 *   enforcement and NO API key is required.
 *
 * Waiver file: tools/audit/codex-review-waivers.yaml
 *
 * Artifacts:
 *   artifacts/codex-review/findings.json   — raw Codex JSON
 *   artifacts/codex-review/summary.txt     — human-readable summary
 *
 * Usage:
 *   node scripts/codex-review.mjs                   # diff vs origin/main
 *   node scripts/codex-review.mjs --base=main       # explicit base ref
 *   node scripts/codex-review.mjs --base=HEAD~3     # last 3 commits
 *
 * Env:
 *   CODEX_REVIEW_VERBOSE=1         — print full reviewer stdout to stderr
 *   CODEX_REVIEW_FORCE_FALLBACK=1  — treat codex as unavailable (the policy above then decides)
 *   CODEX_REVIEW_ALLOW_CLAUDE=1    — owner/orchestrator: let Claude review a non-risky diff too
 *   CODEX_REVIEW_MAX_WAIT_MIN=20   — longest wait for Codex's reset before deferring
 *   CODEX_REVIEW_MAX_ROUNDS=4      — failed model rounds per branch before the human route
 *   CODEX_REVIEW_{LIGHT,STRONG}_{MODEL,EFFORT} — override the tier models
 *   CODEX_REVIEW_PR=<n>            — PR number written to the metrics
 *
 * Auth:
 *   Codex uses its local OAuth session (`codex login`; confirm `codex login
 *   status`). The Claude fallback uses the local Claude Code CLI session.
 *   Neither requires an API key.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { claudeReviewText, runClaudeReviewer, runCodexReviewer } from './lib/review-commands.mjs';
import { createGate } from './lib/codex-review-run.mjs';
import { parseClaudeUsage } from './lib/review-metrics.mjs';
import {
  activeWaivers,
  checkWaivers,
  fingerprint,
  readTrackedFiles,
  waivedFindingLines,
} from './lib/codex-fingerprint.mjs';

// ── repo root ──────────────────────────────────────────────────────────
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

// ── paths ──────────────────────────────────────────────────────────────
const WAIVERS_PATH = path.join(REPO_ROOT, 'tools/audit/codex-review-waivers.yaml');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/codex-review');
const FINDINGS_PATH = path.join(OUT_DIR, 'findings.json');
const SUMMARY_PATH = path.join(OUT_DIR, 'summary.txt');

// ── parse args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let baseRef = 'origin/main';
for (const a of args) {
  if (a.startsWith('--base=')) baseRef = a.slice('--base='.length);
}
const CHECK_WAIVERS_ONLY = args.includes('--check-waivers');
const VERBOSE = process.env.CODEX_REVIEW_VERBOSE === '1';

// ── helpers ────────────────────────────────────────────────────────────
function commandAvailable(bin) {
  const r = spawnSync(bin, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return !r.error && r.status === 0;
}

/**
 * Check whether the local codex CLI is authenticated via OAuth.
 * `codex login status` prints "Logged in using ChatGPT" on success and exits 0.
 * The message goes to stderr in codex 0.133.x.
 * Any non-zero exit or absence of "logged in" means not authenticated.
 */
function codexLoggedIn() {
  const r = spawnSync('codex', ['login', 'status'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 10_000,
  });
  if (r.error || r.status !== 0) return false;
  // The CLI writes "Logged in using ChatGPT" to stderr (not stdout).
  // Check both streams for forward-compatibility.
  const combined = ((r.stdout || '') + (r.stderr || '')).toLowerCase();
  return combined.includes('logged in');
}

/**
 * Whether the local Claude Code CLI is available as a FALLBACK reviewer.
 * Used when codex is missing/unauthed or hits its usage/tier cap. Like codex,
 * this is a LOCAL-ONLY gate that relies on the developer's authenticated CLI
 * session (no API key); CI never runs this step.
 */
function claudeAvailable() {
  return commandAvailable('claude');
}

/**
 * Run the SAME review prompt through the Claude Code CLI headlessly and return
 * the raw model text (the `result` field of `--output-format json`). Acting as
 * codex would: the caller applies the identical extractFindings + fingerprint +
 * waiver + exit logic, so a Claude pass blocks/passes exactly like a codex pass.
 * Returns '' on failure (the caller then degrades to SKIPPED_PRECONDITION).
 */
function runClaudeReview(fullPrompt, { model } = {}) {
  // `claude -p` reads the prompt from stdin in print/headless mode and emits a
  // single-turn result. `--output-format json` wraps it as { result: "<text>" }.
  // Lean flags and no shell tools: the reviewer reads, and never starts processes
  // (lib/review-commands.mjs).
  const r = runClaudeReviewer(fullPrompt, REPO_ROOT, spawnSync, { model });
  if (VERBOSE) {
    process.stderr.write('--- claude stdout ---\n' + (r.stdout || '') + '\n');
    process.stderr.write('--- claude stderr ---\n' + (r.stderr || '') + '\n');
  }
  return { text: claudeReviewText(r), ...parseClaudeUsage(r.stdout || '') };
}

// sonar.sources paths from sonar-project.properties
// Handles both inline-list and line-continuation formats:
//   sonar.sources=apps/a/src,apps/b/src
//   sonar.sources=\
//     apps/a/src,\
//     apps/b/src
function parseSonarSources() {
  const prop = path.join(REPO_ROOT, 'sonar-project.properties');
  if (!fs.existsSync(prop)) return null;
  const raw = fs.readFileSync(prop, 'utf8');

  // Line-by-line parser: collect lines belonging to the sonar.sources value.
  // Java .properties line-continuation: a line ending in `\` (possibly with
  // trailing whitespace) continues on the next line.
  const lines = raw.split('\n');
  let collecting = false;
  const valueParts = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!collecting) {
      const m = trimmed.match(/^sonar\.sources\s*=\s*(.*)/);
      if (!m) continue;
      collecting = true;
      const part = m[1].replace(/\\$/, '').trim(); // strip trailing backslash (line continuation)
      if (part) valueParts.push(part);
      if (!trimmed.endsWith('\\')) collecting = false; // single-line value
      continue;
    }
    // Continuation line: must be indented or start with a value character
    const part = trimmed.replace(/\\$/, '').trim(); // strip trailing backslash (line continuation)
    if (part) valueParts.push(part);
    if (!trimmed.endsWith('\\')) {
      collecting = false; // last continuation line
    }
  }

  if (valueParts.length === 0) return null;

  // Each part may contain comma-separated entries
  return valueParts
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const SONAR_SOURCES = parseSonarSources() || [
  'apps/api/src',
  'apps/ai-worker/src',
  'apps/web/src',
  'apps/project-tracker/app',
  'apps/project-tracker/components',
  'apps/project-tracker/lib',
  'packages/adapters/src',
  'packages/api-client/src',
  'packages/application/src',
  'packages/db/src',
  'packages/domain/src',
  'packages/observability/src',
  'packages/platform/src',
  'packages/ui/src',
  'packages/validators/src',
];

// Keep tests IN scope (buggy tests are the problem this gate targets)
const EXCLUDE_PATTERNS = [
  /^docs\//,
  /\.(lock|snap)$/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /^\.next\//,
  /^dist\//,
  /\/dist\//,
  /\/node_modules\//,
  /\/migrations\//,
  /\/coverage\//,
  /^artifacts\//,
  /^infra\//,
  /\.config\.(js|ts|cjs|mjs)$/,
  /^scripts\//,
  /^tools\//,
];

function isInScope(file) {
  if (EXCLUDE_PATTERNS.some((p) => p.test(file))) return false;
  return SONAR_SOURCES.some((src) => file.startsWith(src + '/') || file.startsWith(src));
}

// ── waiver loading ─────────────────────────────────────────────────────────
const readWaiverFile = () =>
  fs.existsSync(WAIVERS_PATH) ? fs.readFileSync(WAIVERS_PATH, 'utf8') : '';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The waivers in force, by fingerprint. Expired ones warn and are left out. */
const loadWaivers = () =>
  activeWaivers(readWaiverFile(), todayIso(), (message) => process.stderr.write(message));

/** Fails on a waiver anchored on a trivial or repeated line. No reviewer is called. */
function runWaiverCheck() {
  const { ok, lines } = checkWaivers(readWaiverFile(), readTrackedFiles(REPO_ROOT), todayIso());
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(ok ? 0 : 1);
}

// ── extract JSON from Codex output ─────────────────────────────────────
function extractFindings(raw) {
  // Codex may emit markdown fences around the JSON.
  // Use string operations instead of backtracking-vulnerable regexes.
  let candidate = raw;
  const fenceStart = raw.indexOf('```');
  if (fenceStart !== -1) {
    // Skip past the opening fence line (e.g. "```json\n")
    const afterFence = raw.indexOf('\n', fenceStart);
    const fenceEnd = afterFence !== -1 ? raw.indexOf('```', afterFence + 1) : -1;
    if (afterFence !== -1 && fenceEnd !== -1) {
      candidate = raw.slice(afterFence + 1, fenceEnd);
    }
  }
  // Find outermost JSON object by locating first '{' and last '}'
  const objStart = candidate.indexOf('{');
  const objEnd = candidate.lastIndexOf('}');
  if (objStart === -1 || objEnd <= objStart) return null;
  try {
    const parsed = JSON.parse(candidate.slice(objStart, objEnd + 1).trim());
    if (parsed && Array.isArray(parsed.findings)) return parsed;
    return null;
  } catch {
    return null;
  }
}

// ── output schema prompt ────────────────────────────────────────────────
// NOTE: fingerprint is NOT required from Codex — the gate recomputes it
// from the actual source code at the flagged line(s) to ensure stability
// across LLM rephrasing (model non-determinism).
const SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'line', 'rule', 'issue', 'evidence', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: ['integer', 'string'] },
          rule: { type: 'string' },
          issue: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
};

// Write schema to a temp file for --output-schema
function writeSchema() {
  const dir = path.join(REPO_ROOT, 'artifacts/codex-review');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'review-schema.json');
  fs.writeFileSync(p, JSON.stringify(SCHEMA, null, 2));
  return p;
}

function buildPrompt(files, part, diffText, deltaNote = '') {
  const fileList = files.map((f) => `  - ${f}`).join('\n');
  const prompt = `You are an independent code auditor. Your task is to find REAL bugs in the diff below.

Scope: only the following files changed in this PR (diff vs ${baseRef})${part}:
${fileList}
${deltaNote}
Your job:
- Flag ONLY real defects with concrete evidence: correctness bugs, security vulnerabilities,
  data-integrity issues, logic/edge-case bugs, hallucinated API/contract assumptions, and
  silent data corruption.
- IGNORE: style, naming, formatting, missing comments, complexity, anything already covered
  by TypeScript types, ESLint, or SonarQube.
- Do NOT speculate. Every finding must have evidence pointing to specific code.
- A finding is a bug the AUTHOR'S OWN TESTS would not catch because the tests encode the
  same wrong assumption (e.g. mapping "1M-10M" revenue band to 100 cents — the test
  asserts 100, the code returns 100, both are wrong vs the real domain model).
- For the "line" field: report the EXACT line number (or "N-M" range) where the buggy
  code appears. Be precise — the gate computes a stable fingerprint from the source text
  at that line, so an imprecise line number may prevent waiver matching.

Respond ONLY with a JSON object — no prose, no markdown fences — matching this schema:
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "file": "<relative path>",
      "line": <exact line number (integer) or "N-M" range string>,
      "rule": "<short rule name, e.g. wrong-unit-mapping>",
      "issue": "<one sentence: what is wrong>",
      "evidence": "<quote the relevant code and explain why it is wrong>",
      "fix": "<concrete fix suggestion>",
      "fingerprint": "OMIT — the gate recomputes this from source; leave as empty string or omit"
    }
  ]
}

If no real bugs are found, return { "findings": [] }.`;

  // Codex runs as `codex exec -` with this prompt on stdin (codex 0.133.x: `codex exec review
  // --base <ref>` and a prompt are mutually exclusive), so the diff is embedded in the prompt.
  return `${prompt}

Here is the actual diff to review:

\`\`\`diff
${diffText}
\`\`\`
`;
}

/** Everything the run needs from the outside world: git, the CLIs, files, the clock. */
function runGate() {
  const gate = createGate({
    baseRef,
    repoRoot: REPO_ROOT,
    outDir: OUT_DIR,
    env: process.env,
    spawn: spawnSync,
    fs,
    homedir: os.homedir,
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    isInScope,
    commandAvailable,
    codexLoggedIn,
    runCodexReviewer,
    runClaude: runClaudeReview,
    extract: extractFindings,
    buildPrompt: (note) => (files, part, diffText) => buildPrompt(files, part, diffText, note),
    writeSchema,
    verbose: VERBOSE,
    loadWaivers,
    fingerprintOf: (f) => fingerprint(f.file, f.line, f.issue, REPO_ROOT),
    waivedLines: waivedFindingLines,
    sleep: sleepMs,
  });
  process.exit(gate.run());
}

/** Blocks the thread for ms (the gate is synchronous); used to wait for Codex's reset. */
function sleepMs(ms) {
  const cell = new Int32Array(new SharedArrayBuffer(4));
  let left = ms;
  while (left > 0) {
    const step = Math.min(left, 30_000);
    Atomics.wait(cell, 0, 0, step);
    left -= step;
  }
}

if (CHECK_WAIVERS_ONLY) {
  runWaiverCheck();
} else {
  runGate();
}
