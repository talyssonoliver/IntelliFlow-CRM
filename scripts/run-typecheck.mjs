#!/usr/bin/env node
/**
 * Pre-ship's typecheck step (see scripts/lib/preship-typecheck.mjs, #1100).
 *
 *   local → turbo run typecheck --concurrency=<n>, then pnpm run lint:sonar:guard
 *   CI    → turbo run typecheck,                  then pnpm run lint:sonar:guard
 *
 * Turbo is spawned through node directly (no shell). pnpm needs a shell on win32
 * to resolve pnpm.cmd; its arguments are fixed strings.
 *
 * Usage: node scripts/run-typecheck.mjs
 * Env:   PRESHIP_TYPECHECK_CONCURRENCY=<n> sets the local turbo concurrency (default 3).
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { typecheckPlan } from './lib/preship-typecheck.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TURBO = path.join(ROOT, 'node_modules', 'turbo', 'bin', 'turbo');
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';

let plan;
try {
  plan = typecheckPlan({ isCI: IS_CI, env: process.env });
} catch (err) {
  console.error(`typecheck: ${err.message}`);
  process.exit(1);
}

for (const step of plan) {
  console.log(`typecheck: ${step.name} — ${step.bin} ${step.args.join(' ')}`);
  const r =
    step.bin === 'turbo'
      ? spawnSync(process.execPath, [TURBO, ...step.args], { cwd: ROOT, stdio: 'inherit' })
      : spawnSync('pnpm', step.args, {
          cwd: ROOT,
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
  if (r.error) {
    console.error(`typecheck: could not start ${step.bin}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}
