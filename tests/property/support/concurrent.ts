/**
 * Concurrent-request helpers for race-condition tests.
 *
 * `Promise.all` rejects on the first error and hides how many operations
 * actually succeeded — useless for asserting "exactly one of N concurrent
 * writers wins". These helpers run N logically-simultaneous operations and
 * return a structured tally of fulfilled vs rejected outcomes.
 *
 * For *deterministic* interleavings (not just OS-scheduler luck) prefer the
 * `support/scheduler.ts` harness; use these for real-DB tests where the database
 * itself is the source of contention.
 *
 * @module tests/property/support/concurrent
 */

export interface OutcomeTally<T> {
  fulfilled: T[];
  rejected: unknown[];
  fulfilledCount: number;
  rejectedCount: number;
  total: number;
}

/**
 * Run `n` operations concurrently and collect every outcome (never throws).
 * `factory(i)` builds the i-th operation; all are started in the same tick.
 */
export async function runConcurrently<T>(
  n: number,
  factory: (i: number) => Promise<T>
): Promise<OutcomeTally<T>> {
  const settled = await Promise.allSettled(Array.from({ length: n }, (_unused, i) => factory(i)));
  return tally(settled);
}

/** Run an explicit list of operations concurrently and collect every outcome. */
export async function runAllConcurrently<T>(
  ops: Array<() => Promise<T>>
): Promise<OutcomeTally<T>> {
  const settled = await Promise.allSettled(ops.map((op) => op()));
  return tally(settled);
}

/** Summarise `Promise.allSettled` results into a structured tally. */
export function tally<T>(settled: PromiseSettledResult<T>[]): OutcomeTally<T> {
  const fulfilled: T[] = [];
  const rejected: unknown[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') fulfilled.push(r.value);
    else rejected.push(r.reason);
  }
  return {
    fulfilled,
    rejected,
    fulfilledCount: fulfilled.length,
    rejectedCount: rejected.length,
    total: settled.length,
  };
}
