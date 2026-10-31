/**
 * The api's timer jobs (approval sweep, email bounce scan, DSAR deadline alerts)
 * as a managed worker.
 *
 * Why here: the api service must make no outbound traffic while idle so Railway
 * can sleep it (API_BACKGROUND_JOBS=off). The jobs still have to run somewhere,
 * and this process never sleeps. Enabled with COMBINED_BACKGROUND_JOBS=on.
 *
 * Safe to run alongside an api that still has the jobs on: the approval sweep
 * takes a transaction-scoped Postgres advisory lock each tick, the bounce scan
 * claims each mailbox with a lease, and the DSAR alerts take an advisory lock and
 * claim each request with SKIP LOCKED, so two processes never do the same work
 * twice.
 *
 * @module combined-worker/background-jobs
 */

import type { ComponentCheck, ManagedWorker } from './combined';

/** The slice of `@intelliflow/api`'s background-jobs module used here. */
export interface ApiBackgroundJobsModule {
  startBackgroundJobs(): { approvalSweep: boolean; bounceScan: boolean; dsarSla: boolean };
  stopBackgroundJobs(): Promise<void>;
  /** Last-tick heartbeat judgement; read on request only. */
  checkBackgroundJobsHealth(): Promise<{
    status: 'ok' | 'degraded' | 'unknown';
    message?: string;
  }>;
}

/**
 * @param load Imports the api module lazily: it pulls in the api's DI container
 *   (Prisma, adapters), which must not load unless the jobs are enabled.
 */
export function createBackgroundJobsWorker(
  load: () => Promise<ApiBackgroundJobsModule>,
  log: Pick<Console, 'info'> = console
): ManagedWorker {
  let state = 'idle';
  let jobs: ApiBackgroundJobsModule | undefined;

  return {
    async start() {
      jobs = await load();
      const started = jobs.startBackgroundJobs();
      state = 'running';
      log.info(
        `[background-jobs] approval-sweep=${started.approvalSweep ? 'on' : 'off'} ` +
          `email-bounce-scan=${started.bounceScan ? 'on' : 'off'} ` +
          `dsar-sla=${started.dsarSla ? 'on' : 'off'}`
      );
    },
    async stop() {
      // Waits for a tick that is mid-flight (commit, notification, audit); the
      // combined shutdown timeout still caps the wait.
      await jobs?.stopBackgroundJobs();
      state = 'stopped';
    },
    getStatus() {
      return { state };
    },
    // Joins the combined /health aggregation like the BullMQ workers do. A
    // missing heartbeat is `degraded` (still serving, never 503).
    async checkHealth() {
      const checks: Record<string, ComponentCheck> = {
        timers:
          state === 'running'
            ? { status: 'ok' }
            : { status: 'error', message: `background jobs are ${state}` },
      };
      if (state !== 'running' || !jobs) return checks;
      try {
        const heartbeat = await jobs.checkBackgroundJobsHealth();
        checks.heartbeat =
          heartbeat.status === 'degraded'
            ? { status: 'degraded', message: heartbeat.message }
            : { status: 'ok', ...(heartbeat.message ? { message: heartbeat.message } : {}) };
      } catch (error) {
        checks.heartbeat = {
          status: 'degraded',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      return checks;
    },
  };
}
