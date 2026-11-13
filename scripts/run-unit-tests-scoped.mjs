#!/usr/bin/env node
/**
 * Unit tests at the pre-ship test scope (see scripts/lib/preship-test-scope.mjs).
 *
 *   full    → vitest run --project=!integration          (same as `pnpm test:unit`)
 *   related → vitest related --run --project=!integration <changed source files>;
 *             when a package-local config changed, its projects run in full and
 *             the related tests run in every other project
 *             (scripts/lib/preship-project-scope.mjs, unitTestRuns)
 *   none    → nothing to run; exit 0 and say so
 *
 * When the coverage step already ran these tests for this commit and scope,
 * its per-project results are the verdict and only the projects it does not
 * cover run here (scripts/lib/preship-test-reuse.mjs).
 *
 * Vitest is spawned through node directly (no shell) so a long related-file list
 * is not cut by cmd.exe's 8K command-line limit.
 *
 * Usage: node scripts/run-unit-tests-scoped.mjs
 * Env:   PRESHIP_FULL_TESTS=1 forces the full suite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scopeFromEnvOrResolve } from './lib/preship-test-scope.mjs';
import { loadProjectMap, projectNames } from './lib/preship-project-scope.mjs';
import { RESULTS_FILE, planUnitRuns } from './lib/preship-test-reuse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

const scope = scopeFromEnvOrResolve({ cwd: ROOT });
console.log(`unit-tests scope: ${scope.scope} (${scope.reason})`);
for (const f of scope.scope === 'related' ? scope.files : []) console.log(`  related: ${f}`);

const map = loadProjectMap(ROOT);
let record = null;
try {
  record = JSON.parse(fs.readFileSync(path.join(ROOT, RESULTS_FILE), 'utf8'));
} catch {
  // no coverage record: the tests run here
}
let headSha = null;
try {
  headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  // no commit: the coverage record cannot be matched
}

const plan = planUnitRuns({ scope, names: map ? projectNames(map) : null, record, headSha });
for (const line of plan.log) console.log(`unit-tests: ${line}`);
if (plan.failed.length > 0) {
  console.error(`unit-tests: the coverage run had failing tests in ${plan.failed.join(', ')}`);
  process.exit(1);
}
if (plan.runs.length === 0) {
  console.log('unit-tests: nothing left to run.');
  process.exit(0);
}
for (const args of plan.runs) {
  console.log(
    `unit-tests: vitest ${args.filter((a) => a.startsWith('-') || !a.includes('/')).join(' ')}`
  );
  const r = spawnSync(process.execPath, [VITEST, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.error) {
    console.error(`unit-tests: could not start vitest: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}
process.exit(0);
