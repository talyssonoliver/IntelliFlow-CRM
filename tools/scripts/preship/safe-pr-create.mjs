#!/usr/bin/env node
/**
 * safe-pr-create.mjs — `gh pr create` wrapper that refuses to open a PR whose
 * body would fail the required `PR Checks / PR Validation` context.
 *
 * It reads the body (the same `--body-file <path>` you pass to gh, or `--body
 * <text>`), validates it with check-pr-body.mjs, and only then forwards ALL
 * arguments to `gh pr create`. This catches the missing-task-id failure mode
 * BEFORE the PR exists, instead of after CI goes red.
 *
 * Usage (drop-in for `gh pr create`):
 *   node tools/scripts/preship/safe-pr-create.mjs --base main \
 *     --head my-branch --title "..." --body-file body.md
 *   pnpm pr:create --base main --head my-branch --title "..." --body-file body.md
 *
 * Exit codes: 0 PR created, 1 invalid body (PR NOT created), 2 usage error,
 *             else gh's own exit code.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { color, isMain } from './util.mjs';
import { validatePrBody, PR_BODY_REMEDIATION } from './check-pr-body.mjs';

function resolveBody(argv) {
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
  console.error('safe-pr-create: pass the PR body via --body-file <path> or --body <text>');
  process.exit(2);
}

/** Run `gh` with passthrough args, resolving the binary robustly on Windows. */
function runGh(args) {
  const candidates = process.platform === 'win32' ? ['gh.exe', 'gh.cmd', 'gh'] : ['gh'];
  for (const bin of candidates) {
    const r = spawnSync(bin, args, { stdio: 'inherit' });
    if (r.error && r.error.code === 'ENOENT') continue;
    return r.status ?? 1;
  }
  console.error('safe-pr-create: gh CLI not found on PATH');
  return 127;
}

function main() {
  const argv = process.argv.slice(2);
  const body = resolveBody(argv);

  const { ok, matched } = validatePrBody(body);
  if (!ok) {
    console.error(`${color.red('✖')} safe-pr-create: PR body validation failed — PR NOT created.`);
    for (const line of PR_BODY_REMEDIATION) console.error(line ? `   ${line}` : '');
    process.exit(1);
  }

  console.log(
    `${color.green('✓')} PR body OK (references "${matched}") — forwarding to \`gh pr create\`...`
  );
  process.exit(runGh(['pr', 'create', ...argv]));
}

if (isMain(import.meta.url)) {
  main();
}
