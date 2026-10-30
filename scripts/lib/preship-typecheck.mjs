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
 * itself (scripts/run-typecheck.mjs).
 */

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
