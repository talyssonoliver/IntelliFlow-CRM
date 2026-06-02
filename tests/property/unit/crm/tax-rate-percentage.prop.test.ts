/**
 * Property tests for `TaxRate` value object (pure domain — no infrastructure).
 *
 * Property id: RACE-PURE-05
 * Title: TaxRate.calculate silently returns Money.zero on multiply failure,
 *        masking tax miscalculation.
 *
 * These properties assert the invariants TaxRate must satisfy for every input:
 *  - Validation: valid rates are accepted; out-of-range rates are rejected.
 *  - Round-trip: create→toValue roundtrip preserves all fields.
 *  - Equality/immutability: value objects with same props are equal; props are
 *    frozen.
 *  - zero() factory: always zero rate, NONE type.
 *  - calculate correctness: result.cents === Math.round(cents * rate / 100).
 *  - calculate(zero subtotal) === 0 for any rate.
 *  - TaxRate.zero().calculate(any subtotal) === 0 (RACE-PURE-05 guard path).
 *  - Silent-zero detection: for all valid (rate, cents) calculate never silently
 *    returns 0 when the expected tax is non-zero (RACE-PURE-05 core invariant).
 *
 * @see docs/operations/property-testing/race-condition-findings.json RACE-PURE-05
 */

import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { TaxRate } from '@intelliflow/domain';
import { Money } from '@intelliflow/domain';
import { TAX_TYPES } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Bounded arbitraries (inline — do not edit support/arbitraries)
// ---------------------------------------------------------------------------

/** Valid rates: floats in [0, 100], no NaN, two-decimal precision. */
const validRate = fc
  .double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100);

/** Invalid rates: < 0 or > 100. */
const invalidRate = fc.oneof(
  fc.double({ min: -1000, max: -0.001, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: 100.001, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
);

/** One of the four allowed tax types. */
const taxType = fc.constantFrom(...TAX_TYPES);

/** Non-empty jurisdiction string (optional field). */
const jurisdiction = fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined });

/** Supported currencies (Money.create-compatible subset). */
const currency = fc.constantFrom('GBP', 'EUR', 'CAD', 'AUD');

/** Subtotal as integer cents in a sane range. */
const subtotalCents = fc.integer({ min: 0, max: 10_000_000 });

/** Non-zero subtotal cents — to test the silent-zero bug. */
const nonZeroSubtotalCents = fc.integer({ min: 1, max: 10_000_000 });

/** Non-zero valid rate (to guarantee expected tax > 0 when subtotal > 0). */
const nonZeroValidRate = fc
  .double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100)
  .filter((n) => n > 0);

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('TaxRate — value-object invariants (property, RACE-PURE-05)', () => {
  // -------------------------------------------------------------------------
  // 1. Validation
  // -------------------------------------------------------------------------

  test.prop([validRate, taxType, jurisdiction], propertyParams())(
    'create accepts any rate in [0, 100] with any TaxType',
    (rate, type, jur) => {
      const result = TaxRate.create(rate, type, jur ?? undefined);
      expect(result.isSuccess).toBe(true);
      expect(result.value.rate).toBe(rate);
      expect(result.value.type).toBe(type);
    }
  );

  test.prop([invalidRate, taxType], propertyParams())(
    'create rejects rates outside [0, 100] with INVALID_TAX_RATE error',
    (rate, type) => {
      const result = TaxRate.create(rate, type);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_TAX_RATE');
    }
  );

  // -------------------------------------------------------------------------
  // 2. Round-trip: create → toValue → re-create preserves all fields
  // -------------------------------------------------------------------------

  test.prop([validRate, taxType, jurisdiction], propertyParams())(
    'toValue serialises all props and round-trips back to equal instance',
    (rate, type, jur) => {
      const first = TaxRate.create(rate, type, jur ?? undefined).value;
      const snapshot = first.toValue();

      expect(snapshot.rate).toBe(rate);
      expect(snapshot.type).toBe(type);
      expect(snapshot.jurisdiction).toBe(jur ?? undefined);

      // Re-constitute from serialised value.
      const second = TaxRate.create(snapshot.rate, snapshot.type, snapshot.jurisdiction).value;
      expect(first.equals(second)).toBe(true);
    }
  );

  // -------------------------------------------------------------------------
  // 3. Equality and immutability
  // -------------------------------------------------------------------------

  test.prop([validRate, taxType], propertyParams())(
    'two TaxRates with the same props are equal (value semantics)',
    (rate, type) => {
      const a = TaxRate.create(rate, type).value;
      const b = TaxRate.create(rate, type).value;
      expect(a.equals(b)).toBe(true);
    }
  );

  test.prop([validRate, validRate, taxType], propertyParams())(
    'TaxRates with different rates are not equal',
    (r1, r2, type) => {
      fc.pre(r1 !== r2);
      const a = TaxRate.create(r1, type).value;
      const b = TaxRate.create(r2, type).value;
      expect(a.equals(b)).toBe(false);
    }
  );

  test.prop([validRate, taxType], propertyParams())(
    'props object is frozen — mutations are silently ignored (immutability)',
    (rate, type) => {
      const tr = TaxRate.create(rate, type).value;
      const serialised = tr.toValue();
      // Mutating the snapshot must NOT affect the original instance.
      (serialised as { rate: number }).rate = 99.99;
      expect(tr.rate).toBe(rate);
    }
  );

  // -------------------------------------------------------------------------
  // 4. zero() factory
  // -------------------------------------------------------------------------

  it('TaxRate.zero() always returns rate=0, type=NONE', () => {
    const z = TaxRate.zero();
    expect(z.rate).toBe(0);
    expect(z.type).toBe('NONE');
  });

  // -------------------------------------------------------------------------
  // 5. calculate correctness: result === Math.round(cents * rate / 100)
  // -------------------------------------------------------------------------

  test.prop([validRate, subtotalCents, currency], propertyParams())(
    'calculate returns the rounded integer-cent amount for any valid rate and subtotal',
    (rate, cents, cur) => {
      const tr = TaxRate.create(rate, 'VAT').value;
      const subtotal = Money.fromCents(cents, cur).value;
      const tax = tr.calculate(subtotal);

      const expected = Math.round(cents * (rate / 100));
      expect(tax.cents).toBe(expected);
      expect(tax.currency).toBe(cur);
    }
  );

  test.prop([validRate, currency], propertyParams())(
    'calculate on zero subtotal always yields zero tax regardless of rate',
    (rate, cur) => {
      const tr = TaxRate.create(rate, 'VAT').value;
      const subtotal = Money.zero(cur);
      const tax = tr.calculate(subtotal);
      expect(tax.cents).toBe(0);
    }
  );

  test.prop([subtotalCents, currency], propertyParams())(
    'TaxRate.zero().calculate(any subtotal) always yields zero (RACE-PURE-05 zero-rate guard)',
    (cents, cur) => {
      const subtotal = Money.fromCents(cents, cur).value;
      const tax = TaxRate.zero().calculate(subtotal);
      expect(tax.cents).toBe(0);
    }
  );

  // -------------------------------------------------------------------------
  // 6. RACE-PURE-05 core invariant: silent-zero detection
  //
  //    For any non-zero rate and non-zero subtotal, the expected tax is
  //    Math.round(cents * rate / 100). If that is > 0 then calculate() MUST
  //    NOT silently return 0.
  //
  //    Under the current implementation the silent-zero path fires only when
  //    Money.multiply returns a failure result (rate/100 would need to be
  //    negative or non-finite). With rate in [0.01, 100] the factor is always
  //    in (0, 1] so Money.multiply will always succeed — thus this property is
  //    expected to pass today and will serve as a regression guard if
  //    Money.multiply semantics ever change.
  // -------------------------------------------------------------------------

  test.prop([nonZeroValidRate, nonZeroSubtotalCents, currency], propertyParams())(
    'RACE-PURE-05: calculate never silently returns 0 when expected tax > 0',
    (rate, cents, cur) => {
      const expected = Math.round(cents * (rate / 100));
      fc.pre(expected > 0); // guard: skip cases where rounding collapses to 0

      const tr = TaxRate.create(rate, 'VAT').value;
      const subtotal = Money.fromCents(cents, cur).value;
      const tax = tr.calculate(subtotal);

      // The tax must equal the expected rounded value AND must be non-zero.
      expect(tax.cents).toBe(expected);
      expect(tax.cents).toBeGreaterThan(0);
    }
  );

  // -------------------------------------------------------------------------
  // 7. calculate preserves currency label
  // -------------------------------------------------------------------------

  test.prop([validRate, subtotalCents, currency], propertyParams())(
    'calculate returns tax in the same currency as the subtotal',
    (rate, cents, cur) => {
      const tr = TaxRate.create(rate, 'VAT').value;
      const subtotal = Money.fromCents(cents, cur).value;
      const tax = tr.calculate(subtotal);
      expect(tax.currency).toBe(cur);
    }
  );

  // -------------------------------------------------------------------------
  // 8. Normalization idempotency: toValue called twice is stable
  // -------------------------------------------------------------------------

  test.prop([validRate, taxType, jurisdiction], propertyParams())(
    'toValue is idempotent — calling it twice returns the same shape',
    (rate, type, jur) => {
      const tr = TaxRate.create(rate, type, jur ?? undefined).value;
      const v1 = tr.toValue();
      const v2 = tr.toValue();
      expect(v1).toEqual(v2);
    }
  );

  // -------------------------------------------------------------------------
  // 9. Tax linearity: calculate(2x) === 2 * calculate(x) for non-JPY currencies
  //    (holds because Money stores integer cents and multiply uses Math.round)
  //    We allow an off-by-one due to double-rounding at the penny boundary.
  // -------------------------------------------------------------------------

  test.prop([nonZeroValidRate, fc.integer({ min: 0, max: 5_000_000 }), currency], propertyParams())(
    'calculate is approximately linear: tax(2n) is within 1 cent of 2*tax(n)',
    (rate, cents, cur) => {
      const tr = TaxRate.create(rate, 'VAT').value;
      const subtotal = Money.fromCents(cents, cur).value;
      const doubleSubtotal = Money.fromCents(cents * 2, cur).value;

      const taxOnce = tr.calculate(subtotal).cents;
      const taxDouble = tr.calculate(doubleSubtotal).cents;

      // Allow ±1 cent rounding difference due to Math.round on each half.
      expect(Math.abs(taxDouble - 2 * taxOnce)).toBeLessThanOrEqual(1);
    }
  );
});
