/**
 * Job failures that are outcomes, not faults (#1242).
 *
 * A processor marks such an error with `expected: true` (for example the ai-worker's
 * inconclusive scoring: the model answered, without a usable score). The shared worker logs it
 * as a warning instead of an error, so it does not raise error-level alerts. The job still
 * fails: whether it is retried is decided by the error itself (BullMQ's UnrecoverableError).
 */

/** Mark `error` as an expected outcome and return it. */
export function markExpectedJobOutcome<E extends Error>(error: E): E & { expected: true } {
  return Object.assign(error, { expected: true as const });
}

/** True for an error a processor marked as an expected outcome. */
export function isExpectedJobOutcome(error: unknown): boolean {
  return (error as { expected?: unknown } | null)?.expected === true;
}
