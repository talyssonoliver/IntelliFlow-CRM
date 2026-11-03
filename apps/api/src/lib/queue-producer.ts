/**
 * Short-lived BullMQ queues for API request paths.
 *
 * Connections come from `getBullMQConnectionOptions`, so they carry the Redis
 * password, username, db and TLS setting. A request path must also never leave a
 * handle retrying a refused or dead Redis, so these connections give up quickly,
 * every queue has an error listener, and closing is bounded and always runs.
 *
 * - `enqueueOneShot`: add one job and close. Throws if it could not be added.
 * - `withRequestReplyQueue`: add a job and wait for its result with QueueEvents.
 * - `withQueueReader`: read job state, allowing for slower commands.
 */
import type { ConnectionOptions, Job, JobsOptions } from 'bullmq';
import { loadBullMQ } from './load-bullmq';

/**
 * Hard ceiling for one Redis operation (connect, add, close). Generous enough that a
 * healthy Redis never trips it, small enough that a dead Redis can't stall the request.
 */
export const REDIS_OP_TIMEOUT_MS = 2_000;

/** Reads can return many jobs, so they get longer than a single add. */
const REDIS_READ_TIMEOUT_MS = 10_000;

type QueueLike = {
  close: () => PromiseLike<unknown>;
  disconnect?: () => PromiseLike<unknown>;
};

async function sharedConnection(): Promise<Record<string, unknown>> {
  const { getBullMQConnectionOptions } = await import('@intelliflow/platform/queues/connection');
  return getBullMQConnectionOptions() as Record<string, unknown>;
}

/**
 * Never reconnect (that leaks the handle and makes close() block), and don't buffer
 * commands while disconnected, so a failure rejects at once instead of committing later.
 */
async function failFastConnection(commandTimeoutMs: number): Promise<ConnectionOptions> {
  return {
    ...(await sharedConnection()),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_OP_TIMEOUT_MS,
    commandTimeout: commandTimeoutMs,
    retryStrategy: () => null,
  } as ConnectionOptions;
}

/** QueueEvents blocks on Redis, so BullMQ needs maxRetriesPerRequest null and no command timeout. */
async function blockingConnection(): Promise<ConnectionOptions> {
  return {
    ...(await sharedConnection()),
    maxRetriesPerRequest: null,
    connectTimeout: REDIS_OP_TIMEOUT_MS,
    retryStrategy: () => null,
  } as ConnectionOptions;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'unknown error');

/** BullMQ reports connection errors as events. Without a listener they go nowhere useful. */
function logQueueError(queueName: string) {
  return (error: Error) => {
    console.warn(`[queue] redis error queue=${queueName}: ${errorText(error)}`);
  };
}

/**
 * Resolve/reject with `value`, but reject after `ms` regardless. The timer is cleared on
 * settle and unref'ed, so it can never keep the event loop alive by itself.
 */
function withTimeout<T>(value: PromiseLike<T> | T, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('redis op timed out')), ms);
    (timer as { unref?: () => void }).unref?.();
    Promise.resolve(value).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Release the connection without letting a stuck close hang or mask the caller's result. */
async function closeBounded(queue: QueueLike): Promise<void> {
  try {
    await withTimeout(queue.close(), REDIS_OP_TIMEOUT_MS);
  } catch {
    if (typeof queue.disconnect === 'function') {
      try {
        await withTimeout(queue.disconnect(), REDIS_OP_TIMEOUT_MS);
      } catch {
        // The connection is set never to reconnect, so nothing more can be done.
      }
    }
  }
}

/** Add one job and close. Throws if it could not be added; the failure is also logged. */
export async function enqueueOneShot(
  queueName: string,
  jobName: string,
  data: Record<string, unknown>,
  options?: JobsOptions
): Promise<Job> {
  const { Queue } = await loadBullMQ();
  const queue = new Queue(queueName, {
    connection: await failFastConnection(REDIS_OP_TIMEOUT_MS),
  });
  queue.on('error', logQueueError(queueName));
  try {
    return options ? await queue.add(jobName, data, options) : await queue.add(jobName, data);
  } catch (error) {
    console.warn(`[queue] enqueue failed queue=${queueName}: ${errorText(error)}`);
    throw error;
  } finally {
    await closeBounded(queue);
  }
}

/** Run `work` with a queue and its events, for a job whose result the request waits on. */
export async function withRequestReplyQueue<T>(
  queueName: string,
  work: (
    queue: InstanceType<Awaited<ReturnType<typeof loadBullMQ>>['Queue']>,
    events: InstanceType<Awaited<ReturnType<typeof loadBullMQ>>['QueueEvents']>
  ) => Promise<T>
): Promise<T> {
  const { Queue, QueueEvents } = await loadBullMQ();
  const queue = new Queue(queueName, {
    connection: await failFastConnection(REDIS_OP_TIMEOUT_MS),
  });
  const events = new QueueEvents(queueName, { connection: await blockingConnection() });
  queue.on('error', logQueueError(queueName));
  events.on('error', logQueueError(queueName));
  try {
    return await work(queue, events);
  } finally {
    await closeBounded(events);
    await closeBounded(queue);
  }
}

/** Run `work` against a queue that is only read. */
export async function withQueueReader<T>(
  queueName: string,
  work: (queue: InstanceType<Awaited<ReturnType<typeof loadBullMQ>>['Queue']>) => Promise<T>
): Promise<T> {
  const { Queue } = await loadBullMQ();
  const queue = new Queue(queueName, {
    connection: await failFastConnection(REDIS_READ_TIMEOUT_MS),
  });
  queue.on('error', logQueueError(queueName));
  try {
    return await work(queue);
  } finally {
    await closeBounded(queue);
  }
}
