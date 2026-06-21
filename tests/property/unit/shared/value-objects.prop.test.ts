/**
 * Property tests for shared value objects: ValueObject base, DateRange, PhoneNumber, Email.
 *
 * Invariant ledger IDs covered:
 *   RACE-PURE-12 — ValueObject.equals uses JSON.stringify; properties verify reflexivity,
 *                  symmetry, and transitivity of equals(), plus idempotency of normalisation
 *                  for Email and PhoneNumber, and round-trip (create→toValue→reconstitute).
 *
 * @see docs/operations/property-testing/race-condition-findings.json (RACE-PURE-12)
 */

import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { DateRange, PhoneNumber, Email, ValueObject } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// Test-local concrete ValueObject so the base-class equality semantics can be
// exercised directly (concrete domain VOs only ever store defined, fixed-order
// props, so they cannot reach the key-order / undefined-key paths).
class TestValueObject extends ValueObject<Record<string, unknown>> {
  constructor(props: Record<string, unknown>) {
    super(props);
  }
  toValue(): Record<string, unknown> {
    return this.props;
  }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Assert a DateRange create succeeds and return the value. */
function mkRange(start: Date, end: Date): DateRange {
  const r = DateRange.create(start, end);
  expect(r.isSuccess).toBe(true);
  return r.value;
}

// ---------------------------------------------------------------------------
// Inline arbitraries (not in shared support — per instructions)
// ---------------------------------------------------------------------------

const MIN_MS = Date.UTC(2020, 0, 1);
const MAX_MS = Date.UTC(2030, 0, 1);
const MIN_DUR_MS = 1_000 * 60 * 5; // 5 minutes
const MAX_DUR_MS = 1_000 * 60 * 60 * 8; // 8 hours

/** A valid Date in a bounded window. */
const arbDate: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_MS, max: MAX_MS })
  .map((ms) => new Date(ms));

/** A valid (start <= end) Date pair. */
const arbDatePair: fc.Arbitrary<{ start: Date; end: Date }> = fc
  .tuple(
    fc.integer({ min: MIN_MS, max: MAX_MS - MAX_DUR_MS }),
    fc.integer({ min: MIN_DUR_MS, max: MAX_DUR_MS })
  )
  .map(([startMs, durMs]) => ({
    start: new Date(startMs),
    end: new Date(startMs + durMs),
  }));

/**
 * US phone numbers in E.164 format (+1 followed by 10 digits, area code 200–999).
 * Must NOT start with 0 or 1, and leading digit of subscriber block not 0 or 1.
 */
const arbE164US: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 200, max: 999 }), // area code
    fc.integer({ min: 200, max: 999 }), // exchange
    fc.integer({ min: 0, max: 9999 }) // subscriber
  )
  .map(([area, exch, sub]) => `+1${area}${exch}${String(sub).padStart(4, '0')}`);

/**
 * Valid email addresses — simple ASCII local@domain.tld shape accepted by
 * Email.create's regex. Uses lowercase to match the normalisation.
 */
const arbValidEmail: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9._%+-]{0,30}[a-z0-9]$/).filter((s) => s.length >= 2),
    fc.stringMatching(/^[a-z][a-z0-9-]{1,20}[a-z0-9]$/).filter((s) => s.length >= 2),
    fc.constantFrom('com', 'net', 'org', 'io', 'co')
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// ---------------------------------------------------------------------------
// RACE-PURE-12 — ValueObject equality laws (reflexivity, symmetry, transitivity)
// ---------------------------------------------------------------------------

describe('ValueObject — RACE-PURE-12: equality laws', () => {
  // Reflexivity: every valid instance equals itself.
  test.prop([arbDatePair], propertyParams())(
    'DateRange: equals() is reflexive (RACE-PURE-12)',
    (pair) => {
      const r = mkRange(pair.start, pair.end);
      expect(r.equals(r)).toBe(true);
    }
  );

  // Symmetry: two instances created with the same inputs are mutually equal.
  test.prop([arbDatePair], propertyParams())(
    'DateRange: equals() is symmetric for identical-valued instances (RACE-PURE-12)',
    (pair) => {
      const a = mkRange(pair.start, pair.end);
      const b = mkRange(pair.start, pair.end);
      expect(a.equals(b)).toBe(b.equals(a));
      expect(a.equals(b)).toBe(true);
    }
  );

  // Transitivity: a==b && b==c => a==c.
  test.prop([arbDatePair], propertyParams())(
    'DateRange: equals() is transitive for equal instances (RACE-PURE-12)',
    (pair) => {
      const a = mkRange(pair.start, pair.end);
      const b = mkRange(pair.start, pair.end);
      const c = mkRange(pair.start, pair.end);
      if (a.equals(b) && b.equals(c)) {
        expect(a.equals(c)).toBe(true);
      }
    }
  );

  // Two ranges with different timestamps must NOT be equal.
  test.prop([arbDatePair, arbDatePair], propertyParams())(
    'DateRange: instances with different timestamps are not equal (RACE-PURE-12)',
    (p1, p2) => {
      fc.pre(p1.start.getTime() !== p2.start.getTime() || p1.end.getTime() !== p2.end.getTime());
      const a = mkRange(p1.start, p1.end);
      const b = mkRange(p2.start, p2.end);
      expect(a.equals(b)).toBe(false);
    }
  );

  // Null/undefined comparisons must always return false (base class guard).
  test.prop([arbDatePair], propertyParams())(
    'DateRange: equals(null) and equals(undefined) return false (RACE-PURE-12)',
    (pair) => {
      const r = mkRange(pair.start, pair.end);
      expect(r.equals(null as never)).toBe(false);
      expect(r.equals(undefined as never)).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// RACE-PURE-12 — ValueObject.equals structural semantics (#223)
//
// ValueObject.equals previously compared raw JSON.stringify(props), which has two
// structural-equality gaps: (1) key order was significant, and (2) undefined-valued
// keys were silently dropped (so {a:1,b:undefined} compared equal to {a:1}). The base
// class now canonicalizes props (sorted keys at every depth + an explicit marker for
// undefined values + Date→ISO), so these tests exercise the real equals() via a
// test-local VO rather than tautologically asserting JSON.stringify behaviour.
// ---------------------------------------------------------------------------

describe('ValueObject — RACE-PURE-12: structural equality of props (#223)', () => {
  it('distinguishes a present-but-undefined key from an absent key', () => {
    const withUndefinedKey = new TestValueObject({ a: 1, b: undefined });
    const withoutKey = new TestValueObject({ a: 1 });
    expect(withUndefinedKey.equals(withoutKey)).toBe(false);
    expect(withoutKey.equals(withUndefinedKey)).toBe(false);
  });

  it('treats key order as irrelevant: {a:1,b:2} equals {b:2,a:1}', () => {
    expect(new TestValueObject({ a: 1, b: 2 }).equals(new TestValueObject({ b: 2, a: 1 }))).toBe(
      true
    );
  });

  it('remains reflexive and value-sensitive for defined props', () => {
    expect(new TestValueObject({ a: 1 }).equals(new TestValueObject({ a: 1 }))).toBe(true);
    expect(new TestValueObject({ a: 1 }).equals(new TestValueObject({ a: 2 }))).toBe(false);
  });

  it('compares nested objects and Dates structurally (order-independent)', () => {
    const a = new TestValueObject({
      when: new Date('2026-01-01T00:00:00.000Z'),
      meta: { x: 1, y: 2 },
    });
    const b = new TestValueObject({
      meta: { y: 2, x: 1 },
      when: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(a.equals(b)).toBe(true);
  });

  it('does not throw on an invalid Date prop (treated as a null marker)', () => {
    const invalid1 = new TestValueObject({ when: new Date('not-a-date') });
    const invalid2 = new TestValueObject({ when: new Date('also-invalid') });
    const valid = new TestValueObject({ when: new Date('2026-01-01T00:00:00.000Z') });
    expect(() => invalid1.equals(valid)).not.toThrow();
    expect(invalid1.equals(invalid2)).toBe(true); // both invalid → both the null marker
    expect(invalid1.equals(valid)).toBe(false);
  });

  it('distinguishes a string value from the same-shaped undefined (no sentinel collision)', () => {
    expect(
      new TestValueObject({ a: undefined }).equals(new TestValueObject({ a: '__vo_undefined__' }))
    ).toBe(false);
  });

  it('distinguishes types that would otherwise serialize alike (1 vs "1", null vs "null")', () => {
    expect(new TestValueObject({ a: 1 }).equals(new TestValueObject({ a: '1' }))).toBe(false);
    expect(new TestValueObject({ a: null }).equals(new TestValueObject({ a: 'null' }))).toBe(false);
    expect(new TestValueObject({ a: null }).equals(new TestValueObject({ a: null }))).toBe(true);
  });

  it('compares array props structurally and order-sensitively', () => {
    expect(new TestValueObject({ a: [1, 2] }).equals(new TestValueObject({ a: [1, 2] }))).toBe(
      true
    );
    expect(new TestValueObject({ a: [1, 2] }).equals(new TestValueObject({ a: [2, 1] }))).toBe(
      false
    );
  });

  it('preserves an own __proto__ key instead of dropping it', () => {
    // JSON.parse creates __proto__ as an own enumerable data property.
    const withProtoA = new TestValueObject(JSON.parse('{"__proto__": 1, "a": 2}'));
    const withProtoB = new TestValueObject(JSON.parse('{"__proto__": 9, "a": 2}'));
    const withoutProto = new TestValueObject({ a: 2 });
    expect(withProtoA.equals(withProtoB)).toBe(false); // differ only by __proto__ value
    expect(withProtoA.equals(withoutProto)).toBe(false); // present vs absent __proto__
  });
});

// ---------------------------------------------------------------------------
// Email — normalisation idempotency and round-trip
// ---------------------------------------------------------------------------

describe('Email — normalisation idempotency and round-trip (RACE-PURE-12)', () => {
  // create() normalises to lowercase; applying create() again to the normalised
  // value must yield the same stored string (idempotency).
  test.prop([arbValidEmail], propertyParams())(
    'normalisation is idempotent: create(email).value equals create(create(email).value).value',
    (raw) => {
      const r1 = Email.create(raw);
      expect(r1.isSuccess).toBe(true);
      const normalised = r1.value.toValue();

      const r2 = Email.create(normalised);
      expect(r2.isSuccess).toBe(true);
      expect(r2.value.toValue()).toBe(normalised);
    }
  );

  // Case-folding: uppercase input normalises to the same value as lowercase.
  test.prop([arbValidEmail], propertyParams())(
    'create() normalises case: UPPER input equals lowercase stored value',
    (lower) => {
      const upper = lower.toUpperCase();
      const r = Email.create(upper);
      expect(r.isSuccess).toBe(true);
      expect(r.value.toValue()).toBe(lower.toLowerCase().trim());
    }
  );

  // Round-trip: create → toValue → create preserves the stored value.
  test.prop([arbValidEmail], propertyParams())(
    'create→toValue→create round-trip preserves the stored value',
    (raw) => {
      const r1 = Email.create(raw);
      expect(r1.isSuccess).toBe(true);
      const stored = r1.value.toValue();

      const r2 = Email.create(stored);
      expect(r2.isSuccess).toBe(true);
      expect(r2.value.toValue()).toBe(stored);
    }
  );

  // Equality reflexivity for Email instances.
  test.prop([arbValidEmail], propertyParams())(
    'Email: two instances from the same value are equal (reflexivity / RACE-PURE-12)',
    (raw) => {
      const a = Email.create(raw);
      const b = Email.create(raw);
      expect(a.isSuccess).toBe(true);
      expect(b.isSuccess).toBe(true);
      expect(a.value.equals(b.value)).toBe(true);
      expect(b.value.equals(a.value)).toBe(true);
    }
  );

  // Reject empty / null / undefined.
  test.prop([fc.constantFrom('', '   ', '\t', '\n')], propertyParams())(
    'create() rejects blank / whitespace-only inputs',
    (blank) => {
      const r = Email.create(blank);
      expect(r.isFailure).toBe(true);
    }
  );

  // Reject inputs exceeding RFC 5321 maximum length (320 chars).
  test.prop([fc.string({ minLength: 321, maxLength: 400 })], propertyParams())(
    'create() rejects inputs exceeding 320 characters',
    (longStr) => {
      const r = Email.create(longStr);
      expect(r.isFailure).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// PhoneNumber — normalisation idempotency and round-trip
// ---------------------------------------------------------------------------

describe('PhoneNumber — normalisation idempotency and round-trip (RACE-PURE-12)', () => {
  // E.164 input is already normalised; create() must preserve it unchanged.
  test.prop([arbE164US], propertyParams())(
    'E.164 input is stored verbatim (already normalised)',
    (e164) => {
      const r = PhoneNumber.create(e164);
      expect(r.isSuccess, `PhoneNumber.create(${e164}) should succeed`).toBe(true);
      expect(r.value.toValue()).toBe(e164);
    }
  );

  // Normalisation is idempotent: create(phone).value → create again → same value.
  test.prop([arbE164US], propertyParams())(
    'normalisation is idempotent: create(phone).value fed back into create yields the same result',
    (e164) => {
      const r1 = PhoneNumber.create(e164);
      expect(r1.isSuccess).toBe(true);
      const stored = r1.value.toValue();

      const r2 = PhoneNumber.create(stored);
      expect(r2.isSuccess).toBe(true);
      expect(r2.value.toValue()).toBe(stored);
    }
  );

  // Round-trip: create → toValue → create preserves E.164 form.
  test.prop([arbE164US], propertyParams())(
    'create→toValue→create round-trip preserves stored E.164 value',
    (e164) => {
      const r1 = PhoneNumber.create(e164);
      expect(r1.isSuccess).toBe(true);
      const v = r1.value.toValue(); // E.164 string

      const r2 = PhoneNumber.create(v);
      expect(r2.isSuccess).toBe(true);
      expect(r2.value.toValue()).toBe(v);
    }
  );

  // Equality symmetry: two PhoneNumber instances created with the same E.164 string
  // must be mutually equal (RACE-PURE-12 symmetry law).
  test.prop([arbE164US], propertyParams())(
    'PhoneNumber: two instances from the same E.164 value are equal (RACE-PURE-12)',
    (e164) => {
      const a = PhoneNumber.create(e164);
      const b = PhoneNumber.create(e164);
      expect(a.isSuccess).toBe(true);
      expect(b.isSuccess).toBe(true);
      expect(a.value.equals(b.value)).toBe(true);
      expect(b.value.equals(a.value)).toBe(true);
    }
  );

  // Two distinct E.164 numbers must not be equal.
  test.prop([arbE164US, arbE164US], propertyParams())(
    'PhoneNumber: two instances with different E.164 values are not equal (RACE-PURE-12)',
    (e164a, e164b) => {
      fc.pre(e164a !== e164b);
      const a = PhoneNumber.create(e164a);
      const b = PhoneNumber.create(e164b);
      expect(a.isSuccess).toBe(true);
      expect(b.isSuccess).toBe(true);
      expect(a.value.equals(b.value)).toBe(false);
    }
  );

  // Reject empty / null / undefined inputs.
  it('create() rejects null', () => {
    expect(PhoneNumber.create(null).isFailure).toBe(true);
  });

  it('create() rejects undefined', () => {
    expect(PhoneNumber.create(undefined).isFailure).toBe(true);
  });

  it('create() rejects empty string', () => {
    expect(PhoneNumber.create('').isFailure).toBe(true);
  });

  // Strings with no digits at all must be rejected.
  test.prop(
    [fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/\d/.test(s))],
    propertyParams()
  )('create() rejects strings containing no digits', (noDigits) => {
    const r = PhoneNumber.create(noDigits);
    expect(r.isFailure).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DateRange — create / validation and immutability invariants
// ---------------------------------------------------------------------------

describe('DateRange — create and immutability invariants (RACE-PURE-12)', () => {
  // Create succeeds iff start <= end; start strictly after end must fail.
  test.prop([arbDatePair], propertyParams())(
    'create() succeeds when start <= end and toValue() preserves timestamps',
    (pair) => {
      const r = mkRange(pair.start, pair.end);
      const v = r.toValue();
      expect(v.start.getTime()).toBe(pair.start.getTime());
      expect(v.end.getTime()).toBe(pair.end.getTime());
    }
  );

  test.prop([arbDatePair], propertyParams())(
    'create() fails when start is strictly after end',
    (pair) => {
      fc.pre(pair.start.getTime() !== pair.end.getTime());
      const reversed = DateRange.create(pair.end, pair.start);
      expect(reversed.isFailure).toBe(true);
    }
  );

  // start and end getters return new Date copies (not the internal reference).
  test.prop([arbDatePair], propertyParams())(
    'start and end getters return independent copies (immutability)',
    (pair) => {
      const r = mkRange(pair.start, pair.end);
      const startCopy = r.start;
      const endCopy = r.end;

      // Mutate the copies — the stored timestamps must remain unchanged.
      startCopy.setFullYear(1970);
      endCopy.setFullYear(1970);

      expect(r.start.getTime()).toBe(pair.start.getTime());
      expect(r.end.getTime()).toBe(pair.end.getTime());
    }
  );

  // durationInMs is always non-negative for valid ranges.
  test.prop([arbDatePair], propertyParams())(
    'durationInMs is always >= 0 for valid ranges',
    (pair) => {
      const r = mkRange(pair.start, pair.end);
      expect(r.durationInMs).toBeGreaterThanOrEqual(0);
    }
  );

  // contains() is consistent with the stored endpoints.
  test.prop([arbDatePair, arbDate], propertyParams())(
    'contains() returns true for points within [start, end] and false outside',
    (pair, point) => {
      const r = mkRange(pair.start, pair.end);
      const ts = point.getTime();
      const inside = ts >= pair.start.getTime() && ts <= pair.end.getTime();
      expect(r.contains(point)).toBe(inside);
    }
  );

  // overlaps() is symmetric.
  test.prop([arbDatePair, arbDatePair], propertyParams())(
    'overlaps() is symmetric (RACE-PURE-12)',
    (p1, p2) => {
      const a = mkRange(p1.start, p1.end);
      const b = mkRange(p2.start, p2.end);
      expect(a.overlaps(b)).toBe(b.overlaps(a));
    }
  );

  // String form of DateRange.create from ISO strings round-trips timestamps.
  test.prop([arbDatePair], propertyParams())(
    'create() from ISO strings preserves timestamps (string input path)',
    (pair) => {
      const r = DateRange.create(pair.start.toISOString(), pair.end.toISOString());
      expect(r.isSuccess).toBe(true);
      expect(r.value.start.getTime()).toBe(pair.start.getTime());
      expect(r.value.end.getTime()).toBe(pair.end.getTime());
    }
  );

  // The same range created with the same dates is equal (reflexivity through equals).
  test.prop([arbDatePair], propertyParams())(
    'two DateRange instances created with identical timestamps are equal (RACE-PURE-12)',
    (pair) => {
      const a = mkRange(pair.start, pair.end);
      const b = mkRange(pair.start, pair.end);
      expect(a.equals(b)).toBe(true);
    }
  );
});
