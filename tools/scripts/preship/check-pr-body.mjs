#!/usr/bin/env node
/**
 * check-pr-body.mjs  (CI failure category: "PR Validation" — task-id-in-body)
 *
 * The required `PR Checks / PR Validation` context greps the PR *body* for a
 * tracked task id / issue ref / hotfix waiver and fails the PR without one.
 * That check cannot be mirrored by the pre-push pre-ship gate (the PR body does
 * not exist at push time) — so this guard validates the body at PR-CREATE time
 * instead, via safe-pr-create.mjs / `pnpm pr:create`.
 *
 * It enforces the SAME regex pr-checks.yml uses (case-insensitive):
 *     ([A-Z]{2,}(-[A-Z0-9]+)*-[0-9]+|#[0-9]+|\[hotfix\]|hotfix-waiver)
 * i.e. one of:
 *   • a tracked task id   — IFC-123, PG-045, S17-AUDIT-001, INFRA-TF-002, ...
 *   • a GitHub issue ref  — #123
 *   • a hotfix waiver     — [hotfix]  or  hotfix-waiver
 *
 * Usage
 *   node tools/scripts/preship/check-pr-body.mjs --body-file <path>
 *   echo "...body..." | node tools/scripts/preship/check-pr-body.mjs
 *   node tools/scripts/preship/check-pr-body.mjs --body "fixes #123"
 *
 * Exit codes (when run directly): 0 valid, 1 invalid, 2 usage error.
 */

import { readFileSync } from 'node:fs';

import { color, isMain } from './util.mjs';

// Keep IN SYNC with .github/workflows/pr-checks.yml "Require task ID or hotfix
// waiver in PR body". Case-insensitive, mirroring grep -i.
export const PR_BODY_TOKEN_RE = /([A-Z]{2,}(-[A-Z0-9]+)*-[0-9]+|#[0-9]+|\[hotfix\]|hotfix-waiver)/i;

/**
 * @param {string} body
 * @returns {{ ok: boolean, matched: string|null }}
 */
export function validatePrBody(body) {
  const m = String(body ?? '').match(PR_BODY_TOKEN_RE);
  return { ok: Boolean(m), matched: m ? m[0] : null };
}

/** Remediation text shown when a body fails validation. */
export const PR_BODY_REMEDIATION = [
  'PR body must reference one of:',
  '  • a tracked task id   — e.g. IFC-123, PG-045, S17-AUDIT-001',
  '  • a GitHub issue ref  — e.g. #123',
  '  • a hotfix waiver     — [hotfix]  or  hotfix-waiver',
  '',
  'This mirrors the required "PR Checks / PR Validation" context. For',
  'meta/infra work with no tracked task, use `hotfix-waiver:` + a one-line',
  'justification. See docs/runbooks/preship-guards.md (PR Body Token).',
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readBodyFromArgs(argv) {
  const bf = argv.indexOf('--body-file');
  if (bf !== -1) {
    const path = argv[bf + 1];
    if (!path) {
      console.error('--body-file requires a path');
      process.exit(2);
    }
    return readFileSync(path, 'utf8');
  }
  const b = argv.indexOf('--body');
  if (b !== -1) {
    const text = argv[b + 1];
    if (text == null) {
      console.error('--body requires a value');
      process.exit(2);
    }
    return text;
  }
  // Fall back to stdin (non-TTY).
  if (!process.stdin.isTTY) {
    try {
      return readFileSync(0, 'utf8');
    } catch {
      return '';
    }
  }
  console.error('provide the PR body via --body-file <path>, --body <text>, or stdin');
  process.exit(2);
}

function main() {
  const body = readBodyFromArgs(process.argv.slice(2));
  const { ok, matched } = validatePrBody(body);

  if (ok) {
    console.log(
      `${color.green('PASS')}  [pr-body] references "${matched}" (task id / issue / waiver)`
    );
    process.exit(0);
  }

  console.error(`${color.red('FAIL')}  [pr-body] no task id / issue / hotfix waiver found`);
  for (const line of PR_BODY_REMEDIATION) console.error(line ? `      ${line}` : '');
  process.exit(1);
}

if (isMain(import.meta.url)) {
  main();
}
