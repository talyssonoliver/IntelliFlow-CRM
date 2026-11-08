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
 * Reviewer selection (primary → fallback):
 *   - Codex (OAuth) is the PRIMARY reviewer.
 *   - When codex is absent/unauthed OR returns no parseable findings (e.g. the
 *     OpenAI usage/tier cap returns an error instead of JSON), the gate FALLS
 *     BACK to the Claude Code CLI (`claude -p`) on the SAME prompt/schema, so a
 *     fallback review blocks/passes exactly as codex would. It never silently
 *     passes while a reviewer is available.
 *   - SKIPPED_PRECONDITION (exit 0) only when NEITHER codex nor claude is usable.
 *
 * Policy:
 *   - Any finding whose fingerprint is NOT in the waiver list → exit 1 (BLOCK)
 *   - Zero unwaived findings → exit 0
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
 *   CODEX_REVIEW_FORCE_FALLBACK=1  — skip codex, use the Claude fallback directly
 *                                    (handy during a codex usage/tier outage)
 *
 * Auth:
 *   Codex uses its local OAuth session (`codex login`; confirm `codex login
 *   status`). The Claude fallback uses the local Claude Code CLI session.
 *   Neither requires an API key.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { claudeReviewText, runClaudeReviewer, runCodexReviewer } from './lib/review-commands.mjs';
import { chunkSections, collectScopedDiff, DiffInputError } from './lib/codex-diff.mjs';
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
  // No shell tools: the reviewer reads, and never starts processes (lib/review-commands.mjs).
  const r = runClaudeReviewer(fullPrompt, REPO_ROOT, spawnSync);
  if (VERBOSE) {
    process.stderr.write('--- claude stdout ---\n' + (r.stdout || '') + '\n');
    process.stderr.write('--- claude stderr ---\n' + (r.stderr || '') + '\n');
  }
  return claudeReviewText(r);
}

function gitDiffFiles(base) {
  // Primary: files changed between base and HEAD (committed diff). A base that does not
  // resolve must stop the gate: an empty list here would read as "nothing to review" and PASS.
  const r = spawnSync(
    'git',
    ['-c', 'core.quotePath=false', 'diff', '--name-only', `${base}...HEAD`],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );
  if (r.error || r.status !== 0) {
    const reason = r.error ? r.error.message : (r.stderr || '').trim() || `exit ${r.status}`;
    throw new DiffInputError('base-unresolved', `cannot list changes against ${base}: ${reason}`);
  }
  const committed = r.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  // When base resolves to HEAD (e.g. --base=HEAD for self-test/local staging),
  // also include staged (cached) files so the gate catches staged-but-not-yet-
  // committed changes.  This is important for the validate-codex-gate self-test
  // and for developers who run the gate before committing.
  const stagedFiles = [];
  const staged = spawnSync(
    'git',
    ['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );
  if (staged.status === 0) {
    stagedFiles.push(
      ...staged.stdout
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean)
    );
  }

  // Merge: staged files are included when there are no committed diff files
  // (i.e. base===HEAD) OR always (union both sets, which is safe: duplicate
  // paths are deduplicated by the Set below).
  const merged = new Set([...committed, ...stagedFiles]);
  return [...merged];
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

// ── main ───────────────────────────────────────────────────────────────
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1+2. Pick a semantic reviewer. Codex (OAuth) is primary; Claude Code is the
  //      FALLBACK when codex is absent/unauthed OR hits its usage/tier cap. The
  //      step degrades to SKIPPED_PRECONDITION only when NEITHER is usable — it
  //      must never silently pass while a reviewer is available.
  // CODEX_REVIEW_FORCE_FALLBACK=1 forces the Claude path (skip codex) — useful
  // during a codex usage/tier outage and for testing the fallback.
  const forceFallback = process.env.CODEX_REVIEW_FORCE_FALLBACK === '1';
  const codexUsable = !forceFallback && commandAvailable('codex') && codexLoggedIn();
  const claudeUsable = claudeAvailable();
  if (!codexUsable && !claudeUsable) {
    process.stdout.write(
      'SKIPPED_PRECONDITION: no semantic reviewer available.\n' +
        '  Install + authenticate codex (`npm i -g @openai/codex` then `codex login`),\n' +
        '  or have the Claude Code CLI (`claude`) available as a fallback.\n'
    );
    process.exit(0);
  }
  if (!codexUsable) {
    process.stdout.write(
      '[codex-review] codex unavailable/unauthed — using Claude fallback reviewer.\n'
    );
  }

  // 3. Collect changed files in sonar scope
  let changedFiles;
  try {
    changedFiles = gitDiffFiles(baseRef);
  } catch (err) {
    failDiffInput(err, []);
  }
  const scopedFiles = changedFiles.filter(isInScope);

  process.stdout.write(`[codex-review] base ref : ${baseRef}\n`);
  process.stdout.write(`[codex-review] changed  : ${changedFiles.length} files total\n`);
  process.stdout.write(`[codex-review] in scope : ${scopedFiles.length} files\n`);

  if (scopedFiles.length === 0) {
    process.stdout.write(
      '[codex-review] No source files changed — gate PASS (nothing to review).\n'
    );
    const result = { findings: [], scoped_files: [], base_ref: baseRef, verdict: 'PASS' };
    fs.writeFileSync(FINDINGS_PATH, JSON.stringify(result, null, 2));
    fs.writeFileSync(SUMMARY_PATH, 'No source files changed. Gate PASS.\n');
    process.exit(0);
  }

  // 4. Write schema file
  writeSchema();

  // 5. Collect the whole diff of the scoped files and split it into chunks that each fit one
  //    prompt. An empty, partial or unsplittable diff stops the gate here (lib/codex-diff.mjs):
  //    a review of nothing must never read as a PASS.
  process.stdout.write('[codex-review] Preparing diff + review prompt ...\n');
  let chunks;
  try {
    chunks = chunkSections(
      collectScopedDiff({ baseRef, files: scopedFiles, repoRoot: REPO_ROOT, spawn: spawnSync })
    );
  } catch (err) {
    failDiffInput(err, scopedFiles);
  }
  const diffChars = chunks.reduce((n, c) => n + c.text.length, 0);
  process.stdout.write(
    `[codex-review] diff     : ${diffChars} characters in ${chunks.length} chunk(s)\n`
  );

  // 6/7. Review every chunk. Codex first (primary), Claude as FALLBACK when codex is unusable
  //      OR returns no parseable findings (the OpenAI usage/tier cap returns an error, not
  //      JSON). Same prompt/schema/waivers either way.
  for (const stale of fs.readdirSync(OUT_DIR)) {
    if (/^codex-(prompt|raw)(-\d+)?\.txt$/.test(stale)) fs.rmSync(path.join(OUT_DIR, stale));
  }
  const allFindings = [];
  const reviewers = new Set();
  const unreviewed = [];
  chunks.forEach((chunk, i) => {
    const suffix = chunks.length === 1 ? '' : `-${i + 1}`;
    const part = chunks.length === 1 ? '' : ` (part ${i + 1} of ${chunks.length})`;
    if (chunks.length > 1) {
      process.stdout.write(
        `[codex-review] chunk ${i + 1}/${chunks.length}: ${chunk.files.length} file(s), ` +
          `${chunk.text.length} characters\n`
      );
    }
    const fullPrompt = buildPrompt(chunk.files, part, chunk.text);
    fs.writeFileSync(path.join(OUT_DIR, `codex-prompt${suffix}.txt`), fullPrompt, 'utf8');
    const { parsed, reviewer, raw } = reviewChunk(fullPrompt, { codexUsable, claudeUsable });
    fs.writeFileSync(path.join(OUT_DIR, `codex-raw${suffix}.txt`), raw);
    if (parsed) {
      reviewers.add(reviewer);
      allFindings.push(...parsed.findings);
    } else {
      unreviewed.push(i + 1);
    }
  });

  if (unreviewed.length === chunks.length) {
    // Neither reviewer produced parseable output. This is the ONLY non-enforcing
    // path (local OAuth gate; CI never runs codex/claude). Degrade, don't block.
    process.stdout.write(
      'SKIPPED_PRECONDITION: no semantic reviewer produced parseable output ' +
        '(codex unavailable/capped AND claude unavailable/failed). ' +
        'Review artifacts/codex-review/codex-raw*.txt.\n'
    );
    process.exit(0);
  }
  if (unreviewed.length > 0) {
    // Part of the diff was reviewed and part was not: that is not a clean pass.
    const message =
      `INCOMPLETE_REVIEW: chunk(s) ${unreviewed.join(', ')} of ${chunks.length} got no ` +
      'parseable review; the rest of the diff is unreviewed. Gate FAIL.';
    fs.writeFileSync(
      FINDINGS_PATH,
      JSON.stringify(
        {
          base_ref: baseRef,
          scoped_files: scopedFiles,
          findings: allFindings,
          verdict: 'FAIL',
          error: message,
        },
        null,
        2
      )
    );
    fs.writeFileSync(SUMMARY_PATH, `${message}\n`);
    process.stderr.write(`[codex-review] ${message}\n`);
    process.exit(1);
  }

  const reviewerUsed = [...reviewers].join('+');
  process.stdout.write(`[codex-review] reviewer : ${reviewerUsed}\n`);
  finish({ scopedFiles, findings: allFindings, reviewerUsed, chunkCount: chunks.length });
}

/** Stops the gate on a diff that cannot be reviewed whole. Never a PASS. */
function failDiffInput(err, scopedFiles) {
  if (!(err instanceof DiffInputError)) throw err;
  const message = `DIFF_INPUT_ERROR (${err.code}): ${err.message}. Gate FAIL — nothing was reviewed.`;
  fs.writeFileSync(
    FINDINGS_PATH,
    JSON.stringify(
      {
        base_ref: baseRef,
        scoped_files: scopedFiles,
        findings: [],
        verdict: 'FAIL',
        error: message,
      },
      null,
      2
    )
  );
  fs.writeFileSync(SUMMARY_PATH, `${message}\n`);
  process.stdout.write(`${message}\n`);
  process.stderr.write(`[codex-review] ${message}\n`);
  process.exit(1);
}

/** Runs one prompt through codex, then the Claude fallback when codex gave nothing parseable. */
function reviewChunk(fullPrompt, { codexUsable, claudeUsable }) {
  const lastMsgPath = path.join(OUT_DIR, 'codex-last-message.txt');
  let raw = '';
  if (codexUsable) {
    process.stdout.write('[codex-review] Running Codex review (headless, OAuth) ...\n');
    // A previous run's last message must never be read as this run's verdict: when codex
    // exits without writing one (quota cap, crash), the stale file would replay old findings.
    fs.rmSync(lastMsgPath, { force: true });
    // Read-only sandbox, whatever ~/.codex/config.toml says (lib/review-commands.mjs).
    const r = runCodexReviewer(fullPrompt, lastMsgPath, REPO_ROOT, spawnSync);
    if (VERBOSE) {
      process.stderr.write('--- codex stdout ---\n' + (r.stdout || '') + '\n');
      process.stderr.write('--- codex stderr ---\n' + (r.stderr || '') + '\n');
    }
    raw =
      (fs.existsSync(lastMsgPath) && fs.readFileSync(lastMsgPath, 'utf8')) ||
      r.stdout ||
      r.stderr ||
      '';
    const parsed = extractFindings(raw);
    if (parsed) return { parsed, reviewer: 'codex', raw };
    process.stderr.write(
      `[codex-review] WARN: Codex produced no parseable findings (exit ${r.status ?? -1}) — ` +
        `likely the OpenAI usage/tier cap or a transient error.\n`
    );
    if (r.stderr) process.stderr.write(r.stderr.slice(0, 1000) + '\n');
  }
  // FALLBACK: Claude review (acts as codex would — identical prompt/schema/waivers).
  if (claudeUsable) {
    process.stdout.write('[codex-review] Falling back to Claude review (claude -p, local) ...\n');
    raw = runClaudeReview(fullPrompt);
    const parsed = extractFindings(raw);
    if (parsed) return { parsed, reviewer: 'claude', raw };
  }
  return { parsed: null, reviewer: null, raw };
}

function buildPrompt(files, part, diffText) {
  const fileList = files.map((f) => `  - ${f}`).join('\n');
  const prompt = `You are an independent code auditor. Your task is to find REAL bugs in the diff below.

Scope: only the following files changed in this PR (diff vs ${baseRef})${part}:
${fileList}

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

/** Fingerprints, waivers, artifacts and the exit code for a fully reviewed diff. */
function finish({ scopedFiles, findings: rawFindings, reviewerUsed, chunkCount }) {
  // 8. Stamp fingerprints (Codex computes them too, but we recompute for
  //    consistency — our normalisation is the contract, not the model's).
  //    The fingerprint is now anchored to the SOURCE CODE at the flagged
  //    line(s), not the LLM's prose, so it stays stable across rephrasing.
  const waivers = loadWaivers();
  const findings = rawFindings.map((f) => {
    const fp = fingerprint(f.file, f.line, f.issue, REPO_ROOT);
    return { ...f, fingerprint: fp };
  });

  const unwaived = findings.filter((f) => !waivers.has(f.fingerprint));
  const waived = findings.filter((f) => waivers.has(f.fingerprint));

  // 9. Write artifacts
  const artifactData = {
    base_ref: baseRef,
    scoped_files: scopedFiles,
    diff_chunks: chunkCount,
    findings,
    waived_count: waived.length,
    unwaived_count: unwaived.length,
    verdict: unwaived.length === 0 ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(FINDINGS_PATH, JSON.stringify(artifactData, null, 2));

  const lines = [];
  lines.push(`Semantic Review (${reviewerUsed}) — ${new Date().toISOString()}`);
  lines.push(`Base ref  : ${baseRef}`);
  lines.push(`Files in scope : ${scopedFiles.length}`);
  lines.push(`Diff chunks    : ${chunkCount} (each reviewed in full)`);
  lines.push(`Total findings : ${findings.length}`);
  lines.push(`  Waived       : ${waived.length}`);
  lines.push(`  Unwaived     : ${unwaived.length}`);
  lines.push('');

  if (unwaived.length > 0) {
    lines.push('UNWAIVED FINDINGS (BLOCKING):');
    for (const f of unwaived) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.file}:${f.line} — ${f.rule}`);
      lines.push(`    Issue    : ${f.issue}`);
      lines.push(`    Evidence : ${f.evidence}`);
      lines.push(`    Fix      : ${f.fix}`);
      lines.push(`    Fingerprint: ${f.fingerprint}`);
      lines.push('');
    }
  }
  if (waived.length > 0) {
    lines.push('WAIVED FINDINGS (suppressed):');
    for (const f of waived) {
      lines.push(...waivedFindingLines(f, waivers.get(f.fingerprint)));
    }
    lines.push('');
  }
  lines.push(`Verdict: ${artifactData.verdict}`);
  const summary = lines.join('\n');
  fs.writeFileSync(SUMMARY_PATH, summary);

  process.stdout.write(summary + '\n');

  if (unwaived.length === 0) {
    process.stdout.write('[codex-review] Gate PASS — no unwaived findings.\n');
    process.exit(0);
  }

  process.stderr.write(
    `[codex-review] Gate FAIL — ${unwaived.length} unwaived finding(s).\n` +
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
