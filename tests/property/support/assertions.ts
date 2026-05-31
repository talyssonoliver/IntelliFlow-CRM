/**
 * Invariant assertion helpers shared across property & concurrency tests.
 *
 * These encode the recurring race-condition invariants from the audit
 * (`docs/operations/property-testing/invariant-ledger.md`) so individual tests
 * read as "assert exactly one writer won" rather than re-deriving the counting.
 *
 * @module tests/property/support/assertions
 */

import { expect } from 'vitest';
import type { OutcomeTally } from './concurrent';

/**
 * Exactly one of N concurrent operations succeeded; the rest were rejected.
 * The canonical "no double-booking / no duplicate create" assertion.
 */
export function expectExactlyOneFulfilled<T>(tally: OutcomeTally<T>, context = ''): void {
  expect(
    tally.fulfilledCount,
    `${context} expected exactly 1 of ${tally.total} concurrent ops to succeed, ` +
      `got ${tally.fulfilledCount} (rejected ${tally.rejectedCount})`
  ).toBe(1);
}

/** At most `max` operations succeeded (e.g. capacity bound under concurrency). */
export function expectAtMostFulfilled<T>(tally: OutcomeTally<T>, max: number, context = ''): void {
  expect(
    tally.fulfilledCount,
    `${context} expected at most ${max} of ${tally.total} ops to succeed, got ${tally.fulfilledCount}`
  ).toBeLessThanOrEqual(max);
}

/** A counter/quantity never dropped below zero. */
export function expectNeverNegative(value: number, context = ''): void {
  expect(value, `${context} value must never be negative, got ${value}`).toBeGreaterThanOrEqual(0);
}

/** A counter never exceeded its limit (no over-allocation under concurrency). */
export function expectWithinLimit(value: number, limit: number, context = ''): void {
  expect(value, `${context} value ${value} must not exceed limit ${limit}`).toBeLessThanOrEqual(
    limit
  );
}

/** No duplicate side effects: every produced key is unique. */
export function expectNoDuplicates<T>(items: T[], keyFn: (item: T) => string, context = ''): void {
  const seen = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, count]) => count > 1);
  const summary = dups.map(([k, c]) => `${k}×${c}`).join(', ');
  expect(dups.length, `${context} expected no duplicate keys, found: ${summary}`).toBe(0);
}

/** A generic named invariant — fails with a readable message when violated. */
export function expectInvariant(holds: boolean, description: string): void {
  expect(holds, `invariant violated: ${description}`).toBe(true);
}
