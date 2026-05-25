#!/usr/bin/env node
/**
 * Runs every `verification_command` in
 * `artifacts/reports/ci-failures/registry.json` and reports PASS/FAIL.
 *
 * Each command runs under `bash -eo pipefail`. A non-zero exit means the
 * guard for that pattern has regressed (or the command itself is stale —
 * in which case fix the registry).
 *
 * Usage:
 *   node tools/scripts/verify-ci-failure-guards.mjs            # all patterns
 *   node tools/scripts/verify-ci-failure-guards.mjs --id <id>  # one pattern
 *   node tools/scripts/verify-ci-failure-guards.mjs --json     # machine-readable
 *
 * Exit codes:
 *   0 — every command exited 0
 *   1 — one or more commands failed (regression or stale command)
 *   2 — usage error / registry missing or malformed
 *
 * Intended use: nightly CI job posts a regression issue if exit != 0. Local
 * use: run before merging a PR that touches any of the affected workflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REGISTRY_PATH = path.resolve('artifacts/reports/ci-failures/registry.json');

const args = process.argv.slice(2);
const flags = {
  id: null,
  json: false,
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--id') {
    // Reject `--id` with no value, or `--id --json` (where the next token
    // is another flag). Previously a missing value silently set
    // flags.id = undefined and produced a confusing 'no patterns matched
    // id=undefined' error.
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      console.error(`--id requires a pattern id (got: ${next ?? '(end of args)'})`);
      process.exit(2);
    }
    flags.id = next;
    i += 1;
  } else if (args[i] === '--json') {
    flags.json = true;
  } else {
    console.error(`unknown arg: ${args[i]}`);
    process.exit(2);
  }
}

// Read first, ENOENT → exit 2 with explicit message. existsSync probe
// would race with a parallel writer (CodeQL js/file-system-race).
let registryText;
try {
  registryText = fs.readFileSync(REGISTRY_PATH, 'utf8');
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error(`registry not found at ${REGISTRY_PATH}`);
  } else {
    console.error(`could not read registry: ${e.message}`);
  }
  process.exit(2);
}
let registry;
try {
  registry = JSON.parse(registryText);
} catch (e) {
  console.error(`registry is not valid JSON: ${e.message}`);
  process.exit(2);
}

const patterns = flags.id ? registry.patterns.filter((p) => p.id === flags.id) : registry.patterns;

if (patterns.length === 0) {
  console.error(`no patterns matched id=${flags.id}`);
  process.exit(2);
}

// Verdicts:
//   PASS       — guard_added=true  + cmd exit 0  → guard is in place
//   REGRESSION — guard_added=true  + cmd exit !=0 → real failure, exit 1
//   TODO       — guard_added=false + cmd exit !=0 → guard still missing, known
//   PROMOTE    — guard_added=false + cmd exit 0  → guard now exists, flip flag
const verdictFor = (added, code) => {
  if (added && code === 0) return 'PASS';
  if (added && code !== 0) return 'REGRESSION';
  if (!added && code !== 0) return 'TODO';
  return 'PROMOTE';
};

const results = [];
for (const p of patterns) {
  // `bash -eo pipefail` makes every error fatal — partial-success
  // pipelines and silent-failure greps would otherwise mask a regression.
  const r = spawnSync('bash', ['-eo', 'pipefail', '-c', p.verification_command], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const verdict = verdictFor(p.guard_added, r.status);
  results.push({
    id: p.id,
    title: p.title,
    owner: p.owner,
    guard_added: p.guard_added,
    exit_code: r.status,
    verdict,
    passed: verdict === 'PASS' || verdict === 'TODO' || verdict === 'PROMOTE',
    stderr: (r.stderr || '').trim().slice(0, 500),
    stdout: (r.stdout || '').trim().slice(0, 500),
  });
}

if (flags.json) {
  const byVerdict = {
    PASS: results.filter((r) => r.verdict === 'PASS').length,
    REGRESSION: results.filter((r) => r.verdict === 'REGRESSION').length,
    TODO: results.filter((r) => r.verdict === 'TODO').length,
    PROMOTE: results.filter((r) => r.verdict === 'PROMOTE').length,
  };
  console.log(
    JSON.stringify(
      {
        registry_version: registry.schema_version,
        verified_at: new Date().toISOString(),
        total: results.length,
        by_verdict: byVerdict,
        results,
      },
      null,
      2
    )
  );
} else {
  for (const r of results) {
    process.stdout.write(`${r.verdict.padEnd(10)}  ${r.id.padEnd(40)}  ${r.title}\n`);
    if (r.verdict === 'REGRESSION' && r.stderr) {
      process.stderr.write(`     stderr: ${r.stderr}\n`);
    }
  }
  const regressions = results.filter((r) => r.verdict === 'REGRESSION').length;
  const todos = results.filter((r) => r.verdict === 'TODO').length;
  const promotes = results.filter((r) => r.verdict === 'PROMOTE').length;
  process.stdout.write(
    `\n${results.length - regressions}/${results.length} guards intact ` +
      `(${regressions} REGRESSION, ${todos} TODO, ${promotes} PROMOTE)\n`
  );
  if (promotes > 0) {
    process.stdout.write(
      `note: ${promotes} TODO entr${promotes === 1 ? 'y has' : 'ies have'} a guard committed — flip guard_added to true.\n`
    );
  }
}

// Exit non-zero ONLY on real regressions. TODOs are known gaps;
// PROMOTEs are good news (guard exists, flip the flag). Both are
// reported but don't fail CI.
const regressions = results.filter((r) => r.verdict === 'REGRESSION').length;
process.exit(regressions === 0 ? 0 : 1);
