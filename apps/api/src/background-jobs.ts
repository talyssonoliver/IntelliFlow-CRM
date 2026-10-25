/**
 * Background jobs the API process can run on timers (approval sweep, email
 * bounce scan).
 *
 * Idle-sleep (Railway App Sleeping): a process that makes outbound traffic while
 * idle never sleeps, and these timers are the traffic. They are therefore behind
 * one flag, `API_BACKGROUND_JOBS`, which defaults to ON (the historical
 * behaviour). Set `API_BACKGROUND_JOBS=off` on the api service and run the same
 * jobs in the combined worker (`COMBINED_BACKGROUND_JOBS=on`), which calls
 * `startBackgroundJobs` from here.
 *
 * Running the jobs in the api AND the combined worker, or in several replicas,
 * is safe: the approval sweep takes a transaction-scoped Postgres advisory lock
 * per tick, and the bounce scan claims each mailbox with a lease. Both are
 * database-level, so they hold across processes.
 */

import {
  approvalSweepIntervalFromEnv,
  startApprovalSweep,
  stopApprovalSweep,
} from './agent/approval-sweep-scheduler';
import { createDefaultSweepDeps, runApprovalSweep } from './agent/approval-escalation-sweep';
import {
  bounceScanIntervalFromEnv,
  startBounceScanner,
  stopBounceScanner,
} from './modules/email/bounce-scheduler';
import { createBounceReaderDeps, runBounceScan } from './modules/email/bounce-reader';
import {
  checkBackgroundJobsHeartbeat,
  closeHeartbeatStore,
  getHeartbeatStore,
  type BackgroundJobsHeartbeatCheck,
  type HeartbeatJob,
  type HeartbeatStore,
} from './background-jobs-heartbeat';

/** Env var that switches the jobs off in the api process. */
export const API_BACKGROUND_JOBS_ENV = 'API_BACKGROUND_JOBS';

const OFF_VALUES = new Set(['off', 'false', '0', 'no', 'disabled']);

/** Longest a tick waits for its heartbeat write before giving up on it. */
export const HEARTBEAT_WRITE_TIMEOUT_MS = 3000;

/**
 * Whether a flag value means "on". Unset or empty is ON (default behaviour);
 * only an explicit off-ish value disables.
 */
export function backgroundJobsFlagEnabled(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  const value = raw.trim().toLowerCase();
  return value === '' || !OFF_VALUES.has(value);
}

/** Whether the api process should run the background jobs. */
export function apiBackgroundJobsEnabled(env: NodeJS.ProcessEnv): boolean {
  return backgroundJobsFlagEnabled(env[API_BACKGROUND_JOBS_ENV]);
}

export interface StartBackgroundJobsOptions {
  env?: NodeJS.ProcessEnv;
  /** Resolves once the DI container is usable; defaults to the api container. */
  ready?: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
  /** Where each finished tick leaves its heartbeat; defaults to the shared Redis store. */
  heartbeat?: HeartbeatStore | null;
}

export interface StartedBackgroundJobs {
  approvalSweep: boolean;
  bounceScan: boolean;
}

async function defaultReady(): Promise<unknown> {
  const { containerReady } = await import('./container.js');
  return containerReady;
}

/**
 * Start the timers. Does NOT check API_BACKGROUND_JOBS: the caller decides
 * (the api checks its own flag, the combined worker checks its own). Each job
 * still honours its own interval env (`*_INTERVAL_MS=0` disables it).
 */
export function startBackgroundJobs({
  env = process.env,
  ready = defaultReady,
  log = console,
  heartbeat = getHeartbeatStore(env),
}: StartBackgroundJobsOptions = {}): StartedBackgroundJobs {
  // Best effort: a heartbeat failure must never fail a tick, and a heartbeat
  // write that stalls must never hold the scheduler (it would block every later
  // sweep), so the wait is capped regardless of the Redis client's own timeouts.
  const beat = async (job: HeartbeatJob): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const write = heartbeat?.record(job, Date.now());
      if (!write) return;
      await Promise.race([
        write,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${HEARTBEAT_WRITE_TIMEOUT_MS}ms`)),
            HEARTBEAT_WRITE_TIMEOUT_MS
          );
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      log.warn(
        `[background-jobs] heartbeat write failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // PG-198: approval escalation/expiry sweep.
  const approvalSweep = startApprovalSweep({
    intervalMs: approvalSweepIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      const report = await runApprovalSweep(await createDefaultSweepDeps());
      await beat('approvalSweep');
      return report;
    },
  });

  // PG-207: bounce scanner — reads delivery reports from connected mailboxes.
  const bounceScan = startBounceScanner({
    intervalMs: bounceScanIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      const report = await runBounceScan(await createBounceReaderDeps());
      await beat('bounceScan');
      return report;
    },
  });

  return { approvalSweep, bounceScan };
}

/**
 * Stop every timer started by `startBackgroundJobs` and wait for a tick that is
 * mid-flight (SIGTERM, tests). The caller's shutdown timeout still caps the wait.
 */
export async function stopBackgroundJobs(): Promise<void> {
  await Promise.all([stopApprovalSweep(), stopBounceScanner()]);
  // After the ticks drained, so their final heartbeat write is not cut off.
  await closeHeartbeatStore().catch(() => undefined);
}

/** Heartbeat health for /health/detailed and the combined worker. Read-only, on request. */
export function checkBackgroundJobsHealth(
  env: NodeJS.ProcessEnv = process.env
): Promise<BackgroundJobsHeartbeatCheck> {
  return checkBackgroundJobsHeartbeat({ env });
}
