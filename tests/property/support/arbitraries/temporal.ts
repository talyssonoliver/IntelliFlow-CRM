/**
 * Temporal arbitraries — instants and intervals for scheduling/booking properties.
 *
 * Bounded to [2020-01-01, 2030-01-01) so generated `Date`s never overflow and
 * durations stay realistic (≤ 8h). The {@link Interval} shape mirrors what the
 * booking aggregate reasons about: a `[start, end)` half-open window.
 *
 * @module tests/property/support/arbitraries/temporal
 */

import fc from 'fast-check';

export interface Interval {
  start: Date;
  end: Date;
}

const MIN_MS = Date.UTC(2020, 0, 1);
const MAX_MS = Date.UTC(2030, 0, 1);
const MAX_DURATION_MS = 1000 * 60 * 60 * 8; // 8 hours
const MIN_DURATION_MS = 1000 * 60 * 5; // 5 minutes

/** An instant within the bounded window. */
export const arbInstant: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_MS, max: MAX_MS })
  .map((ms) => new Date(ms));

/** A valid interval (start < end, 5min..8h). */
export const arbInterval: fc.Arbitrary<Interval> = fc
  .tuple(
    fc.integer({ min: MIN_MS, max: MAX_MS - MAX_DURATION_MS }),
    fc.integer({ min: MIN_DURATION_MS, max: MAX_DURATION_MS })
  )
  .map(([startMs, durMs]) => ({ start: new Date(startMs), end: new Date(startMs + durMs) }));

/**
 * Two intervals that are guaranteed to OVERLAP (share at least one instant).
 * Built by nesting the second interval's start inside the first.
 */
export const arbOverlappingPair: fc.Arbitrary<[Interval, Interval]> = arbInterval.chain((a) => {
  const span = a.end.getTime() - a.start.getTime();
  return fc.integer({ min: 0, max: Math.max(0, span - 1) }).chain((offset) =>
    fc.integer({ min: MIN_DURATION_MS, max: MAX_DURATION_MS }).map((dur) => {
      const start = a.start.getTime() + offset;
      return [a, { start: new Date(start), end: new Date(start + dur) }] as [Interval, Interval];
    })
  );
});

/**
 * Two intervals that are guaranteed to be DISJOINT (b starts strictly after a ends).
 */
export const arbDisjointPair: fc.Arbitrary<[Interval, Interval]> = arbInterval.chain((a) =>
  fc.integer({ min: 1, max: MAX_DURATION_MS }).chain((gap) =>
    fc.integer({ min: MIN_DURATION_MS, max: MAX_DURATION_MS }).map((dur) => {
      const start = a.end.getTime() + gap;
      return [a, { start: new Date(start), end: new Date(start + dur) }] as [Interval, Interval];
    })
  )
);
