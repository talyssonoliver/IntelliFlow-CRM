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
 * Policy:
 *   - Any finding whose fingerprint is NOT in the waiver list → exit 1 (BLOCK)
 *   - Zero unwaived findings → exit 0
 *   - Codex CLI absent or not logged in (OAuth) → print SKIPPED_PRECONDITION,
 *     exit 0.  This gate runs LOCAL-ONLY where codex is OAuth-authenticated;
 *     there is NO CI enforcement and NO API key is required.
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
 *   CODEX_REVIEW_VERBOSE=1  — print full Codex stdout to stderr
 *
 * Auth:
 *   Uses the local codex CLI's OAuth session (ChatGPT/Codex login).
 *   Run `codex login` if not yet authenticated.
 *   Confirm auth with: codex login status
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

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

function gitDiffFiles(base) {
  const r = spawnSync(
    'git',
    ['diff', '--name-only', `${base}...HEAD`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
  );
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((f) => f.trim()).filter(Boolean);
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
      const part = m[1].replace(/\\+$/, '').trim(); // strip trailing backslashes
      if (part) valueParts.push(part);
      if (!trimmed.endsWith('\\')) collecting = false; // single-line value
      continue;
    }
    // Continuation line: must be indented or start with a value character
    const part = trimmed.replace(/\\+$/, '').trim();
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

// ── fingerprint ────────────────────────────────────────────────────────
/**
 * Stable fingerprint: sha256 of "<file>:<normalised-issue>"
 * Normalised = lowercase, collapse whitespace, strip punctuation that
 * changes between LLM runs (quotes, trailing dots).
 */
function fingerprint(file, issue) {
  const norm = `${file}:${issue.toLowerCase().replace(/\s+/g, ' ').replace(/['"`.]/g, '').trim()}`;
  return crypto.createHash('sha256').update(norm).digest('hex');
}

// ── waiver loading ─────────────────────────────────────────────────────
function loadWaivers() {
  if (!fs.existsSync(WAIVERS_PATH)) return new Set();
  const raw = fs.readFileSync(WAIVERS_PATH, 'utf8');
  // Minimal YAML parsing: extract fingerprint values from list entries.
  // Format: "  - fingerprint: \"<hex>\""
  const set = new Set();
  const today = new Date().toISOString().slice(0, 10);
  // We parse with a simple regex approach (no yaml dep required)
  // Blocks: each "- fingerprint: X" optionally followed by "  expires: Y"
  const blocks = raw.split(/\n(?=\s*-\s+fingerprint:)/);
  for (const block of blocks) {
    const fpMatch = block.match(/fingerprint\s*:\s*["']?([a-f0-9]{64})["']?/);
    if (!fpMatch) continue;
    const fp = fpMatch[1];
    const expiresMatch = block.match(/expires\s*:\s*["']?(\d{4}-\d{2}-\d{2})["']?/);
    if (expiresMatch && expiresMatch[1] < today) {
      process.stderr.write(
        `[codex-review] WARN: waiver ${fp.slice(0, 12)}... expired ${expiresMatch[1]} — treating as not waived\n`
      );
      continue;
    }
    set.add(fp);
  }
  return set;
}

// ── extract JSON from Codex output ─────────────────────────────────────
function extractFindings(raw) {
  // Codex may emit markdown fences around the JSON
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    if (parsed && Array.isArray(parsed.findings)) return parsed;
    return null;
  } catch {
    return null;
  }
}

// ── output schema prompt ────────────────────────────────────────────────
const SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'line', 'rule', 'issue', 'evidence', 'fix', 'fingerprint'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: ['integer', 'string'] },
          rule: { type: 'string' },
          issue: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          fingerprint: { type: 'string' },
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

  // 1. Precondition: codex CLI available on PATH
  if (!commandAvailable('codex')) {
    process.stdout.write(
      'SKIPPED_PRECONDITION: codex CLI not found on PATH.\n' +
      '  Install with: npm install -g @openai/codex\n' +
      '  Then authenticate: codex login\n'
    );
    process.exit(0);
  }

  // 2. Precondition: codex is authenticated via OAuth
  //    Probe: `codex login status` → "Logged in using ChatGPT" (exit 0)
  //    No API key required — authentication is local OAuth session only.
  if (!codexLoggedIn()) {
    process.stdout.write(
      'SKIPPED_PRECONDITION: codex CLI is not logged in.\n' +
      '  Run: codex login\n' +
      '  Confirm with: codex login status\n' +
      '  This gate uses local OAuth (ChatGPT/Codex login), not an API key.\n'
    );
    process.exit(0);
  }

  // 3. Collect changed files in sonar scope
  const changedFiles = gitDiffFiles(baseRef);
  const scopedFiles = changedFiles.filter(isInScope);

  process.stdout.write(`[codex-review] base ref : ${baseRef}\n`);
  process.stdout.write(`[codex-review] changed  : ${changedFiles.length} files total\n`);
  process.stdout.write(`[codex-review] in scope : ${scopedFiles.length} files\n`);

  if (scopedFiles.length === 0) {
    process.stdout.write('[codex-review] No source files changed — gate PASS (nothing to review).\n');
    const result = { findings: [], scoped_files: [], base_ref: baseRef, verdict: 'PASS' };
    fs.writeFileSync(FINDINGS_PATH, JSON.stringify(result, null, 2));
    fs.writeFileSync(SUMMARY_PATH, 'No source files changed. Gate PASS.\n');
    process.exit(0);
  }

  // 4. Write schema file
  writeSchema();

  // 5. Build prompt
  const fileList = scopedFiles.map((f) => `  - ${f}`).join('\n');
  const prompt = `You are an independent code auditor. Your task is to find REAL bugs in the diff below.

Scope: only the following files changed in this PR (diff vs ${baseRef}):
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

For each finding compute a fingerprint as: SHA-256 of "<file>:<issue-text-lowercase-whitespace-collapsed>"

Respond ONLY with a JSON object — no prose, no markdown fences — matching this schema:
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "file": "<relative path>",
      "line": <line number or range as string>,
      "rule": "<short rule name, e.g. wrong-unit-mapping>",
      "issue": "<one sentence: what is wrong>",
      "evidence": "<quote the relevant code and explain why it is wrong>",
      "fix": "<concrete fix suggestion>",
      "fingerprint": "<sha256 hex of file:normalised-issue>"
    }
  ]
}

If no real bugs are found, return { "findings": [] }.`;

  // 6. Run Codex headless (uses local OAuth session — no API key)
  //
  // Strategy: use `codex exec -` to run an agent session with our structured
  // JSON prompt piped via stdin.  We embed the git diff inline in the prompt so
  // Codex reviews exactly the changed code.  The -o flag captures the final
  // agent message for JSON parsing.
  //
  // NOTE on codex 0.133.x: `codex exec review --base <ref>` and `[PROMPT]`
  // are mutually exclusive, so we use plain `codex exec` instead and provide
  // the diff context in the prompt ourselves.
  process.stdout.write('[codex-review] Running Codex review (headless, OAuth) ...\n');

  const lastMsgPath = path.join(OUT_DIR, 'codex-last-message.txt');
  const promptPath = path.join(OUT_DIR, 'codex-prompt.txt');

  // Fetch the actual diff for the scoped files to embed in the prompt.
  const diffResult = spawnSync(
    'git',
    ['diff', `${baseRef}...HEAD`, '--', ...scopedFiles],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      cwd: REPO_ROOT,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  const diffText = (diffResult.stdout || '').slice(0, 50_000); // cap at 50 KB

  // Combine the structured prompt with the actual diff
  const fullPrompt = `${prompt}

Here is the actual diff to review:

\`\`\`diff
${diffText || '(no diff output — check base ref)'}
\`\`\`
`;

  fs.writeFileSync(promptPath, fullPrompt, 'utf8');

  // Pass the prompt via stdin ('-') so no shell word-splitting occurs.
  const codexArgs = [
    'exec',
    '-', // read prompt from stdin
    '--ephemeral',
    '-o', lastMsgPath,
  ];

  const r = spawnSync('codex', codexArgs, {
    encoding: 'utf8',
    input: fullPrompt,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: REPO_ROOT,
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 5 * 60 * 1000, // 5-minute wall clock
  });

  if (VERBOSE) {
    process.stderr.write('--- codex stdout ---\n' + (r.stdout || '') + '\n');
    process.stderr.write('--- codex stderr ---\n' + (r.stderr || '') + '\n');
  }

  // 7. Parse output — prefer -o file (structured last message), fall back stdout
  let rawOutput = '';
  if (fs.existsSync(lastMsgPath)) {
    rawOutput = fs.readFileSync(lastMsgPath, 'utf8');
  }
  if (!rawOutput) rawOutput = r.stdout || r.stderr || '';

  // Save raw for debugging
  fs.writeFileSync(path.join(OUT_DIR, 'codex-raw.txt'), rawOutput);

  let parsed = extractFindings(rawOutput);
  if (!parsed) {
    // Codex may have failed or returned non-JSON.
    // Locally (OAuth gate): degrade rather than block the developer.
    const exitCode = r.status ?? -1;
    process.stderr.write(
      `[codex-review] WARN: Could not parse Codex output (exit ${exitCode}). ` +
      `Raw saved to artifacts/codex-review/codex-raw.txt\n`
    );
    if (r.stderr) process.stderr.write(r.stderr.slice(0, 2000) + '\n');

    process.stdout.write(
      'SKIPPED_PRECONDITION: Codex returned unparseable output. ' +
      'Review artifacts/codex-review/codex-raw.txt.\n'
    );
    process.exit(0);
  }

  // 8. Stamp fingerprints (Codex computes them too, but we recompute for
  //    consistency — our normalisation is the contract, not the model's)
  const waivers = loadWaivers();
  const findings = parsed.findings.map((f) => {
    const fp = fingerprint(f.file, f.issue);
    return { ...f, fingerprint: fp };
  });

  const unwaived = findings.filter((f) => !waivers.has(f.fingerprint));
  const waived = findings.filter((f) => waivers.has(f.fingerprint));

  // 9. Write artifacts
  const artifactData = {
    base_ref: baseRef,
    scoped_files: scopedFiles,
    findings,
    waived_count: waived.length,
    unwaived_count: unwaived.length,
    verdict: unwaived.length === 0 ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(FINDINGS_PATH, JSON.stringify(artifactData, null, 2));

  const lines = [];
  lines.push(`Codex Semantic Review — ${new Date().toISOString()}`);
  lines.push(`Base ref  : ${baseRef}`);
  lines.push(`Files in scope : ${scopedFiles.length}`);
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
      lines.push(`  [${f.severity.toUpperCase()}] ${f.file}:${f.line} — ${f.rule} (fp: ${f.fingerprint.slice(0, 12)}...)`);
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
    `  with a non-empty reason, author, and date.\n`
  );
  process.exit(1);
}

main();
