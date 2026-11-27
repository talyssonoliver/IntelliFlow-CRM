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
import {
  collectNumstat,
  diffInputMessage,
  failureArtifact,
  isStaleReviewArtifact,
  makeCodexRunner,
  runChunkedReview,
  scopeChanges,
} from './lib/codex-chunk-review.mjs';
import { collectScopedDiff } from './lib/codex-diff.mjs';
import { classifyDiff, modelForTier, parseModelCache } from './lib/review-tier.mjs';
import { deferredMessage, makeReviewer } from './lib/review-policy.mjs';
import {
  deltaAgainst,
  loadBranch,
  maxRounds,
  nextBranchRecord,
  previousRoundOutcome,
  roundLimitMessage,
  storeBranch,
  withHunks,
} from './lib/review-rounds.mjs';
import {
  appendRecord,
  buildRecord,
  metricsPath,
  parseClaudeUsage,
  parseCodexTokens,
} from './lib/review-metrics.mjs';
import { makeReviewIo } from './lib/codex-review-cache.mjs';
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
function runClaudeReview(fullPrompt) {
  // `claude -p` reads the prompt from stdin in print/headless mode and emits a
  // single-turn result. `--output-format json` wraps it as { result: "<text>" }.
  // Lean flags and no shell tools: the reviewer reads, and never starts processes
  // (lib/review-commands.mjs).
  const r = runClaudeReviewer(fullPrompt, REPO_ROOT, spawnSync);
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

// ── state, metrics ─────────────────────────────────────────────────────
const STATE_PATH = path.join(OUT_DIR, 'round-state.json');
const METRICS_PATH = metricsPath(OUT_DIR);
const readState = () => (fs.existsSync(STATE_PATH) ? fs.readFileSync(STATE_PATH, 'utf8') : '');

function gitOut(args) {
  const r = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return r.status === 0 ? String(r.stdout).trim() : '';
}

/** The branch the rounds are kept under; a detached HEAD keeps no rounds across pushes. */
function branchKey() {
  if (process.env.CODEX_REVIEW_BRANCH) return process.env.CODEX_REVIEW_BRANCH;
  const b = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']);
  return b && b !== 'HEAD' ? b : `detached@${gitOut(['rev-parse', '--short', 'HEAD'])}`;
}

/** The model slugs the ChatGPT plan lists (codex's own cache), or null when it cannot be read. */
function planModels() {
  try {
    return parseModelCache(
      fs.readFileSync(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8')
    );
  } catch {
    return null;
  }
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

/** Added + deleted lines of a diff text, per file section. */
function countLines(text) {
  return text.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).length;
}

/** The metrics record for this run; written exactly once per run. */
function record(ctx, fields) {
  const rec = buildRecord({
    branch: ctx.branch,
    pr: process.env.CODEX_REVIEW_PR || null,
    head: ctx.head,
    baseRef,
    durationMs: Date.now() - ctx.started,
    ...fields,
  });
  appendRecord(fs, METRICS_PATH, rec);
  return rec;
}

// ── main ───────────────────────────────────────────────────────────────
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ctx = {
    started: Date.now(),
    branch: branchKey(),
    head: gitOut(['rev-parse', 'HEAD']),
  };

  // 1. Scope (a base that does not resolve FAILS the gate) and size of the change.
  const scope = scopeChanges(baseRef, spawnSync, isInScope);
  if (scope.message) stopGate(scope.message, [], []);
  const { changed: changedFiles, scoped: scopedFiles } = scope;
  process.stdout.write(`[codex-review] base ref : ${baseRef}\n`);
  process.stdout.write(`[codex-review] changed  : ${changedFiles.length} files total\n`);
  process.stdout.write(`[codex-review] in scope : ${scopedFiles.length} files\n`);

  let stats;
  let sections = [];
  try {
    stats = collectNumstat(baseRef, spawnSync);
    if (scopedFiles.length > 0) {
      sections = collectScopedDiff({
        baseRef,
        files: scopedFiles,
        repoRoot: REPO_ROOT,
        spawn: spawnSync,
      });
    }
  } catch (err) {
    stopGate(diffInputMessage(err), scopedFiles, []);
  }
  const sizing = classifyDiff(stats, sections, { scoped: scopedFiles });
  process.stdout.write(
    `[codex-review] sizing   : ${sizing.tier}${sizing.risky ? ' (risky)' : ''} - ${sizing.reason}\n`
  );

  // 2. Docs, tests, generated, comment-only: no model, and a visible record of why.
  if (sizing.tier === 'skip') return finishSkip(ctx, sizing, scopedFiles);

  // 3. The same head and the same diff was reviewed already: reuse it (no model, no round).
  const io = makeReviewIo({
    repoRoot: REPO_ROOT,
    outDir: OUT_DIR,
    baseRef,
    isInScope,
    spawn: spawnSync,
    fs,
    scope: () => scope,
    collect: () => sections,
  });
  const cache = io.lookup();
  if (cache.reuse) {
    return finish({
      ...cache.reuse,
      io,
      cache: null,
      ctx,
      meta: {
        mode: 'reuse',
        tier: sizing.tier,
        why: 'same head and same diff already reviewed',
        files: scopedFiles.length,
      },
    });
  }

  // 4. The round limit: after N failed rounds a human decides. Never an auto-waiver.
  const prev = loadBranch(readState(), ctx.branch);
  const limit = maxRounds();
  if (prev.rounds >= limit) {
    const message = roundLimitMessage({
      branch: ctx.branch,
      rounds: prev.rounds,
      limit,
      findings: prev.findings,
    });
    record(ctx, {
      mode: 'round-limit',
      round: prev.rounds,
      tier: sizing.tier,
      verdict: 'FAIL',
      findings: prev.findings,
      blocking: prev.findings.length,
      note: message.split('\n')[0],
    });
    stopGate(message, scopedFiles, prev.findings);
  }

  // 5. Only the hunks unseen since the last reviewed round.
  const delta = deltaAgainst(sections, prev);
  const mode = prev.reviewedHunks.length > 0 ? 'delta' : 'full';
  const deltaBytes = delta.review.reduce((n, sec) => n + Buffer.byteLength(sec.text), 0);
  const deltaLines = delta.review.reduce((n, sec) => n + countLines(sec.text), 0);
  const previousRound = previousRoundOutcome(prev, delta.dropped, delta.carried);
  const common = {
    round: prev.rounds + 1,
    files: delta.review.length,
    bytes: deltaBytes,
    lines: deltaLines,
    hunksTotal: delta.seenHunks + delta.newHunks,
    hunksReviewed: delta.newHunks,
    previousRound,
  };
  const carried = delta.carried.map((f) => ({ ...f, carried: true }));
  process.stdout.write(
    `[codex-review] round ${prev.rounds + 1}/${limit} (${mode}): ${delta.newHunks} new hunk(s), ` +
      `${delta.seenHunks} already reviewed, ${carried.length} finding(s) carried forward\n`
  );

  // Nothing new to look at, or only trivial new hunks: no model, the carried findings still judge.
  const deltaStats = delta.review.map((sec) => ({
    file: sec.file,
    added: sec.text.split('\n').filter((l) => /^\+(?!\+\+)/.test(l)).length,
    deleted: sec.text.split('\n').filter((l) => /^-(?!--)/.test(l)).length,
  }));
  const deltaSizing =
    delta.newHunks === 0
      ? {
          tier: 'skip',
          risky: sizing.risky,
          reason: 'every hunk was already reviewed in an earlier round',
        }
      : mode === 'delta' && !sizing.risky
        ? classifyDiff(deltaStats, delta.review, { scoped: scopedFiles })
        : sizing;
  if (deltaSizing.tier === 'skip') {
    process.stdout.write(
      `[codex-review] skipped: no model needed for this round (${deltaSizing.reason}).\n`
    );
    return finish({
      scopedFiles,
      findings: carried,
      reviewerUsed: 'none (no model needed this round)',
      chunkCount: 0,
      io,
      cache,
      ctx,
      sections,
      prev,
      modelRound: false,
      meta: {
        ...common,
        mode: delta.newHunks === 0 ? 'delta-empty' : 'skipped',
        round: 0,
        tier: 'skip',
        why: deltaSizing.reason,
        note: `skipped: ${deltaSizing.reason}`,
      },
    });
  }

  // 6. Pick the reviewer: Codex on the tier's model; Claude only for a risky diff Codex cannot review.
  const forceFallback = process.env.CODEX_REVIEW_FORCE_FALLBACK === '1';
  const codexUsable = !forceFallback && commandAvailable('codex') && codexLoggedIn();
  const claudeUsable = commandAvailable('claude');
  const available = planModels();
  const chosen = modelForTier(deltaSizing.tier, process.env, available);
  const strong = modelForTier('strong', process.env, available);
  const plan = {
    tier: deltaSizing.tier,
    risky: sizing.risky,
    model: chosen.model,
    effort: chosen.effort,
    why: `${deltaSizing.reason}; ${deltaSizing.tier} tier${chosen.note ? `; ${chosen.note}` : ''}`,
  };
  process.stdout.write(
    `[codex-review] reviewer : codex ${chosen.model ?? '(config model)'} / effort ${chosen.effort}` +
      `${sizing.risky ? '; Claude only if Codex cannot review (risky diff)' : '; no Claude for this diff'}\n`
  );

  writeSchema();
  const log = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) };
  const runCodex = makeCodexRunner({
    lastMsgPath: path.join(OUT_DIR, 'codex-last-message.txt'),
    repoRoot: REPO_ROOT,
    fs,
    runCodexReviewer,
    spawn: spawnSync,
    verbose: VERBOSE,
    log,
  });
  const reviewer = makeReviewer({
    plan,
    codexUsable,
    claudeUsable,
    runCodex: (prompt, tier) => {
      const r = runCodex(prompt, tier);
      return { ...r, tokens: parseCodexTokens(`${r.stdout}\n${r.stderr}`) };
    },
    runClaude: runClaudeReview,
    extract: extractFindings,
    log,
    sleep: sleepMs,
    models: { strong },
  });
  deltaNote =
    mode === 'delta'
      ? `\nNOTE: this is review round ${prev.rounds + 1}. Only hunks added or changed since the last ` +
        'reviewed round are shown; the rest of the PR was reviewed already. Do not repeat earlier findings.\n'
      : '';
  process.stdout.write('[codex-review] Preparing diff + review prompt ...\n');
  const result = runChunkedReview({
    baseRef,
    scopedFiles,
    repoRoot: REPO_ROOT,
    spawn: spawnSync,
    buildPrompt,
    review: reviewer,
    write: (name, text) => fs.writeFileSync(path.join(OUT_DIR, name), text, 'utf8'),
    clearStale: () =>
      fs
        .readdirSync(OUT_DIR)
        .filter(isStaleReviewArtifact)
        .forEach((name) => fs.rmSync(path.join(OUT_DIR, name))),
    log,
    sections: delta.review,
  });
  const used = summarizeRuns(result.runs ?? []);
  if (result.kind === 'deferred') {
    const d = (result.runs ?? []).find((r) => r.deferred)?.deferred ?? {
      reason: 'codex unavailable',
      resetAt: null,
    };
    const message = deferredMessage({
      reason: d.reason,
      resetAt: d.resetAt,
      risky: sizing.risky,
      claudeUsable,
    });
    record(ctx, {
      ...common,
      round: 0,
      mode: 'deferred',
      tier: plan.tier,
      reviewer: used.reviewer,
      model: plan.model,
      effort: plan.effort,
      why: plan.why,
      verdict: 'DEFERRED',
      findings: carried,
      blocking: carried.length,
      note: message.split('\n')[0],
    });
    stopGate(message, scopedFiles, carried);
  }
  if (result.kind === 'fail') {
    record(ctx, {
      ...common,
      mode,
      tier: plan.tier,
      reviewer: used.reviewer,
      model: used.model,
      effort: plan.effort,
      why: plan.why,
      tokens: used.tokens,
      costUsd: used.costUsd,
      verdict: 'FAIL',
      note: result.message,
    });
    stopGate(result.message, scopedFiles, result.findings);
  }

  process.stdout.write(`[codex-review] reviewer : ${result.reviewerUsed}\n`);
  finish({
    scopedFiles,
    findings: [...carried, ...result.findings],
    reviewerUsed: result.reviewerUsed,
    chunkCount: result.chunkCount,
    io,
    cache,
    ctx,
    sections,
    prev,
    modelRound: true,
    meta: {
      ...common,
      mode,
      tier: plan.tier,
      reviewer: used.reviewer,
      model: used.model,
      effort: used.effort ?? plan.effort,
      why: plan.why,
      tokens: used.tokens,
      costUsd: used.costUsd,
    },
  });
}

let deltaNote = '';

/** What the chunks' reviewers were, for the metrics: names, models, summed tokens and cost. */
function summarizeRuns(runs) {
  const reviewers = [...new Set(runs.map((r) => r.reviewer).filter(Boolean))];
  const models = [...new Set(runs.map((r) => r.model).filter(Boolean))];
  const total = runs.reduce((n, r) => n + (r.tokens?.total || 0), 0);
  const cost = runs.reduce((n, r) => n + (typeof r.costUsd === 'number' ? r.costUsd : 0), 0);
  return {
    reviewer: reviewers.length ? reviewers.join('+') : 'none',
    model: models.join('+') || null,
    effort: runs.find((r) => r.effort)?.effort ?? null,
    tokens: total > 0 ? { total } : null,
    costUsd: runs.some((r) => typeof r.costUsd === 'number') ? cost : null,
  };
}

/** A diff that needs no model: printed, written to findings.json and the metrics, exit 0. */
function finishSkip(ctx, sizing, scopedFiles) {
  const reason = sizing.reason;
  const line = `[codex-review] skipped: ${reason}. No model was called; this is a recorded skip, not a review.\n`;
  process.stdout.write(line);
  fs.writeFileSync(
    FINDINGS_PATH,
    JSON.stringify(
      {
        findings: [],
        scoped_files: scopedFiles,
        base_ref: baseRef,
        verdict: 'SKIPPED',
        skipped_reason: reason,
      },
      null,
      2
    )
  );
  fs.writeFileSync(SUMMARY_PATH, `skipped: ${reason}\nNo model was called.\n`);
  record(ctx, {
    mode: 'skipped',
    round: 0,
    tier: 'skip',
    files: sizing.files,
    lines: sizing.lines,
    why: reason,
    verdict: 'SKIPPED',
    note: `skipped: ${reason}`,
  });
  process.exit(0);
}

/** Writes the failure artifacts and exits 1. Never a PASS. */
function stopGate(message, scopedFiles, findings) {
  const artifact = failureArtifact({ baseRef, scopedFiles, findings, message });
  fs.writeFileSync(FINDINGS_PATH, JSON.stringify(artifact, null, 2));
  fs.writeFileSync(SUMMARY_PATH, `${message}\n`);
  process.stdout.write(`${message}\n`);
  process.exit(1);
}

function buildPrompt(files, part, diffText) {
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

/** Fingerprints, waivers, artifacts, round state, metrics and the exit code for a reviewed diff. */
function finish({
  scopedFiles,
  findings: rawFindings,
  reviewerUsed,
  chunkCount,
  io,
  cache,
  ctx,
  meta,
  sections = null,
  prev = null,
  modelRound = false,
}) {
  // 8. Stamp fingerprints (Codex computes them too, but we recompute for
  //    consistency — our normalisation is the contract, not the model's).
  //    The fingerprint is anchored to the SOURCE CODE at the flagged line(s), so it stays
  //    stable across rephrasing. A finding carried from an earlier round keeps the fingerprint it
  //    was stamped with: its line number may have moved, its code has not.
  const waivers = loadWaivers();
  const findings = rawFindings.map((f) => {
    const fp =
      f.carried && f.fingerprint ? f.fingerprint : fingerprint(f.file, f.line, f.issue, REPO_ROOT);
    return { ...f, fingerprint: fp };
  });

  const { summary, blocking, lowLine } = io.complete({
    rawFindings,
    findings,
    waivers,
    cache,
    scopedFiles,
    reviewerUsed,
    chunkCount,
    waivedLines: waivedFindingLines,
  });
  process.stdout.write(`${summary}\n${lowLine ?? ''}`);

  const pass = blocking.length === 0;
  if (sections && prev) {
    const carried = findings.filter((f) => f.carried);
    const fresh = withHunks(
      findings.filter((f) => !f.carried),
      sections
    );
    const next = nextBranchRecord({
      prev,
      head: ctx.head,
      sections,
      findings: [...carried, ...fresh],
      modelRound,
      pass,
    });
    fs.writeFileSync(STATE_PATH, storeBranch(readState(), ctx.branch, next));
  }
  record(ctx, {
    reviewer: 'none',
    ...meta,
    findings,
    blocking: blocking.length,
    verdict: pass ? 'PASS' : 'FAIL',
    note: meta.note ?? '',
  });

  if (pass) {
    process.stdout.write('[codex-review] Gate PASS — no unwaived blocking findings.\n');
    process.exit(0);
  }

  process.stderr.write(
    `[codex-review] Gate FAIL — ${blocking.length} unwaived blocking finding(s).\n` +
      `  To suppress a false-positive, add its fingerprint to tools/audit/codex-review-waivers.yaml\n` +
      `  (check with: node scripts/codex-review.mjs --check-waivers)\n` +
      `  with a non-empty reason, author, and date.\n`
  );
  process.exit(1);
}

if (CHECK_WAIVERS_ONLY) {
  runWaiverCheck();
} else {
  main();
}
