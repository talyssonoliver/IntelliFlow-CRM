/**
 * Bounce scanner scheduler (PG-207, Q8).
 *
 * Runs `runBounceScan` on an interval inside the long-lived API process. Same
 * shape as the approval sweep (`apps/api/src/agent/approval-sweep-scheduler.ts`):
 * started from `startApiServer` only, disabled under test, on serverless
 * runtimes and when `EMAIL_BOUNCE_SCAN_INTERVAL_MS=0`. Replicas are safe: each
 * mailbox is claimed with a lease, and an overlapping tick is skipped. Each
 * mailbox is rescanned at most every 10 minutes (its `nextScanAt`); the tick
 * only finds the due ones.
 */

export const DEFAULT_BOUNCE_SCAN_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
/** The tick in flight, so stop() can wait for it to finish. */
let active: Promise<unknown> | null = null;

/** The interval to use, or 0 when the scanner must not run in this process. */
export function bounceScanIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  const raw = env.EMAIL_BOUNCE_SCAN_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_BOUNCE_SCAN_INTERVAL_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_BOUNCE_SCAN_INTERVAL_MS;
  return Math.floor(value);
}

export interface StartBounceScannerOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

/** Start the interval; returns false when disabled or already started. */
export function startBounceScanner({
  intervalMs,
  run,
  log = console,
}: StartBounceScannerOptions): boolean {
  if (intervalMs <= 0 || timer !== null) return false;
  timer = setInterval(() => {
    // No new tick once stopped; skip a tick while the previous one is running.
    if (timer === null || running) return;
    running = true;
    active = run()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`[email-bounce-scan] tick failed: ${message}`);
      })
      .finally(() => {
        running = false;
        active = null;
      });
  }, intervalMs);
  timer.unref?.();
  log.info(`[email-bounce-scan] started (every ${String(intervalMs)} ms)`);
  return true;
}

/** Stops the scanner and waits for a tick in flight (SIGTERM, tests). */
export async function stopBounceScanner(): Promise<void> {
  if (timer !== null) clearInterval(timer);
  timer = null;
  const inflight = active;
  running = false;
  // Let a tick that is mid-flight finish (its commit, notification and audit)
  // before the process exits; the caller's shutdown timeout still caps the wait.
  // run() failures are already logged by the tick itself.
  await inflight?.catch(() => undefined);
}
