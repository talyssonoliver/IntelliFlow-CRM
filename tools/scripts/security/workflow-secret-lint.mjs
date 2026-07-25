#!/usr/bin/env node
/**
 * workflow-secret-lint — deterministic secret linter for GitHub Actions workflow YAML.
 *
 * WHY THIS EXISTS (Harness hardening — Gap #1):
 * gitleaks (the local pre-ship secret scan) has no rule for a bare
 * `postgres:postgres` / `POSTGRES_PASSWORD: postgres` literal, so those pass the
 * laptop gate. GitGuardian (the cloud scanner that runs on every PR commit) DOES
 * flag them — which let the same ephemeral credential literal reach a red PR
 * three separate times (#622, #625, #627). This linter closes that gap: it runs
 * LOCALLY (pre-ship, required) with the SAME "no hardcoded credential literal in
 * a workflow" policy GitGuardian enforces, so a developer fixes it before push
 * instead of after a cloud round-trip.
 *
 * POLICY (per sensitive key found anywhere in a workflow):
 *   - `POSTGRES_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`, `PGPASSWORD` and any
 *     `password:` / `pw:` key MUST NOT carry a bare credential string literal.
 *   - A value that is a `${{ ... }}` expression (e.g. `${{ secrets.DATABASE_URL }}`)
 *     is a reference, not a literal → PASS.
 *   - A value whose credential tokens are all self-evident placeholders
 *     (`stub`, `placeholder`, `example`, `dummy`, `changeme`, ...) → PASS. A real
 *     secret is never literally "stub"; these carry zero leak risk and GitGuardian
 *     does not flag them either.
 *   - Any other literal (e.g. `postgres`, `test`, `dev`, a real-looking password)
 *     FAILS unless the line carries an inline allow marker:
 *         # secret-lint-allow: <reason>      (reason is mandatory, non-empty)
 *     The marker forces every intentional throwaway credential (an ephemeral CI
 *     service-container password on localhost, etc.) to be an explicit, reviewed
 *     exception with a written justification — not a silent literal. A bare
 *     `# gitleaks:allow` marker is also honoured (keeps this in lockstep with the
 *     gitleaks rule `postgres-literal-in-workflow`).
 *
 * SCOPE: YAML `key: value` declarations in `.github/workflows/*.{yml,yaml}`
 * (top level only). Shell assignments inside `run:` blocks (`PGPASSWORD=postgres
 * psql ...`) are shell, not workflow env declarations, and are intentionally left
 * to gitleaks/GitGuardian raw-text scanning.
 *
 * USAGE:
 *   node tools/scripts/security/workflow-secret-lint.mjs            # scan .github/workflows
 *   node tools/scripts/security/workflow-secret-lint.mjs --json     # machine-readable findings
 *   node tools/scripts/security/workflow-secret-lint.mjs a.yml b.yml# scan explicit files
 *   WORKFLOW_SECRET_LINT_DIR=/tmp/x node tools/scripts/security/workflow-secret-lint.mjs
 *
 * EXIT CODES: 0 = clean, 1 = at least one violation (or unreadable/invalid file),
 * 2 = usage error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Policy configuration
// ---------------------------------------------------------------------------

// Sensitive keys whose VALUE must be a secret reference (or an allow-marked /
// placeholder throwaway). Matched case-insensitively.
export const SENSITIVE_KEYS = new Set([
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'DIRECT_URL',
  'PGPASSWORD',
  'PASSWORD',
  'PW',
]);

// Values whose credential tokens are entirely self-evident placeholders pass
// without needing an allow marker. A real secret is never literally one of these.
const PLACEHOLDER_TOKENS = new Set([
  'stub',
  'placeholder',
  'example',
  'dummy',
  'changeme',
  'change-me',
  'fake',
  'none',
  'unset',
  'notset',
  'redacted',
  'xxx',
  'xxxx',
  'xxxxx',
]);

// Line regex: a YAML mapping declaration for a sensitive key. Captures the key
// and the remainder of the line (value + any trailing inline comment).
//
// The value capture is deliberately `(.*)` with no leading `\s*`: `\s` and `.`
// both match a space, so `\s*(.*)` is an ambiguous pair that lets the engine
// split a run of spaces many ways (sonarjs/slow-regex). `extractValue()` starts
// with `rest.trim()`, so leading whitespace is discarded there anyway and this
// is behaviour-identical.
const DECL_RE =
  /^[ \t]*(POSTGRES_PASSWORD|DATABASE_URL|DIRECT_URL|PGPASSWORD|password|pw)[ \t]*:(.*)$/i;

// Inline allow markers. `secret-lint-allow` requires a non-empty reason.
const SECRET_LINT_ALLOW_RE = /#\s*secret-lint-allow:\s*\S+/i;
const GITLEAKS_ALLOW_RE = /#\s*gitleaks:allow\b/i;

// Extract user:pass from a DB connection URL, if the value is one.
const URL_CRED_RE = /^[a-z][a-z0-9+.-]*:\/\/([^:@/\s]+):([^@/\s]+)@/i;

// ---------------------------------------------------------------------------
// Core classification (pure — unit tested)
// ---------------------------------------------------------------------------

/** True if a token is a self-evident, zero-risk placeholder. */
function isPlaceholderToken(token) {
  const t = String(token).toLowerCase();
  if (PLACEHOLDER_TOKENS.has(t)) return true;
  // Substring forms like `stub2`, `my-placeholder`, `example-db`.
  return ['stub', 'placeholder', 'example', 'dummy', 'changeme'].some((p) => t.includes(p));
}

/**
 * Strip an inline YAML comment and surrounding quotes from the captured value.
 * YAML unquoted inline comments start at ` #` (whitespace + hash). Quoted values
 * are returned unquoted.
 */
export function extractValue(rest) {
  let v = rest.trim();
  if (v === '') return '';
  // Quoted scalar: take the quoted content verbatim.
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    if (end !== -1) return v.slice(1, end);
    return v.slice(1);
  }
  // Unquoted: an inline comment begins at the first ` #`.
  const hash = v.search(/\s#/);
  if (hash !== -1) v = v.slice(0, hash);
  return v.trim();
}

/**
 * Classify a sensitive value.
 * @returns {'reference'|'placeholder'|'empty'|'literal'} — only 'literal' is a violation.
 */
export function classifyValue(value) {
  const v = String(value).trim();
  if (v === '') return 'empty';
  // A GitHub Actions expression anywhere makes this a reference, not a bare literal.
  if (v.includes('${{')) return 'reference';

  // DB connection URL: judge the embedded credentials.
  const m = URL_CRED_RE.exec(v);
  if (m) {
    const tokens = [m[1], m[2]];
    return tokens.every(isPlaceholderToken) ? 'placeholder' : 'literal';
  }
  // A URL without embedded credentials carries no literal secret.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return 'reference';

  // Bare scalar (e.g. `POSTGRES_PASSWORD: postgres`).
  return isPlaceholderToken(v) ? 'placeholder' : 'literal';
}

/** True if the line carries a valid inline allow marker. */
export function hasAllowMarker(line) {
  return SECRET_LINT_ALLOW_RE.test(line) || GITLEAKS_ALLOW_RE.test(line);
}

/**
 * Lint a single workflow file's text.
 * @returns {Array<{line:number,key:string,type:string,text:string}>} findings.
 */
export function lintWorkflowText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = DECL_RE.exec(line);
    if (!m) continue;
    const key = m[1];
    if (!SENSITIVE_KEYS.has(key.toUpperCase())) continue;
    // An explicit, reasoned allow marker exempts the line.
    if (hasAllowMarker(line)) continue;
    const value = extractValue(m[2]);
    const type = classifyValue(value);
    if (type === 'literal') {
      findings.push({ line: i + 1, key, type, text: line.trim() });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// File discovery + CLI (only runs when invoked directly)
// ---------------------------------------------------------------------------

function discoverWorkflowFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function redactFindingText(text) {
  // Never echo a raw credential. Collapse `://user:pass@` and `KEY: value` tails.
  return text
    .replace(/(:\/\/[^:@/\s]+:)[^@/\s]+@/g, '$1<redacted>@')
    .replace(/^((?:POSTGRES_PASSWORD|PGPASSWORD|password|pw)\s*:\s*)\S.*$/i, '$1<redacted>');
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const fileArgs = args.filter((a) => !a.startsWith('--'));
  const unknownFlags = args.filter((a) => a.startsWith('--') && a !== '--json');
  if (unknownFlags.length) {
    process.stderr.write(`workflow-secret-lint: unknown flag(s): ${unknownFlags.join(', ')}\n`);
    return 2;
  }

  let files;
  if (fileArgs.length) {
    files = fileArgs;
  } else {
    const dir = process.env.WORKFLOW_SECRET_LINT_DIR || path.join('.github', 'workflows');
    files = discoverWorkflowFiles(dir);
  }

  const allFindings = [];
  const errors = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      errors.push({ file, error: `unreadable: ${err.message}` });
      continue;
    }
    for (const f of lintWorkflowText(text)) {
      allFindings.push({ file, ...f });
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify({ findings: allFindings, errors }, null, 2) + '\n');
  } else if (allFindings.length === 0 && errors.length === 0) {
    process.stdout.write(
      `workflow-secret-lint: OK — no hardcoded credential literals in ${files.length} workflow file(s)\n`
    );
  } else {
    process.stderr.write(
      'workflow-secret-lint: FAIL — hardcoded credential literal(s) in workflows\n\n'
    );
    for (const f of allFindings) {
      process.stderr.write(
        `  ${f.file}:${f.line}  ${f.key} has a bare credential literal\n` +
          `      ${redactFindingText(f.text)}\n`
      );
    }
    for (const e of errors) {
      process.stderr.write(`  ${e.file}: ${e.error}\n`);
    }
    process.stderr.write(
      '\n  Fix: use a `${{ secrets.* }}` reference, OR — for a genuinely ephemeral,\n' +
        '  localhost/throwaway CI credential — annotate the line with:\n' +
        '      # secret-lint-allow: <why this literal is safe>\n'
    );
  }

  return allFindings.length > 0 || errors.length > 0 ? 1 : 0;
}

// Run only when executed directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  process.exit(main(process.argv));
}

export { main, discoverWorkflowFiles };
