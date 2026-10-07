/**
 * Idle blocking time for BullMQ workers.
 *
 * Kept out of connection.ts, which is excluded from coverage as BullMQ wiring;
 * this is a decision with a test (drain-delay.test.ts).
 *
 * @module @intelliflow/platform/queues/drain-delay
 */

/**
 * How long (seconds) an idle BullMQ worker blocks on BZPOPMIN before it wakes
 * and checks again. BullMQ's default is 5 s: with ~14 workers that is ~1,600
 * Redis commands a minute while no job exists. Adding a job writes the queue's
 * marker key, which wakes the blocked worker at once, so a longer block adds
 * no pickup latency (delayed jobs keep their own timer, capped at 10 s by
 * BullMQ). The cost: a silently dropped connection is noticed after
 * drainDelay + 1 s instead of ~6 s.
 */
export const DEFAULT_DRAIN_DELAY_SECONDS = 30;

/** drainDelay for every Worker: `QUEUE_DRAIN_DELAY_SECONDS`, default 30. */
export function getDrainDelaySeconds(): number {
  const fromEnv = Number(process.env.QUEUE_DRAIN_DELAY_SECONDS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_DRAIN_DELAY_SECONDS;
}
