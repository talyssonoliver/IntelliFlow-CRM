#!/usr/bin/env node
/**
 * Unit tests at the pre-ship test scope (see scripts/lib/preship-test-scope.mjs).
 *
 *   full    → vitest run --project=!integration          (same as `pnpm test:unit`)
 *   related → vitest related --run --project=!integration <changed source files>
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

const scope = scopeFromEnvOrResolve({ cwd: ROOT });
console.log(`unit-tests scope: ${scope.scope} (${scope.reason})`);

if (scope.scope === 'none') {
  console.log('unit-tests: no changed source files — no related tests to run.');
  process.exit(0);
}

const args =
  scope.scope === 'related'
    ? [VITEST, 'related', '--run', '--passWithNoTests', '--project=!integration', ...scope.files]
    : [VITEST, 'run', '--project=!integration'];

if (scope.scope === 'related') {
  for (const f of scope.files) console.log(`  related: ${f}`);
}

const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
if (r.error) {
  console.error(`unit-tests: could not start vitest: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
