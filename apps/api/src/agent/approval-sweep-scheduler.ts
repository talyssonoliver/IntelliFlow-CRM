/**
 * Approval sweep scheduler (PG-198, A6).
 *
 * Runs the escalation/expiry sweep on an interval inside the long-lived API
 * process. Started from `startApiServer` only (never from `createApiServer`,
 * which tests use) and stopped on SIGTERM. Disabled under test, on serverless
 * runtimes (no long-lived process; every instance would sweep) and when
 * `APPROVAL_SWEEP_INTERVAL_MS=0`. Replicas are safe: each tick takes a
 * transaction-scoped advisory lock.
 */

export const DEFAULT_APPROVAL_SWEEP_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
/** The tick in flight, so stop() can wait for it to finish. */
let active: Promise<unknown> | null = null;

/** The interval to use, or 0 when the sweep must not run in this process. */
export function approvalSweepIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  const raw = env.APPROVAL_SWEEP_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_APPROVAL_SWEEP_INTERVAL_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_APPROVAL_SWEEP_INTERVAL_MS;
  return Math.floor(value);
}

export interface StartApprovalSweepOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

/** Start the interval; returns false when disabled or already started. */
export function startApprovalSweep({
  intervalMs,
  run,
  log = console,
}: StartApprovalSweepOptions): boolean {
  if (intervalMs <= 0 || timer !== null) return false;
  timer = setInterval(() => {
    // No new tick once stopped; skip a tick while the previous one is running.
    if (timer === null || running) return;
    running = true;
    active = run()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`[approval-sweep] tick failed: ${message}`);
      })
      .finally(() => {
        running = false;
        active = null;
      });
  }, intervalMs);
  timer.unref?.();
  log.info(`[approval-sweep] started (every ${String(intervalMs)} ms)`);
  return true;
}

export async function stopApprovalSweep(): Promise<void> {
  if (timer !== null) clearInterval(timer);
  timer = null;
  const inflight = active;
  running = false;
  // Let a tick that is mid-flight finish (its commit, notification and audit)
  // before the process exits; the caller's shutdown timeout still caps the wait.
  // run() failures are already logged by the tick itself.
  await inflight?.catch(() => undefined);
}
