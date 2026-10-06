/**
 * Track every real setTimeout a web test file schedules, so the ones still
 * pending when the file ends can be cleared before the DOM environment is torn
 * down.
 *
 * WHY: Radix primitives schedule real timeouts that they do not always clear on
 * unmount. HoverCard's open delay is one (#773); Toast's auto-dismiss timer is
 * another. When one fires after jsdom's teardown, its callback touches
 * `window`/`document`, and the uncaught `ReferenceError: document is not
 * defined` fails the whole shard even though every test passed. It happened on
 * main on 2026-10-05 (Unit Shard 12/20, @radix-ui/react-toast).
 *
 * Clearing happens once, in afterAll, when every test in the file has finished,
 * so no test can observe it. Fake timers are unaffected: vi.useFakeTimers()
 * replaces these functions while it is active and restores them afterwards.
 */

type TimeoutId = ReturnType<typeof setTimeout>;

export interface TimeoutTracker {
  /** Timeouts scheduled and neither fired nor cleared yet. */
  readonly pending: number;
  /** Clear every pending timeout; returns how many were cleared. */
  clearPending(): number;
  /** Put the original setTimeout/clearTimeout back. */
  restore(): void;
}

interface TimerHost {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

export function trackTimeouts(host: TimerHost = globalThis): TimeoutTracker {
  const realSetTimeout = host.setTimeout;
  const realClearTimeout = host.clearTimeout;
  const pending = new Set<TimeoutId>();

  const trackedSetTimeout = function (
    handler: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ): TimeoutId {
    const id: TimeoutId = realSetTimeout(
      (...callArgs: unknown[]) => {
        pending.delete(id);
        if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...callArgs);
      },
      delay,
      ...args
    );
    pending.add(id);
    return id;
  };
  // Keep extra properties such as setTimeout[util.promisify.custom].
  Object.assign(trackedSetTimeout, realSetTimeout);

  const trackedClearTimeout = function (id?: Parameters<typeof clearTimeout>[0]) {
    pending.delete(id as TimeoutId);
    realClearTimeout(id);
  };

  host.setTimeout = trackedSetTimeout as unknown as typeof setTimeout;
  host.clearTimeout = trackedClearTimeout as typeof clearTimeout;

  return {
    get pending() {
      return pending.size;
    },
    clearPending() {
      const n = pending.size;
      for (const id of pending) realClearTimeout(id);
      pending.clear();
      return n;
    },
    restore() {
      host.setTimeout = realSetTimeout;
      host.clearTimeout = realClearTimeout;
    },
  };
}
