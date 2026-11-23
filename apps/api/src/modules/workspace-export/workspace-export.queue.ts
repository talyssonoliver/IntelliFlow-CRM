/**
 * Producer side of the workspace-export queue (the consumer is the ai-worker's
 * `workspace-export-worker.ts`). Best-effort by design: the request row is the source of truth
 * and the worker's sweep re-queues a row whose job never arrived.
 */
import {
  WORKSPACE_EXPORT_JOB,
  WORKSPACE_EXPORT_QUEUE,
  type ExportEnqueue,
} from '@intelliflow/adapters';
import { enqueueOneShot } from '../../lib/queue-producer';

/**
 * One job per request; every re-queue gets an id of its own. BullMQ silently drops an add whose
 * id it still holds (a failed job is kept for 7 days), so a re-queue must never reuse one.
 */
export const enqueueWorkspaceExport: ExportEnqueue = async ({ requestId, tenantId }, opts) => {
  await enqueueOneShot(
    WORKSPACE_EXPORT_QUEUE,
    WORKSPACE_EXPORT_JOB,
    { requestId, tenantId },
    {
      jobId: opts ? `${requestId}-requeue-${Date.now()}` : requestId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 3_600, count: 100 },
      removeOnFail: { age: 7 * 24 * 3_600, count: 200 },
    }
  );
};
