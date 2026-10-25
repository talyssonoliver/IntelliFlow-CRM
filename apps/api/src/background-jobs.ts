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

/** Env var that switches the jobs off in the api process. */
export const API_BACKGROUND_JOBS_ENV = 'API_BACKGROUND_JOBS';

const OFF_VALUES = new Set(['off', 'false', '0', 'no', 'disabled']);

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
}: StartBackgroundJobsOptions = {}): StartedBackgroundJobs {
  // PG-198: approval escalation/expiry sweep.
  const approvalSweep = startApprovalSweep({
    intervalMs: approvalSweepIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      return runApprovalSweep(await createDefaultSweepDeps());
    },
  });

  // PG-207: bounce scanner — reads delivery reports from connected mailboxes.
  const bounceScan = startBounceScanner({
    intervalMs: bounceScanIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      return runBounceScan(await createBounceReaderDeps());
    },
  });

  return { approvalSweep, bounceScan };
}

/** Stop every timer started by `startBackgroundJobs` (SIGTERM, tests). */
export function stopBackgroundJobs(): void {
  stopApprovalSweep();
  stopBounceScanner();
}
