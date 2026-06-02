/**
 * Deterministic async-interleaving harness built on `fc.scheduler()`.
 *
 * `Promise.all` only explores whatever interleaving the event loop happens to
 * produce — usually the same one every time, so it rarely reproduces a race.
 * `fc.scheduler()` makes fast-check *choose* the interleaving and shrink it, so
 * a discovered race comes with a minimal, replayable ordering.
 *
 * Usage inside a property:
 *
 *   await fc.assert(
 *     fc.asyncProperty(fc.scheduler(), async (s) => {
 *       const calls = scheduleAll(s, [serviceA(), serviceB()]);
 *       await s.waitAll();
 *       const results = await settle(calls);
 *       // assert the invariant on final state / results
 *     }),
 *     propertyParams(),
 *   );
 *
 * @module tests/property/support/scheduler
 */

import fc, { type Scheduler as FcScheduler } from 'fast-check';

/** A concrete fast-check scheduler instance (controls async resolution order). */
export type Scheduler = FcScheduler;

/** The `fc.scheduler()` arbitrary — pass as a property input. */
export function schedulerArb(): fc.Arbitrary<Scheduler> {
  return fc.scheduler();
}

/**
 * Hand a set of in-flight promises to the scheduler so their resolution order
 * is controlled by fast-check. Returns the *scheduled* promises (resolve in an
 * order chosen by the scheduler, not the order they were created).
 */
export function scheduleAll<T>(s: Scheduler, promises: Array<Promise<T>>): Array<Promise<T>> {
  return promises.map((p) => s.schedule(p));
}

/**
 * Schedule a set of thunks as logically-simultaneous operations. Each thunk is
 * invoked now (kicking off its async work) and its promise is placed under
 * scheduler control.
 */
export function interleave<T>(s: Scheduler, thunks: Array<() => Promise<T>>): Array<Promise<T>> {
  return thunks.map((t) => s.schedule(Promise.resolve().then(t)));
}

/** Drain every scheduled task in a fast-check-chosen order. */
export async function drain(s: Scheduler): Promise<void> {
  while (s.count() > 0) {
    await s.waitOne();
  }
}

/** Collect outcomes of scheduled promises without throwing (mirrors allSettled). */
export async function settle<T>(promises: Array<Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(promises);
}
