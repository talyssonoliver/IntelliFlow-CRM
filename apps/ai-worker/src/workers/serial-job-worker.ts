/**
 * One-job-at-a-time BullMQ worker shared by the scheduled ticket and case jobs
 * (case-deadline-monitor, ticket-auto-close, ticket-sla-monitor), which built
 * the same Worker by hand.
 *
 * @module ai-worker/workers/serial-job-worker
 */

import { Worker, type Job } from 'bullmq';
import { getDrainDelaySeconds } from '@intelliflow/platform/queues/connection';

export interface SerialJobRedisConnection {
  host: string;
  port: number;
  password?: string;
}

export function createSerialJobWorker<TData, TResult>(
  queueName: string,
  process: (job: Job<TData>) => Promise<TResult>,
  connection: SerialJobRedisConnection,
  label: string
): Worker<TData, TResult> {
  const worker = new Worker<TData, TResult>(queueName, async (job) => process(job), {
    connection,
    concurrency: 1,
    drainDelay: getDrainDelaySeconds(),
  });
  worker.on('failed', (job, error) =>
    console.warn(`[${label}] job ${job?.id} failed:`, error?.message)
  );
  return worker;
}
