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
 * Vitest is spawned through node directly (no shell) so a long related-file list
 * is not cut by cmd.exe's 8K command-line limit.
 *
 * Usage: node scripts/run-unit-tests-scoped.mjs
 * Env:   PRESHIP_FULL_TESTS=1 forces the full suite.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scopeFromEnvOrResolve } from './lib/preship-test-scope.mjs';
import { loadProjectMap, projectNames, unitTestRuns } from './lib/preship-project-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

const scope = scopeFromEnvOrResolve({ cwd: ROOT });
console.log(`unit-tests scope: ${scope.scope} (${scope.reason})`);
for (const f of scope.scope === 'related' ? scope.files : []) console.log(`  related: ${f}`);

// Projects to run in full need the other project names for the related run; if
// the list cannot be read, fall back to the full suite rather than narrow it.
let runScope = scope;
let names = [];
if (scope.projects?.length) {
  const map = loadProjectMap(ROOT);
  if (map) names = projectNames(map);
  else {
    console.error('unit-tests: cannot read the vitest project list; running the full suite.');
    runScope = { scope: 'full', reason: 'project list unreadable', files: [] };
  }
}
const runs = unitTestRuns(runScope, names);
if (runs.length === 0) {
  console.log('unit-tests: no changed source files — no related tests to run.');
  process.exit(0);
}

for (const args of runs) {
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
