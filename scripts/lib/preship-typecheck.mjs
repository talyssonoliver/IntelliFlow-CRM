/**
 * Commands behind pre-ship's typecheck step (#1100).
 *
 * The step used to be `pnpm run typecheck`, which runs the turbo typecheck over
 * every package at turbo's default parallelism. On a laptop that is the memory
 * peak of the whole gate: on 2026-10-30 three #1099 pushes were killed by the
 * host's low-memory reaper at exactly this step, at about 90% physical memory,
 * after every earlier step had passed.
 *
 * Locally the turbo typecheck therefore runs with --concurrency (default 3,
 * PRESHIP_TYPECHECK_CONCURRENCY overrides it). Under CI it keeps turbo's default
 * parallelism. Either way the sonar guard runs after it, as `pnpm run typecheck`
 * does. Turbo has no environment variable for concurrency, and
 * `pnpm run typecheck -- --concurrency=N` would hand the flag to the last command
 * of the script's `&&` chain (the sonar guard), so the step runs the two commands
 * itself (runTypecheck, called by scripts/run-typecheck.mjs).
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const CONCURRENCY_ENV = 'PRESHIP_TYPECHECK_CONCURRENCY';
export const DEFAULT_LOCAL_TYPECHECK_CONCURRENCY = 3;

/**
 * Turbo concurrency for the typecheck: a positive integer locally, null under CI
 * (no flag, turbo's default). A malformed override throws rather than silently
 * falling back, so a typo cannot quietly bring the memory peak back.
 * @param {{isCI: boolean, env: Record<string, string | undefined>}} opts
 * @returns {number | null}
 */
export function typecheckConcurrency({ isCI, env }) {
  if (isCI) return null;
  const raw = (env[CONCURRENCY_ENV] ?? '').trim();
  if (raw === '') return DEFAULT_LOCAL_TYPECHECK_CONCURRENCY;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`${CONCURRENCY_ENV} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

/**
 * The typecheck step's commands, in order. `bin` is 'turbo' or 'pnpm'; the
 * runner resolves it.
 * @param {{isCI: boolean, env: Record<string, string | undefined>}} opts
 * @returns {{name: string, bin: 'turbo' | 'pnpm', args: string[]}[]}
 */
export function typecheckPlan({ isCI, env }) {
  const concurrency = typecheckConcurrency({ isCI, env });
  const turboArgs = ['run', 'typecheck'];
  if (concurrency !== null) turboArgs.push(`--concurrency=${concurrency}`);
  return [
    { name: 'turbo typecheck', bin: 'turbo', args: turboArgs },
    { name: 'sonar guard', bin: 'pnpm', args: ['run', 'lint:sonar:guard'] },
  ];
}

/**
 * Run the typecheck step's commands in order, stopping at the first failure.
 * Turbo is spawned through node directly (no shell). pnpm needs a shell on win32
 * to resolve pnpm.cmd; its arguments are fixed strings.
 * @returns {number} the step's exit code
 */
export function runTypecheck({
  isCI,
  env,
  root,
  spawn = spawnSync,
  log = console.log,
  logError = console.error,
  execPath = process.execPath,
  platform = process.platform,
}) {
  let plan;
  try {
    plan = typecheckPlan({ isCI, env });
  } catch (err) {
    logError(`typecheck: ${err.message}`);
    return 1;
  }
  const turbo = path.join(root, 'node_modules', 'turbo', 'bin', 'turbo');
  for (const step of plan) {
    log(`typecheck: ${step.name} — ${step.bin} ${step.args.join(' ')}`);
    const r =
      step.bin === 'turbo'
        ? spawn(execPath, [turbo, ...step.args], { cwd: root, stdio: 'inherit' })
        : spawn('pnpm', step.args, { cwd: root, stdio: 'inherit', shell: platform === 'win32' });
    if (r.error) {
      logError(`typecheck: could not start ${step.bin}: ${r.error.message}`);
      return 1;
    }
    if (r.status !== 0) return r.status ?? 1;
  }
  return 0;
}
