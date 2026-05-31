/**
 * Reusable fast-check arbitraries for primitive domain types.
 * @module tests/property/support/arbitraries/primitives
 */

import fc from 'fast-check';

/**
 * Currencies accepted by `Money` (domain `Money.SUPPORTED_CURRENCIES`, de-duped).
 * NOTE: the domain list currently duplicates 'GBP' and omits 'USD' — tracked as a
 * data bug; this arbitrary intentionally generates only currencies `Money.create`
 * actually accepts, so Money round-trip properties stay sound.
 */
export const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'CAD', 'AUD', 'JPY'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** A supported ISO-4217 currency code. */
export const arbCurrency: fc.Arbitrary<SupportedCurrency> = fc.constantFrom(
  ...SUPPORTED_CURRENCIES
);

/** Non-negative integer minor units (cents), bounded well within safe-integer range. */
export const arbCents: fc.Arbitrary<number> = fc.integer({ min: 0, max: 1_000_000_000 });

/** A non-negative decimal amount rounded to 2 dp (avoids float drift in generators). */
export const arbAmount: fc.Arbitrary<number> = fc
  .double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100);

/** A tenant identifier (UUID v4 shape). */
export const arbTenantId: fc.Arbitrary<string> = fc.uuid();

/** A generic entity identifier (UUID v4 shape). */
export const arbId: fc.Arbitrary<string> = fc.uuid();

/** A syntactically valid email address. */
export const arbEmail: fc.Arbitrary<string> = fc.emailAddress();

/** A trimmed, non-empty short string (names, titles). */
export const arbNonEmptyString: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0);

/** A positive integer count/quantity (1..1000). */
export const arbCount: fc.Arbitrary<number> = fc.integer({ min: 1, max: 1000 });

/** A capacity limit (1..50) — small so over-capacity races are easy to hit. */
export const arbCapacity: fc.Arbitrary<number> = fc.integer({ min: 1, max: 50 });
