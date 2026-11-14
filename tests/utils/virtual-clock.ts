/**
 * Load-independent timing helpers for tests.
 *
 * A wall-clock assertion on mocked code (`performance.now() - start < 50`) measures how busy the
 * machine is, not the code: three pre-ship gates at once failed such tests (2026-11-13). These
 * helpers replace it with two things that do not depend on load:
 *
 *  - `virtualElapsedMs` runs the work on a fake clock and reports how much *virtual* time passed,
 *    i.e. the total of every sleep, backoff and timeout the code waited on. Zero means it never
 *    waited; a 2 s budget fails the moment the code starts a 2 s timer, however fast the CPU is.
 *  - `realBudget` keeps the real-time SLO, but only when REAL_REPO_CHECKS=1 (`pnpm run
 *    test:real-repo`); otherwise the budget is unbounded.
 */
import { vi } from 'vitest';

/** True when the real-time SLO checks are switched on (REAL_REPO_CHECKS=1). */
export const REAL_TIMING = process.env['REAL_REPO_CHECKS'] === '1';

/** The real-time budget `ms` when REAL_REPO_CHECKS=1, otherwise no limit. */
export const realBudget = (ms: number): number => (REAL_TIMING ? ms : Number.POSITIVE_INFINITY);

type Outcome = { ok: true } | { ok: false; error: unknown };

/**
 * Runs `run` on a fake clock, stepping it forward until `run` settles, and returns the virtual
 * milliseconds that passed. Rethrows what `run` throws. Restores real timers afterwards.
 */
export async function virtualElapsedMs(
  run: () => Promise<unknown>,
  capMs = 600_000
): Promise<number> {
  vi.useFakeTimers();
  try {
    const started = Date.now();
    const state: { outcome?: Outcome } = {};
    void run().then(
      () => {
        state.outcome = { ok: true };
      },
      (error: unknown) => {
        state.outcome = { ok: false, error };
      }
    );
    // Jump straight to each pending timer (exact virtual time); with none pending, just let
    // microtasks run. The loop bound stops a run that waits on real I/O from spinning forever.
    for (let i = 0; state.outcome === undefined && i < 100_000; i++) {
      if (Date.now() - started >= capMs) break;
      if (vi.getTimerCount() > 0) await vi.advanceTimersToNextTimerAsync();
      else await vi.advanceTimersByTimeAsync(0);
    }
    if (state.outcome === undefined) {
      throw new Error(`still pending after ${capMs} virtual ms`);
    }
    if (!state.outcome.ok) throw state.outcome.error;
    return Date.now() - started;
  } finally {
    vi.useRealTimers();
  }
}
