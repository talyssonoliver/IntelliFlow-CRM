/**
 * Workspace export queue consumer (agreement clause 5: a leaving customer gets a standalone copy
 * of their data within 14 days).
 *
 * Consumes `intelliflow-workspace-export`:
 *   - `workspace:export`        build one tenant's ZIP, store it privately, sign a 14-day link and
 *                               email it (the work is in @intelliflow/adapters, workspace-export/)
 *   - `workspace:export-sweep`  every 5 minutes: re-queue lost or stuck requests, retry unsent
 *                               emails, expire links past 14 days and delete their archives
 *
 * The email goes out through the existing system mail path: a job on the notification-email queue
 * (consumed by notification-email-worker.ts), which resolves the recipient from the user id and
 * sends through the production email adapter. The job data carries the signed link, so the queue
 * keeps finished jobs for one hour only.
 *
 * Mirrors notification-email-worker.ts: dependencies are injected so the processor is testable
 * without Redis, Prisma or Supabase; only the boot path in ai-worker.ts builds the real ones.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type pino from 'pino';
import { z } from 'zod';
import {
  WORKSPACE_EXPORT_JOB,
  WORKSPACE_EXPORT_QUEUE,
  WORKSPACE_EXPORT_SWEEP_JOB,
  processWorkspaceExport,
  sweepWorkspaceExports,
  type ExportEnqueue,
  type ExportJobDeps,
  type ExportMail,
} from '@intelliflow/adapters';
import { EMAIL_NOTIFICATIONS_QUEUE } from './notification-email-worker.js';

export { WORKSPACE_EXPORT_QUEUE };

const ExportJobDataSchema = z.object({
  requestId: z.string().min(1).max(64),
  tenantId: z.string().min(1).max(64).optional(),
});

type RedisConnection = { host: string; port: number; password?: string; username?: string };

const SWEEP_EVERY_MS = 5 * 60 * 1000;

export interface WorkspaceExportWorkerHandle {
  stop(): Promise<void>;
}

/** Job handler: routes by job name. Exported for tests. */
export async function processWorkspaceExportJob(
  job: Pick<Job, 'name' | 'data'>,
  deps: ExportJobDeps,
  enqueue: ExportEnqueue
): Promise<unknown> {
  if (job.name === WORKSPACE_EXPORT_SWEEP_JOB) {
    return sweepWorkspaceExports(deps, enqueue);
  }
  if (job.name === WORKSPACE_EXPORT_JOB) {
    const input = ExportJobDataSchema.parse(job.data);
    return processWorkspaceExport(deps, { requestId: input.requestId });
  }
  throw new Error(`Unknown workspace export job: ${job.name}`);
}

export async function bootWorkspaceExportWorker(
  redisConnection: RedisConnection,
  deps: Omit<ExportJobDeps, 'sendEmail'>,
  logger: pino.Logger
): Promise<WorkspaceExportWorkerHandle> {
  const workerLogger = logger.child({ component: 'workspace-export-worker' });

  const queue = new Queue(WORKSPACE_EXPORT_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30_000 },
      removeOnComplete: { age: 3_600, count: 100 },
      removeOnFail: { age: 7 * 24 * 3_600, count: 200 },
    },
  });
  queue.on('error', (err) =>
    workerLogger.warn({ err: err.message }, 'workspace export queue error')
  );
  const mailQueue = new Queue(EMAIL_NOTIFICATIONS_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2000 },
      // The job carries a signed link: do not keep finished jobs around.
      removeOnComplete: { age: 3_600, count: 100 },
      removeOnFail: { age: 24 * 3_600, count: 100 },
    },
  });

  mailQueue.on('error', (err) => workerLogger.warn({ err: err.message }, 'mail queue error'));

  const sendEmail = async (mail: ExportMail): Promise<void> => {
    await mailQueue.add('notification:email', {
      type: 'workspace_export_ready',
      recipientUserId: mail.recipientUserId,
      tenantId: mail.tenantId,
      subject: mail.subject,
      body: mail.body,
      entityType: 'workspace_export',
    });
  };

  // A re-queue gets an id of its own: BullMQ silently drops an add whose id it still holds, and a
  // failed job keeps its id for 7 days.
  const enqueue: ExportEnqueue = async ({ requestId, tenantId }, opts) => {
    await queue.add(
      WORKSPACE_EXPORT_JOB,
      { requestId, tenantId },
      { jobId: opts ? `${requestId}-requeue-${Date.now()}` : requestId }
    );
  };

  const jobDeps: ExportJobDeps = { ...deps, sendEmail, log: workerLogger };

  const worker = new Worker(
    WORKSPACE_EXPORT_QUEUE,
    (job) => processWorkspaceExportJob(job, jobDeps, enqueue),
    // One export at a time per process: each is I/O heavy and streams, but a customer's whole
    // workspace is the largest thing this worker does.
    { connection: redisConnection, concurrency: 1, lockDuration: 10 * 60 * 1000 }
  );
  worker.on('error', (err) =>
    workerLogger.warn({ err: err.message }, 'workspace export worker error')
  );
  worker.on('failed', (job, error) => {
    workerLogger.warn(
      { jobId: job?.id, name: job?.name, err: error?.message },
      'workspace export job failed'
    );
  });

  const closeAll = async (): Promise<void> => {
    await worker.close();
    await Promise.all([queue.close(), mailQueue.close()]);
  };

  // Repeatable sweep: one scheduler id, so restarts and several workers do not multiply it.
  try {
    await queue.upsertJobScheduler(
      'workspace-export-sweep',
      { every: SWEEP_EVERY_MS },
      { name: WORKSPACE_EXPORT_SWEEP_JOB, data: {}, opts: { attempts: 1 } }
    );
  } catch (err) {
    // No handle is returned on failure, so nothing else would ever close the live Worker.
    await closeAll().catch(() => undefined);
    throw err;
  }

  workerLogger.info({ queue: WORKSPACE_EXPORT_QUEUE }, 'Workspace export worker started');

  return {
    async stop(): Promise<void> {
      await closeAll();
      workerLogger.info('Workspace export worker stopped');
    },
  };
}
