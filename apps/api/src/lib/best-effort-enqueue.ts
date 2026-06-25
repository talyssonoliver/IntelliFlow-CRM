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
 * This helper uses a PRODUCER connection that gives up quickly and bounds EVERY Redis-unavailable
 * mode — connection refused, a blackhole host that drops packets (no refusal), and a hung close —
 * so the call always returns promptly and never leaks:
 *   - `enableOfflineQueue:false` + `maxRetriesPerRequest:1` → `add()` fails fast when disconnected;
 *   - `connectTimeout`/`commandTimeout` → a silently-dropping host can't stall the TCP connect or an
 *     in-flight command for ioredis's 10s default;
 *   - `retryStrategy` stops reconnecting after a couple of fast retries (rides a transient blip,
 *     then releases the handle);
 *   - close() (whose result is discarded) gets a hard `withTimeout` backstop and always runs in
 *     `finally`.
 * The `add()` result is taken straight from ioredis (bounded by the connection settings above) so
 * it is AUTHORITATIVE — we never wrap it in a local timeout that would detach a still-running
 * add and mis-report it. A Redis-unavailable enqueue is treated as a no-op (the job is
 * best-effort). NOTE: like any networked write, a client-aborted command (commandTimeout) may have
 * already committed server-side; that is acceptable here because these jobs are best-effort and
 * their workers are idempotent (e.g. `contactAIInsight.upsert`), so a rare duplicate is harmless
 * and under-reporting `{ enqueued:false }` is the safe direction.
 *
 * @returns `true` if the job was actually enqueued, `false` if Redis/BullMQ was unavailable and the
 *   enqueue was skipped. Pure fire-and-forget callers can ignore it; callers that report enqueue
 *   status back to the client (e.g. `generateInsight`'s `{ enqueued }` contract) must honour it.
 */
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { loadBullMQ } from './load-bullmq';

/**
 * Hard ceiling for any single Redis operation (connect, add, close). Generous enough that a
 * healthy Redis never trips it, small enough that a dead/blackhole Redis can't stall the request.
 */
const REDIS_OP_TIMEOUT_MS = 2_000;

/**
 * Resolve/reject with `p`, but reject after `ms` no matter what. `Promise.resolve` first so a mock
 * (or anything) returning a non-thenable is tolerated. The timer is cleared on settle and `unref`ed
 * so it can never by itself keep the event loop (or a test worker) alive.
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
        // One-shot best-effort producer: never reconnect (that leaks the ioredis handle and makes
        // close() block forever). On the first connect/command failure ioredis gives up and add()
        // rejects authoritatively — no buffered/detached command that could commit later.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        // Bound the TCP connect and any in-flight command so a host that silently drops packets
        // (no connection refusal) can't stall for ioredis's 10s default. A single connect attempt
        // within this window still rides a sub-second blip; longer outages fail fast (best-effort).
        connectTimeout: REDIS_OP_TIMEOUT_MS,
        commandTimeout: REDIS_OP_TIMEOUT_MS,
        retryStrategy: () => null,
      },
    });
    try {
      // No local timeout wrapper here: the connection settings above already bound add() and the
      // rejection ioredis returns is authoritative, so we never detach a still-running add.
      await queue.add(jobName, data);
      return true;
    } finally {
      // Always release the connection — even if add() threw or timed out — without letting a
      // dead-Redis close() hang. Bounded + try/catch so a slow/non-thenable close() can never
      // mask the add() result.
      try {
        await withTimeout(queue.close(), REDIS_OP_TIMEOUT_MS);
      } catch {
        // Graceful close hung or failed (e.g. Redis dropped mid-QUIT). Force-disconnect so the
        // ioredis handle is actually torn down instead of lingering — the whole point of this
        // helper. (retryStrategy:()=>null already stops reconnects; this covers a stuck QUIT.)
        if (typeof queue.disconnect === 'function') {
          try {
            await withTimeout(queue.disconnect(), REDIS_OP_TIMEOUT_MS);
          } catch {
            /* nothing more we can do — the connection is set to never reconnect */
          }
        }
      }
    }
  } catch {
    // Redis/BullMQ unavailable — best-effort enqueue, skip silently.
    return false;
  }
}
