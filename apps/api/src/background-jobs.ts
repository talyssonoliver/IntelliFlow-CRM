/**
 * Background jobs the API process can run on timers (approval sweep, email
 * bounce scan, Outlook inbox sync with the Google Calendar sync, DSAR deadline alerts, the hourly
 * clearing of expired kept file locations).
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
 * per tick, the bounce scan and the inbox sync claim each mailbox with a lease, and the DSAR alerts
 * take an advisory lock and claim each request with SKIP LOCKED. All are
 * database-level, so they hold across processes.
 */

import {
  approvalSweepIntervalFromEnv,
  startApprovalSweep,
  stopApprovalSweep,
} from './agent/approval-sweep-scheduler';
import { runWithEgressJob } from '@intelliflow/db';
import { createDefaultSweepDeps, runApprovalSweep } from './agent/approval-escalation-sweep';
import {
  bounceScanIntervalFromEnv,
  startBounceScanner,
  stopBounceScanner,
} from './modules/email/bounce-scheduler';
import { createBounceReaderDeps, runBounceScan } from './modules/email/bounce-reader';
import { calendarSyncEnabled, runCalendarSyncTick } from './modules/calendar/google-calendar-sync';
import { createInboxSyncDeps, runInboxSync } from './modules/email/outlook-inbox-sync';
import {
  inboxSyncIntervalFromEnv,
  startInboxSync,
  stopInboxSync,
} from './modules/email/inbox-sync-scheduler';
import {
  createDsarSlaDeps,
  dsarSlaIntervalFromEnv,
  runDsarSlaSweep,
  startDsarSlaScheduler,
  stopDsarSlaScheduler,
} from './modules/privacy/dsar-sla-scheduler';
import {
  complianceSnapshotIntervalFromEnv,
  createComplianceSnapshotDb,
  runComplianceSnapshots,
  startComplianceSnapshotScheduler,
  stopComplianceSnapshotScheduler,
} from './modules/compliance/compliance-snapshot-scheduler';
import {
  createKeptLocationsStore,
  keptLocationsIntervalFromEnv,
  runKeptLocationsSweep,
  startKeptLocationsScheduler,
  stopKeptLocationsScheduler,
} from './modules/privacy/dsar-kept-locations-scheduler';
import {
  checkBackgroundJobsHeartbeat,
  closeHeartbeatStore,
  getHeartbeatStore,
  markJobsRunningHere,
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
  inboxSync: boolean;
  dsarSla: boolean;
  complianceSnapshot: boolean;
  keptLocations: boolean;
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
      const report = await runWithEgressJob('api.approvalSweep', async () =>
        runApprovalSweep(await createDefaultSweepDeps())
      );
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
      const report = await runWithEgressJob('api.bounceScan', async () =>
        runBounceScan(await createBounceReaderDeps())
      );
      await beat('bounceScan');
      return report;
    },
  });

  // #1177: Outlook inbox sync, on its own timer so a slow Graph read never holds the bounce scan. MVP-013:
  // the Google Calendar sync runs in the same tick, so it shares this timer and its off switch.
  const inboxSync = startInboxSync({
    intervalMs: inboxSyncIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      try {
        return await runWithEgressJob('api.inboxSync', async () =>
          runInboxSync(await createInboxSyncDeps())
        );
      } finally {
        // MVP-013: Google Calendar, both ways, in the same tick (it never throws; GOOGLE_CALENDAR_SYNC=off).
        await runWithEgressJob('api.calendarSync', () => runCalendarSyncTick(env, log));
      }
    },
  });

  // The calendar sync rides on the inbox timer: with that timer off (its interval 0) it does not run.
  if (!inboxSync && calendarSyncEnabled(env)) {
    log.info(
      '[calendar-sync] not running: the inbox sync timer is off, and the calendar sync runs in its tick'
    );
  }

  // PG-203 D8: DSAR deadline alerts to each firm's admins, and the purge of
  // expired unconfirmed requests.
  const dsarSla = startDsarSlaScheduler({
    intervalMs: dsarSlaIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      const report = await runWithEgressJob('api.dsarSla', async () =>
        runDsarSlaSweep(await createDsarSlaDeps())
      );
      await beat('dsarSla');
      return report;
    },
  });

  // PG-194: the daily compliance snapshots that feed the dashboard's trend. Not a heartbeat job:
  // a missed tick only delays a trend point, it never leaves a customer waiting.
  const complianceSnapshot = startComplianceSnapshotScheduler({
    intervalMs: complianceSnapshotIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      return runComplianceSnapshots(await createComplianceSnapshotDb(), new Date(), log);
    },
  });

  // IFC-316: the (hourly, idempotent) clearing of the locations kept for files an erasure left outside the CRM's
  // storage, 30 days after the erasure. Not a heartbeat job: a missed tick is caught by the next one, an hour later.
  const keptLocations = startKeptLocationsScheduler({
    intervalMs: keptLocationsIntervalFromEnv(env),
    log,
    run: async () => {
      await ready();
      return runKeptLocationsSweep(await createKeptLocationsStore());
    },
  });

  markJobsRunningHere(approvalSweep || bounceScan || dsarSla);
  return { approvalSweep, bounceScan, inboxSync, dsarSla, complianceSnapshot, keptLocations };
}

/**
 * Stop every timer started by `startBackgroundJobs` and wait for a tick that is
 * mid-flight (SIGTERM, tests). The caller's shutdown timeout still caps the wait.
 */
export async function stopBackgroundJobs(): Promise<void> {
  await Promise.all([
    stopApprovalSweep(),
    stopBounceScanner(),
    stopInboxSync(),
    stopDsarSlaScheduler(),
    stopComplianceSnapshotScheduler(),
    stopKeptLocationsScheduler(),
  ]);
  markJobsRunningHere(false);
  // After the ticks drained, so their final heartbeat write is not cut off.
  await closeHeartbeatStore().catch(() => undefined);
}

/** Heartbeat health for /health/detailed and the combined worker. Read-only, on request. */
export function checkBackgroundJobsHealth(
  env: NodeJS.ProcessEnv = process.env
): Promise<BackgroundJobsHeartbeatCheck> {
  return checkBackgroundJobsHeartbeat({ env });
}
