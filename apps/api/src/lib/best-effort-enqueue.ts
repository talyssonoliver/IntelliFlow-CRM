/**
 * Best-effort fire-and-forget enqueue for API request paths.
 *
 * Several contact/lead procedures kick off a background AI job (enrichment, scoring) as a
 * best-effort side effect. They must NOT:
 *   - block the request when Redis is unavailable, or
 *   - leak an ioredis handle that retries a dead Redis forever.
 *
 * The previous ad-hoc pattern (`new Queue(...)` → `await queue.add()` → `await queue.close()`)
 * did both: `close()` only ran on the success path (so a failed `add()` leaked the connection),
 * and BullMQ's default connection retries Redis indefinitely while `queue.close()` blocks waiting
 * for a graceful quit that never completes on a dead Redis. In Redis-less environments (e.g. the
 * unit-test shards) that leaked handle hung the process. See contact.router.ts.
 *
 * This helper uses a PRODUCER connection that gives up quickly (a couple of fast retries to ride
 * out a transient blip, then no reconnection) and always closes the queue in a `finally`, so the
 * call returns promptly and never leaks — whether Redis is up, blipping, or down. A
 * Redis-unavailable enqueue is treated as a no-op (the job is best-effort).
 *
 * @returns `true` if the job was actually enqueued, `false` if Redis/BullMQ was unavailable and the
 *   enqueue was skipped. Pure fire-and-forget callers can ignore it; callers that report enqueue
 *   status back to the client (e.g. `generateInsight`'s `{ enqueued }` contract) must honour it.
 */
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { loadBullMQ } from './load-bullmq';

export async function enqueueBestEffort(
  queueName: string,
  jobName: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    const { Queue } = await loadBullMQ();
    const queue = new Queue(queueName, {
      connection: {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        // Producer-only, best-effort: do NOT retry a dead Redis indefinitely (that leaks the
        // ioredis handle and makes close() block forever). A couple of fast retries cover a
        // transient blip; after that ioredis stops reconnecting and add() fails fast.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 100, 200)),
      },
    });
    try {
      await queue.add(jobName, data);
      return true;
    } finally {
      // Always release the connection — even if add() threw — without letting a dead-Redis
      // close() hang (the fail-fast connection above means there is nothing to wait for).
      // try/catch (not .catch()) so a close() that returns a non-thenable never masks the
      // add() result.
      try {
        await queue.close();
      } catch {
        /* ignore close errors on a dead/closing connection */
      }
    }
  } catch {
    // Redis/BullMQ unavailable — best-effort enqueue, skip silently.
    return false;
  }
}
