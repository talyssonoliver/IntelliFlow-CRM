/**
 * The api's timer jobs (approval sweep, email bounce scan) as a managed worker.
 *
 * Why here: the api service must make no outbound traffic while idle so Railway
 * can sleep it (API_BACKGROUND_JOBS=off). The jobs still have to run somewhere,
 * and this process never sleeps. Enabled with COMBINED_BACKGROUND_JOBS=on.
 *
 * Safe to run alongside an api that still has the jobs on: the approval sweep
 * takes a transaction-scoped Postgres advisory lock each tick and the bounce
 * scan claims each mailbox with a lease, so two processes never do the same
 * work twice.
 *
 * @module combined-worker/background-jobs
 */

import type { ManagedWorker } from './combined';

/** The slice of `@intelliflow/api`'s background-jobs module used here. */
export interface ApiBackgroundJobsModule {
  startBackgroundJobs(): { approvalSweep: boolean; bounceScan: boolean };
  stopBackgroundJobs(): void;
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
          `email-bounce-scan=${started.bounceScan ? 'on' : 'off'}`
      );
    },
    async stop() {
      jobs?.stopBackgroundJobs();
      state = 'stopped';
    },
    getStatus() {
      return { state };
    },
    // Joins the combined /health aggregation like the BullMQ workers do.
    async checkHealth() {
      return {
        timers:
          state === 'running'
            ? { status: 'ok' }
            : { status: 'error', message: `background jobs are ${state}` },
      };
    },
  };
}
