/**
 * Best-effort fire-and-forget enqueue for API request paths.
 *
 * Several contact/lead procedures kick off a background AI job (enrichment, scoring) as a
 * best-effort side effect. They must not block the request when Redis is unavailable, or leak an
 * ioredis handle that retries a dead Redis forever. `enqueueOneShot` handles both, for a refused
 * connection, a host that drops packets and a hung close. See `queue-producer.ts`.
 *
 * A failed enqueue is treated as a no-op (the job is best-effort) and is logged. Note that, like
 * any networked write, a client-aborted command (commandTimeout) may already have committed on
 * the server. That is acceptable here because these jobs are best-effort and their workers are
 * idempotent (e.g. `contactAIInsight.upsert`), so a rare duplicate is harmless and under-reporting
 * `{ enqueued:false }` is the safe direction.
 *
 * @returns `true` if the job was actually enqueued, `false` if Redis/BullMQ was unavailable and the
 *   enqueue was skipped. Pure fire-and-forget callers can ignore it; callers that report enqueue
 *   status back to the client (e.g. `generateInsight`'s `{ enqueued }` contract) must honour it.
 */
import { enqueueOneShot } from './queue-producer';

export async function enqueueBestEffort(
  queueName: string,
  jobName: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    await enqueueOneShot(queueName, jobName, data);
    return true;
  } catch {
    return false;
  }
}
