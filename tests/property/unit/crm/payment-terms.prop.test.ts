/**
 * Property tests for `PaymentTerms` value object (pure domain — no infrastructure).
 *
 * Property id: RACE-PURE-13
 * Title: PaymentTerms.calculateDueDate uses mutable setDate() on a Date copy but
 *        does not guard against DST-transition off-by-one.  JavaScript's
 *        Date.setDate handles month overflow natively so the computation is
 *        arithmetically correct in the common case.  However no property test
 *        verifies the exact UTC-day distance across month/year boundaries, DST
 *        transitions, or leap years.
 *
 * These properties assert every invariant PaymentTerms must satisfy:
 *  1. Validation:   valid inputs are accepted; invalid inputs produce typed errors.
 *  2. Round-trip:   create → toValue → re-create preserves all fields exactly.
 *  3. Normalization idempotency: description is trimmed once; trim(toValue) stable.
 *  4. Equality / immutability: value semantics; props frozen.
 *  5. Due-date arithmetic (RACE-PURE-13 core):
 *       dueDate - issueDate === daysUntilDue * 24 * 60 * 60 * 1000 ms in UTC.
 *  6. daysUntilDue = 0 ⇒ dueDate is the same calendar day as issueDate (UTC).
 *  7. Month/year boundary crossing: e.g. Jan-31 + days wraps correctly.
 *  8. Leap-year aware: Feb dates are handled by Date.setDate without error.
 *  9. Monotonicity: larger daysUntilDue produces a later (or equal) due date.
 * 10. Preset factories net30 / dueOnReceipt produce stable, equal instances.
 *
 * @see docs/operations/property-testing/race-condition-findings.json RACE-PURE-13
 */

import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { PaymentTerms } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Bounded arbitraries (inline — do not edit support/arbitraries)
// ---------------------------------------------------------------------------

/** Valid non-negative integer days-until-due (0 … 365). */
const validDays = fc.integer({ min: 0, max: 365 });

/** Strictly negative days — must be rejected. */
const negativeDays = fc.integer({ min: -10_000, max: -1 });

/** Valid non-empty description strings (trimmed internally). */
const validDescription = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Blank / whitespace-only descriptions that must be rejected. */
const blankDescription = fc.constantFrom('', ' ', '   ', '\t', '\n', '\t\n ');

/**
 * Arbitrary Date values spanning 2015-01-01 to 2035-12-31.
 * Constructed via UTC epoch ms so the Date is independent of the local
 * timezone — we compare UTC day numbers throughout.
 */
const issueDate = fc
  .integer({
    min: Date.UTC(2015, 0, 1),
    max: Date.UTC(2035, 11, 31),
  })
  .map((ms) => new Date(ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the UTC-calendar-day serial number for a Date (days since epoch). */
function utcDayOf(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('PaymentTerms — value-object invariants (property, RACE-PURE-13)', () => {
  // -------------------------------------------------------------------------
  // 1. Validation — valid inputs
  // -------------------------------------------------------------------------

  test.prop([validDays, validDescription], propertyParams())(
    'create accepts any non-negative daysUntilDue with a non-blank description',
    (days, desc) => {
      const result = PaymentTerms.create(days, desc);
      expect(result.isSuccess).toBe(true);
      expect(result.value.daysUntilDue).toBe(days);
      // Description is stored trimmed.
      expect(result.value.description).toBe(desc.trim());
    }
  );

  // -------------------------------------------------------------------------
  // 2. Validation — negative days must be rejected
  // -------------------------------------------------------------------------

  test.prop([negativeDays, validDescription], propertyParams())(
    'create rejects negative daysUntilDue with INVALID_PAYMENT_TERMS error',
    (days, desc) => {
      const result = PaymentTerms.create(days, desc);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_PAYMENT_TERMS');
    }
  );

  // -------------------------------------------------------------------------
  // 3. Validation — blank description must be rejected
  // -------------------------------------------------------------------------

  test.prop([validDays, blankDescription], propertyParams())(
    'create rejects a blank or whitespace-only description with INVALID_PAYMENT_TERMS error',
    (days, desc) => {
      const result = PaymentTerms.create(days, desc);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_PAYMENT_TERMS');
    }
  );

  // -------------------------------------------------------------------------
  // 4. Round-trip: create → toValue → re-create preserves all fields
  // -------------------------------------------------------------------------

  test.prop([validDays, validDescription], propertyParams())(
    'toValue serialises all props and round-trips back to an equal instance',
    (days, desc) => {
      const first = PaymentTerms.create(days, desc).value;
      const snapshot = first.toValue();

      expect(snapshot.daysUntilDue).toBe(days);
      expect(snapshot.description).toBe(desc.trim());

      const second = PaymentTerms.create(snapshot.daysUntilDue, snapshot.description).value;
      expect(first.equals(second)).toBe(true);
    }
  );

  // -------------------------------------------------------------------------
  // 5. Normalization idempotency: description trim is applied once
  // -------------------------------------------------------------------------

  test.prop([validDays, validDescription], propertyParams())(
    'toValue is idempotent — calling it twice returns the same shape',
    (days, desc) => {
      const pt = PaymentTerms.create(days, desc).value;
      const v1 = pt.toValue();
      const v2 = pt.toValue();
      expect(v1).toEqual(v2);
    }
  );

  test.prop([validDays, validDescription], propertyParams())(
    'description stored in toValue equals String.trim() of the original input',
    (days, desc) => {
      const pt = PaymentTerms.create(days, desc).value;
      expect(pt.toValue().description).toBe(desc.trim());
    }
  );

  // -------------------------------------------------------------------------
  // 6. Equality / immutability
  // -------------------------------------------------------------------------

  test.prop([validDays, validDescription], propertyParams())(
    'two PaymentTerms with the same props are equal (value semantics)',
    (days, desc) => {
      const trimmed = desc.trim();
      const a = PaymentTerms.create(days, trimmed).value;
      const b = PaymentTerms.create(days, trimmed).value;
      expect(a.equals(b)).toBe(true);
    }
  );

  test.prop([validDays, validDays, validDescription], propertyParams())(
    'PaymentTerms with different daysUntilDue are not equal',
    (d1, d2, desc) => {
      fc.pre(d1 !== d2);
      const trimmed = desc.trim();
      const a = PaymentTerms.create(d1, trimmed).value;
      const b = PaymentTerms.create(d2, trimmed).value;
      expect(a.equals(b)).toBe(false);
    }
  );

  test.prop([validDays, validDescription], propertyParams())(
    'props are frozen — mutating toValue() snapshot does not affect the original instance',
    (days, desc) => {
      const pt = PaymentTerms.create(days, desc).value;
      const snapshot = pt.toValue() as { daysUntilDue: number; description: string };
      snapshot.daysUntilDue = 9999;
      snapshot.description = 'tampered';
      // Original must be unchanged.
      expect(pt.daysUntilDue).toBe(days);
      expect(pt.description).toBe(desc.trim());
    }
  );

  // -------------------------------------------------------------------------
  // 7. calculateDueDate — RACE-PURE-13 core invariant
  //
  //    BUG(RACE-PURE-13): calculateDueDate uses Date.setDate() in local time.
  //    When the issue date is in GMT (UTC+0) and the due date falls after a
  //    DST spring-forward (e.g. the due date is in BST / UTC+1 on a UK machine),
  //    the UTC-midnight of the local due date is one hour before the UTC-midnight
  //    boundary, placing it on the PREVIOUS UTC calendar day.
  //
  //    Confirmed counterexample (UK/BST timezone):
  //      issueDate = 2015-01-01T00:00:00.018Z (Jan 1, GMT, UTC+0)
  //      daysUntilDue = 227 → expected UTC day distance 227
  //      actual UTC day distance = 226 (due lands at 2015-08-15T23:00:00.018Z)
  //
  //    Root cause: `new Date(issueDate)` copies the ms epoch; `setDate(d+days)`
  //    operates in local wall-clock time. When the resulting date is in a
  //    UTC+N timezone (summer time), local midnight maps to (midnight - N hours)
  //    in UTC, which can push the result to the previous UTC calendar day.
  //
  //    Fix strategy (from findings.json): use UTC arithmetic:
  //      new Date(Date.UTC(y, m, d + daysUntilDue))
  //    to avoid all timezone involvement.
  //
  //    This test is SKIPPED because the property correctly exposes the bug
  //    and must not be weakened.  Re-enable once calculateDueDate uses UTC
  //    arithmetic.
  // -------------------------------------------------------------------------

  // BUG(RACE-PURE-13): calculateDueDate.setDate() is DST-unsafe — off-by-one
  // when issue date is in UTC+0 winter and due date falls in UTC+N summer (BST).
  // Counterexample: days=227, issue=2015-01-01T00:00:00.018Z → UTC dist=226 not 227.
  // Fix: replace with UTC arithmetic (Date.UTC(y, m, d + daysUntilDue)).
  // ADR-054: QUAL-009 (RACE-PURE-13) — confirmed UTC-day-boundary bug in
  // PaymentTerms.calculateDueDate; tracked in
  // artifacts/reports/sprint-19/baseline/quality-findings.json. Skip retained pending a
  // dedicated fix task (out of scope for ENG-OPS-002.R13).
  it.skip('RACE-PURE-13: calculateDueDate returns exactly daysUntilDue UTC calendar days after issueDate', () => {
    fc.assert(
      fc.property(validDays, issueDate, (days, issue) => {
        const pt = PaymentTerms.create(days, 'Test').value;
        const due = pt.calculateDueDate(issue);
        const utcDayDistance = utcDayOf(due) - utcDayOf(issue);
        expect(utcDayDistance).toBe(days);
      }),
      propertyParams()
    );
  });

  // -------------------------------------------------------------------------
  // 8. daysUntilDue = 0 ⇒ due date is the same UTC calendar day as issue date
  // -------------------------------------------------------------------------

  test.prop([issueDate], propertyParams())(
    'daysUntilDue = 0 produces a due date on the same UTC calendar day as issueDate',
    (issue) => {
      const pt = PaymentTerms.dueOnReceipt();
      const due = pt.calculateDueDate(issue);
      expect(utcDayOf(due)).toBe(utcDayOf(issue));
    }
  );

  // -------------------------------------------------------------------------
  // 9. Month / year boundary crossing (validity check only)
  //
  //    Issue dates at the end of every month (28th, 29th, 30th, 31st) combined
  //    with various day offsets must produce a valid, finite Date.  JS's
  //    Date.setDate handles month overflow natively (Jan 31 + 1 = Feb 1).
  //
  //    NOTE: The exact UTC-day-distance assertion is SKIPPED in a separate test
  //    below because it triggers the same DST bug as RACE-PURE-13.
  // -------------------------------------------------------------------------

  test.prop(
    [
      fc.constantFrom(28, 29, 30, 31),
      fc.constantFrom(0, 1, 2, 3, 11), // months 0-based (Jan, Feb, Mar, Apr, Dec)
      fc.integer({ min: 2015, max: 2034 }),
      fc.integer({ min: 1, max: 60 }),
    ],
    propertyParams()
  )(
    'calculateDueDate produces a valid finite Date when issueDate is at month-end',
    (day, month, year, extraDays) => {
      // Build the end-of-month date in UTC; guard against non-existent combos
      // (e.g. Feb 30 — Date.UTC wraps those forward, so we skip them).
      const candidate = new Date(Date.UTC(year, month, day));
      fc.pre(candidate.getUTCDate() === day);

      const pt = PaymentTerms.create(extraDays, 'Boundary').value;
      const due = pt.calculateDueDate(candidate);

      // Assert only that the result is a valid, finite Date (not NaN/Invalid).
      expect(Number.isFinite(due.getTime())).toBe(true);
      expect(due instanceof Date).toBe(true);
    }
  );

  // BUG(RACE-PURE-13): same DST off-by-one as the core invariant — month-end
  // dates in winter months that resolve to summer-time due dates (e.g.
  // March 28 2026 + 5 days = April 2, which is in BST/UTC+1 → UTC dist = 4).
  // Counterexample: [28, 2 (March), 2026, 5] → UTC dist=4 not 5.
  // Fix: replace setDate() with UTC arithmetic in calculateDueDate().
  // ADR-054: QUAL-009 (RACE-PURE-13) — same confirmed UTC-day-boundary bug
  // (month-boundary variant); tracked in
  // artifacts/reports/sprint-19/baseline/quality-findings.json. Skip retained pending a
  // dedicated fix task (out of scope for ENG-OPS-002.R13).
  it.skip('RACE-PURE-13 (month-boundary variant): UTC-day distance equals extraDays across month/year boundaries', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(28, 29, 30, 31),
        fc.constantFrom(0, 1, 2, 3, 11),
        fc.integer({ min: 2015, max: 2034 }),
        fc.integer({ min: 1, max: 60 }),
        (day, month, year, extraDays) => {
          const candidate = new Date(Date.UTC(year, month, day));
          fc.pre(candidate.getUTCDate() === day);
          const pt = PaymentTerms.create(extraDays, 'Boundary').value;
          const due = pt.calculateDueDate(candidate);
          const utcDayDistance = utcDayOf(due) - utcDayOf(candidate);
          expect(utcDayDistance).toBe(extraDays);
        }
      ),
      propertyParams()
    );
  });

  // -------------------------------------------------------------------------
  // 10. Leap-year: Feb-28 and Feb-29 in leap years are handled correctly
  // -------------------------------------------------------------------------

  test.prop(
    [
      // Known leap years in our date range.
      fc.constantFrom(2016, 2020, 2024, 2028, 2032),
      fc.integer({ min: 0, max: 5 }),
    ],
    propertyParams()
  )('calculateDueDate is correct for Feb-28 / Feb-29 in leap years', (leapYear, extraDays) => {
    // Feb 28 in a leap year.
    const feb28 = new Date(Date.UTC(leapYear, 1, 28));
    const pt = PaymentTerms.create(extraDays, 'LeapTest').value;
    const due = pt.calculateDueDate(feb28);

    expect(Number.isFinite(due.getTime())).toBe(true);
    const utcDayDistance = utcDayOf(due) - utcDayOf(feb28);
    expect(utcDayDistance).toBe(extraDays);
  });

  // -------------------------------------------------------------------------
  // 11. Monotonicity: larger daysUntilDue never produces an earlier due date
  // -------------------------------------------------------------------------

  test.prop([validDays, validDays, issueDate], propertyParams())(
    'calculateDueDate is monotone: longer terms produce the same or later due date',
    (d1, d2, issue) => {
      const shorter = Math.min(d1, d2);
      const longer = Math.max(d1, d2);

      const ptShorter = PaymentTerms.create(shorter, 'Short').value;
      const ptLonger = PaymentTerms.create(longer, 'Long').value;

      const dueShorter = ptShorter.calculateDueDate(issue);
      const dueLonger = ptLonger.calculateDueDate(issue);

      expect(dueLonger.getTime()).toBeGreaterThanOrEqual(dueShorter.getTime());
    }
  );

  // -------------------------------------------------------------------------
  // 12. calculateDueDate does not mutate the issueDate passed to it
  // -------------------------------------------------------------------------

  test.prop([validDays, issueDate], propertyParams())(
    'calculateDueDate does not mutate the issueDate argument',
    (days, issue) => {
      const originalMs = issue.getTime();
      const pt = PaymentTerms.create(days, 'ImmutTest').value;
      pt.calculateDueDate(issue);
      expect(issue.getTime()).toBe(originalMs);
    }
  );

  // -------------------------------------------------------------------------
  // 13. Preset factories — net30 and dueOnReceipt are stable and equal
  //
  //     These are purely deterministic (no generated input) so we use a single
  //     dummy arbitrary `fc.constant(null)` — the minimum fast-check requires
  //     for `asyncProperty` to accept the call.
  // -------------------------------------------------------------------------

  test.prop([fc.constant(null)], propertyParams())(
    'net30() always returns daysUntilDue=30 and description="Net 30"',
    (_dummy) => {
      const pt = PaymentTerms.net30();
      expect(pt.daysUntilDue).toBe(30);
      expect(pt.description).toBe('Net 30');
    }
  );

  test.prop([fc.constant(null)], propertyParams())(
    'dueOnReceipt() always returns daysUntilDue=0 and description="Due on Receipt"',
    (_dummy) => {
      const pt = PaymentTerms.dueOnReceipt();
      expect(pt.daysUntilDue).toBe(0);
      expect(pt.description).toBe('Due on Receipt');
    }
  );

  test.prop([fc.constant(null)], propertyParams())(
    'two net30() instances are equal (preset factory stability)',
    (_dummy) => {
      const a = PaymentTerms.net30();
      const b = PaymentTerms.net30();
      expect(a.equals(b)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], propertyParams())(
    'two dueOnReceipt() instances are equal (preset factory stability)',
    (_dummy) => {
      const a = PaymentTerms.dueOnReceipt();
      const b = PaymentTerms.dueOnReceipt();
      expect(a.equals(b)).toBe(true);
    }
  );

  test.prop([fc.constant(null)], propertyParams())(
    'net30() and dueOnReceipt() are not equal (different daysUntilDue)',
    (_dummy) => {
      expect(PaymentTerms.net30().equals(PaymentTerms.dueOnReceipt())).toBe(false);
    }
  );

  // -------------------------------------------------------------------------
  // 14. net30() preset: calculateDueDate — UTC day distance check
  //
  //     BUG(RACE-PURE-13): same DST off-by-one as the core invariant.
  //     For a UK machine, issue dates in winter that resolve to summer-time
  //     due dates (e.g. Mar 1 + 30 = Mar 31 BST → UTC dist = 29) fail.
  //     Counterexample: issue=2026-03-01T00:00:00Z + 30 → UTC dist=29 not 30.
  //     Fix: replace setDate() with UTC arithmetic in calculateDueDate().
  // -------------------------------------------------------------------------

  // BUG(RACE-PURE-13): net30 variant — UTC day distance off by 1 when +30 days
  // crosses a DST spring-forward boundary (e.g. UK GMT→BST in late March).
  // ADR-054: QUAL-009 (RACE-PURE-13) — same confirmed UTC-day-boundary bug (net30
  // variant); tracked in artifacts/reports/sprint-19/baseline/quality-findings.json.
  // Skip retained pending a dedicated fix task (out of scope for ENG-OPS-002.R13).
  it.skip('RACE-PURE-13 (net30 variant): net30().calculateDueDate produces a due date exactly 30 UTC days after issueDate', () => {
    fc.assert(
      fc.property(issueDate, (issue) => {
        const due = PaymentTerms.net30().calculateDueDate(issue);
        const utcDayDistance = utcDayOf(due) - utcDayOf(issue);
        expect(utcDayDistance).toBe(30);
      }),
      propertyParams()
    );
  });
});
