/**
 * Property tests for the `Money` value object (pure domain — no infrastructure).
 *
 * Invariant ledger IDs covered:
 *   RACE-PURE-01  — currency-round-trip: every accepted currency survives
 *                   create→toValue→fromCents unchanged; USD-absent / GBP-duplicate bug exposed.
 *   RACE-PURE-02  — arithmetic laws: commutativity, associativity, multiply precision.
 *
 * @see docs/operations/property-testing/invariant-ledger.md
 * @see docs/operations/property-testing/race-condition-findings.json
 */

import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { Money } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Currencies that are actually in SUPPORTED_CURRENCIES and accepted by
 * Money.create / Money.fromCents.  JPY is excluded from decimal-amount tests
 * because it is a zero-decimal currency (no /100 conversion).
 */
const standardCurrency = fc.constantFrom('GBP', 'EUR', 'CAD', 'AUD');

/** All supported currencies including JPY. */
const anySupportedCurrency = fc.constantFrom('GBP', 'EUR', 'CAD', 'AUD', 'JPY');

/**
 * Non-negative integer cents bounded well within safe-integer range so that
 * adding two values never overflows Number.MAX_SAFE_INTEGER.
 */
const cents = fc.integer({ min: 0, max: 1_000_000_000 });

/**
 * Two-decimal-place decimal amount so Money.create()'s Math.round(n*100) is
 * deterministic and does not expose IEEE-754 boundary effects.
 */
const amount = fc
  .double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100);

/**
 * Sub-cent amount: has > 2 decimal places but is still finite and non-negative.
 * Used to verify documented rounding behaviour (not a correctness bug by itself).
 */
const subCentAmount = fc
  .double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true })
  .filter((n) => Math.round(n * 100) / 100 !== n && n > 0); // strictly fractional below a cent

/** Non-negative finite multiplier bounded to avoid overflow in minor units. */
const factor = fc.double({ min: 0, max: 1_000, noNaN: true, noDefaultInfinity: true });

// ---------------------------------------------------------------------------
// RACE-PURE-01: currency round-trip and currency-validation invariants
// ---------------------------------------------------------------------------

describe('Money — RACE-PURE-01: currency validation and round-trip', () => {
  // Property 1: fromCents always accepts the four standard currencies and
  // preserves both cents and currency in the toValue() snapshot.
  test.prop([cents, standardCurrency], propertyParams({ numRuns: 100 }))(
    'fromCents round-trips cents and currency (RACE-PURE-01)',
    (c, cur) => {
      const r = Money.fromCents(c, cur);
      expect(r.isSuccess, `fromCents(${c}, ${cur}) should succeed`).toBe(true);
      const v = r.value.toValue();
      expect(v.cents).toBe(c);
      expect(v.currency).toBe(cur);
    }
  );

  // Property 2: create→toValue→fromCents round-trip preserves the currency code
  // unchanged for every two-decimal-place amount.
  test.prop([amount, standardCurrency], propertyParams({ numRuns: 100 }))(
    'create→toValue→fromCents preserves currency and cents (RACE-PURE-01)',
    (a, cur) => {
      const createResult = Money.create(a, cur);
      expect(createResult.isSuccess).toBe(true);

      const { cents: storedCents, currency: storedCur } = createResult.value.toValue();
      expect(storedCur).toBe(cur);
      expect(storedCents).toBe(Math.round(a * 100));

      // Re-hydrate from the stored snapshot (simulates database read-back).
      const reload = Money.fromCents(storedCents, storedCur);
      expect(reload.isSuccess).toBe(true);
      expect(reload.value.cents).toBe(storedCents);
      expect(reload.value.currency).toBe(storedCur);
    }
  );

  // Property 3: JPY round-trip (zero-decimal: cents === amount, no /100).
  test.prop([fc.integer({ min: 0, max: 10_000_000 })], propertyParams())(
    'JPY fromCents round-trips cents directly (zero-decimal, RACE-PURE-01)',
    (jpyCents) => {
      const r = Money.fromCents(jpyCents, 'JPY');
      expect(r.isSuccess).toBe(true);
      expect(r.value.cents).toBe(jpyCents);
      expect(r.value.amount).toBe(jpyCents); // amount === cents for JPY
      const v = r.value.toValue();
      expect(v.cents).toBe(jpyCents);
      expect(v.currency).toBe('JPY');
    }
  );

  // Property 4: create() rejects all negative amounts for every supported currency.
  test.prop(
    [fc.double({ min: -1e9, max: -0.01, noNaN: true }), standardCurrency],
    propertyParams()
  )('create rejects negative amounts for any currency (RACE-PURE-01)', (neg, cur) => {
    const r = Money.create(neg, cur);
    expect(r.isFailure).toBe(true);
  });

  // Property 5: create() rejects non-finite amounts (NaN, ±Infinity).
  test.prop([fc.constantFrom(NaN, Infinity, -Infinity), standardCurrency], propertyParams())(
    'create rejects non-finite amounts (RACE-PURE-01)',
    (badNum, cur) => {
      const r = Money.create(badNum, cur);
      expect(r.isFailure).toBe(true);
    }
  );

  // Property 6: create() rejects all unsupported currency codes (arbitrary strings
  // that are neither GBP/EUR/CAD/AUD/JPY).
  test.prop(
    [
      amount,
      fc
        .string({ minLength: 3, maxLength: 3 })
        .filter((s) => !['GBP', 'EUR', 'CAD', 'AUD', 'JPY'].includes(s.toUpperCase())),
    ],
    propertyParams()
  )('create rejects unsupported currency codes (RACE-PURE-01)', (a, badCur) => {
    const r = Money.create(a, badCur);
    expect(r.isFailure).toBe(true);
  });

  // Property 7 (SKIP — real bug): USD is absent from SUPPORTED_CURRENCIES.
  // RACE-PURE-01 notes: "Money.create(10,'USD').isFailure === true (USD silently unsupported)".
  // The correct domain intent would be to support USD; this skip marks the gap.
  it.skip(// BUG(RACE-PURE-01): SUPPORTED_CURRENCIES omits USD. Money.create(10,"USD") returns
  // failure. The SUPPORTED_CURRENCIES array also contains "GBP" twice (duplicate entry)
  // wasting a slot.  Both issues should be fixed in packages/domain/src/shared/Money.ts
  // by replacing the array with: ['USD','GBP','EUR','CAD','AUD','JPY'].
  'USD is a supported ISO-4217 currency and should be accepted by Money.create (BUG RACE-PURE-01)', () => {
    const r = Money.create(10, 'USD');
    expect(r.isSuccess).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RACE-PURE-02: arithmetic laws — commutativity, associativity, multiply precision
// ---------------------------------------------------------------------------

describe('Money — RACE-PURE-02: arithmetic laws and multiply precision', () => {
  // Property 8: add() is commutative — a+b cents === b+a cents.
  test.prop([cents, cents, standardCurrency], propertyParams({ numRuns: 200 }))(
    'addition is commutative in minor units (RACE-PURE-02)',
    (x, y, cur) => {
      const a = Money.fromCents(x, cur).value;
      const b = Money.fromCents(y, cur).value;
      expect(a.add(b).value.cents).toBe(b.add(a).value.cents);
      expect(a.add(b).value.cents).toBe(x + y);
    }
  );

  // Property 9: add() is associative — (a+b)+c cents === a+(b+c) cents.
  test.prop([cents, cents, cents, standardCurrency], propertyParams({ numRuns: 200 }))(
    'addition is associative in minor units (RACE-PURE-02)',
    (x, y, z, cur) => {
      const a = Money.fromCents(x, cur).value;
      const b = Money.fromCents(y, cur).value;
      const c = Money.fromCents(z, cur).value;
      const lhs = a.add(b).value.add(c).value.cents; // (a+b)+c
      const rhs = a.add(b.add(c).value).value.cents; // a+(b+c)
      expect(lhs).toBe(rhs);
      expect(lhs).toBe(x + y + z);
    }
  );

  // Property 10: adding zero is the additive identity.
  test.prop([cents, standardCurrency], propertyParams())(
    'adding zero is the identity and preserves currency (RACE-PURE-02)',
    (c, cur) => {
      const m = Money.fromCents(c, cur).value;
      const sum = m.add(Money.zero(cur));
      expect(sum.isSuccess).toBe(true);
      expect(sum.value.cents).toBe(c);
      expect(sum.value.currency).toBe(cur);
    }
  );

  // Property 11: subtract is the left-inverse of add — (x+y) - y === x.
  test.prop([cents, cents, standardCurrency], propertyParams())(
    'subtract is the left inverse of add (no underflow, RACE-PURE-02)',
    (x, y, cur) => {
      const a = Money.fromCents(x, cur).value;
      const b = Money.fromCents(y, cur).value;
      const back = a.add(b).value.subtract(b);
      expect(back.isSuccess).toBe(true);
      expect(back.value.cents).toBe(x);
    }
  );

  // Property 12: subtract by a larger value always fails (never produces negative cents).
  test.prop([cents, cents, standardCurrency], propertyParams())(
    'subtracting a strictly larger amount always fails (RACE-PURE-02)',
    (x, y, cur) => {
      fc.pre(x < y);
      const result = Money.fromCents(x, cur).value.subtract(Money.fromCents(y, cur).value);
      expect(result.isFailure).toBe(true);
    }
  );

  // Property 13: multiply by 1 is the identity.
  test.prop([cents, standardCurrency], propertyParams())(
    'multiply by 1 is the identity (RACE-PURE-02)',
    (c, cur) => {
      const m = Money.fromCents(c, cur).value;
      const r = m.multiply(1);
      expect(r.isSuccess).toBe(true);
      expect(r.value.cents).toBe(c);
    }
  );

  // Property 14: multiply by 0 produces zero cents.
  test.prop([cents, standardCurrency], propertyParams())(
    'multiply by 0 produces zero cents (RACE-PURE-02)',
    (c, cur) => {
      const m = Money.fromCents(c, cur).value;
      const r = m.multiply(0);
      expect(r.isSuccess).toBe(true);
      expect(r.value.cents).toBe(0);
      expect(r.value.currency).toBe(cur);
    }
  );

  // Property 15: multiply result is always an integer number of cents (Math.round).
  test.prop([cents, factor, standardCurrency], propertyParams({ numRuns: 200 }))(
    'multiply always produces integer minor units (RACE-PURE-02)',
    (c, f, cur) => {
      const m = Money.fromCents(c, cur).value;
      const r = m.multiply(f);
      expect(r.isSuccess).toBe(true);
      expect(Number.isInteger(r.value.cents)).toBe(true);
    }
  );

  // Property 16: multiply rejects negative factors.
  test.prop(
    [cents, fc.double({ min: -1e6, max: -0.001, noNaN: true }), standardCurrency],
    propertyParams()
  )('multiply rejects negative factors (RACE-PURE-02)', (c, negFactor, cur) => {
    const m = Money.fromCents(c, cur).value;
    const r = m.multiply(negFactor);
    expect(r.isFailure).toBe(true);
  });

  // Property 17: multiply(2) equals add(self) for all integer-cent inputs.
  test.prop([cents, standardCurrency], propertyParams())(
    'multiply(2) equals add(self) (RACE-PURE-02)',
    (c, cur) => {
      const m = Money.fromCents(c, cur).value;
      expect(m.multiply(2).value.cents).toBe(m.add(m).value.cents);
    }
  );

  // Property 18: currency is preserved through all arithmetic operations.
  test.prop([cents, cents, factor, standardCurrency], propertyParams())(
    'arithmetic operations preserve the currency code (RACE-PURE-02)',
    (x, y, f, cur) => {
      const a = Money.fromCents(x, cur).value;
      const b = Money.fromCents(y, cur).value;
      expect(a.add(b).value.currency).toBe(cur);
      expect(a.multiply(f).value.currency).toBe(cur);
      if (x >= y) {
        expect(a.subtract(b).value.currency).toBe(cur);
      }
    }
  );

  // Property 19: cross-currency add/subtract always fails.
  test.prop([cents, standardCurrency, standardCurrency], propertyParams())(
    'add and subtract on mismatched currencies always fail (RACE-PURE-02)',
    (c, cur1, cur2) => {
      fc.pre(cur1 !== cur2);
      const a = Money.fromCents(c, cur1).value;
      const b = Money.fromCents(c, cur2).value;
      expect(a.add(b).isFailure).toBe(true);
      expect(a.subtract(b).isFailure).toBe(true);
    }
  );

  // Property 20: Money.create decimal→cents conversion always produces integer minor
  // units regardless of floating-point representation.
  test.prop([amount, standardCurrency], propertyParams({ numRuns: 200 }))(
    'create stores two-decimal amounts as integer cents (RACE-PURE-02)',
    (a, cur) => {
      const r = Money.create(a, cur);
      expect(r.isSuccess).toBe(true);
      expect(Number.isInteger(r.value.cents)).toBe(true);
      expect(r.value.cents).toBe(Math.round(a * 100));
    }
  );

  // Property 21 (documented behaviour): sub-cent amounts round to the nearest cent —
  // this is the intended behaviour (Math.round), not a correctness bug.  The property
  // confirms the rounding is stable (idempotent after the first round).
  test.prop([subCentAmount, standardCurrency], propertyParams())(
    'sub-cent decimal amounts round deterministically to integer cents (RACE-PURE-02)',
    (a, cur) => {
      const r = Money.create(a, cur);
      expect(r.isSuccess).toBe(true);
      expect(Number.isInteger(r.value.cents)).toBe(true);
      // Applying create again to the reconstructed amount should give the same cents.
      const roundedAmount = r.value.amount; // already rounded in the Money object
      const r2 = Money.create(roundedAmount, cur);
      expect(r2.isSuccess).toBe(true);
      expect(r2.value.cents).toBe(r.value.cents);
    }
  );

  // Property 22: greaterThan / lessThan form a total order on cents.
  test.prop([cents, cents, standardCurrency], propertyParams())(
    'greaterThan and lessThan are consistent with the underlying cents (RACE-PURE-02)',
    (x, y, cur) => {
      const a = Money.fromCents(x, cur).value;
      const b = Money.fromCents(y, cur).value;
      if (x > y) {
        expect(a.greaterThan(b)).toBe(true);
        expect(a.lessThan(b)).toBe(false);
      } else if (x < y) {
        expect(a.greaterThan(b)).toBe(false);
        expect(a.lessThan(b)).toBe(true);
      } else {
        expect(a.greaterThan(b)).toBe(false);
        expect(a.lessThan(b)).toBe(false);
      }
    }
  );

  // Property 23: equals() reflects structural equality of cents + currency.
  test.prop([cents, standardCurrency], propertyParams())(
    'two Money instances with identical cents+currency are equal (RACE-PURE-02)',
    (c, cur) => {
      const a = Money.fromCents(c, cur).value;
      const b = Money.fromCents(c, cur).value;
      expect(a.equals(b)).toBe(true);
    }
  );

  // Property 24: Money is immutable — arithmetic returns new instances.
  test.prop([cents, cents, standardCurrency], propertyParams())(
    'add returns a new instance without mutating the operands (RACE-PURE-02)',
    (x, y, cur) => {
      const a = Money.fromCents(x, cur).value;
      const b = Money.fromCents(y, cur).value;
      const sumResult = a.add(b);
      expect(sumResult.isSuccess).toBe(true);
      // Original operands must be unchanged.
      expect(a.cents).toBe(x);
      expect(b.cents).toBe(y);
      expect(sumResult.value.cents).toBe(x + y);
    }
  );
});
