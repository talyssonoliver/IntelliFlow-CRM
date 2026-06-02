/**
 * Property tests for the `DateRange` value object (pure domain — no infrastructure).
 *
 * These overlap/ordering laws underpin the booking double-booking concurrency
 * tests (RACE-BOOKI-*): if `overlaps` were not symmetric, conflict detection
 * would be direction-dependent. Pure-domain foundation for the booking arbitraries.
 *
 * @see docs/operations/property-testing/invariant-ledger.md
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { DateRange } from '@intelliflow/domain';
import {
  arbInterval,
  arbOverlappingPair,
  arbDisjointPair,
} from '../../support/arbitraries/temporal';

function range(i: { start: Date; end: Date }): DateRange {
  const r = DateRange.create(i.start, i.end);
  expect(r.isSuccess).toBe(true);
  return r.value;
}

describe('DateRange — interval invariants (property)', () => {
  test.prop([arbInterval])('create succeeds for start <= end and contains both endpoints', (i) => {
    const r = range(i);
    expect(r.contains(i.start)).toBe(true);
    expect(r.contains(i.end)).toBe(true);
  });

  test.prop([arbInterval, arbInterval])('overlaps is symmetric', (i1, i2) => {
    const a = range(i1);
    const b = range(i2);
    expect(a.overlaps(b)).toBe(b.overlaps(a));
  });

  test.prop([arbOverlappingPair])(
    'intervals that share an instant overlap (both directions)',
    ([i1, i2]) => {
      const a = range(i1);
      const b = range(i2);
      expect(a.overlaps(b)).toBe(true);
      expect(b.overlaps(a)).toBe(true);
    }
  );

  test.prop([arbDisjointPair])(
    'strictly separated intervals never overlap and are ordered',
    ([i1, i2]) => {
      const a = range(i1);
      const b = range(i2);
      expect(a.overlaps(b)).toBe(false);
      expect(a.isBefore(b)).toBe(true);
      expect(b.isAfter(a)).toBe(true);
    }
  );

  test.prop([arbInterval])('create fails when start is strictly after end', (i) => {
    fc.pre(i.start.getTime() !== i.end.getTime());
    const reversed = DateRange.create(i.end, i.start); // end > start => invalid
    expect(reversed.isFailure).toBe(true);
  });

  test.prop([arbInterval])('toValue round-trips the endpoints', (i) => {
    const v = range(i).toValue();
    expect(v.start.getTime()).toBe(i.start.getTime());
    expect(v.end.getTime()).toBe(i.end.getTime());
  });
});
