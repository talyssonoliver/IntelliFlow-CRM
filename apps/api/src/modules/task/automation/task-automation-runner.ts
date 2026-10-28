/**
 * Task automation runner — PG-208 (ADR-084).
 *
 * Runs the automation tick (drain buffered events, enqueue due schedules,
 * execute pending runs, maintenance) on an interval inside the long-lived API
 * process, like the approval sweep (`agent/approval-sweep-scheduler.ts`).
 * Started from `startApiServer` only (never from `createApiServer`, which tests
 * use) and stopped on SIGTERM. Disabled under test, on serverless runtimes (no
 * long-lived process) and when `TASK_AUTOMATION_INTERVAL_MS=0`. Replicas are
 * safe: schedule slots and pending runs are claimed with conditional updates.
 */

export const DEFAULT_TASK_AUTOMATION_INTERVAL_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** The interval to use, or 0 when the runner must not run in this process. */
export function taskAutomationRunnerIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  const raw = env.TASK_AUTOMATION_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_TASK_AUTOMATION_INTERVAL_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_TASK_AUTOMATION_INTERVAL_MS;
  return Math.floor(value);
}

export interface StartTaskAutomationRunnerOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

/** Start the interval; returns false when disabled or already started. */
export function startTaskAutomationRunner({
  intervalMs,
  run,
  log = console,
}: StartTaskAutomationRunnerOptions): boolean {
  if (intervalMs <= 0 || timer !== null) return false;
  timer = setInterval(() => {
    // Skip a tick while the previous one is still running.
    if (running) return;
    running = true;
    run()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`[task-automation] tick failed: ${message}`);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  log.info(`[task-automation] runner started (every ${String(intervalMs)} ms)`);
  return true;
}

export function stopTaskAutomationRunner(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  running = false;
}
