/**
 * Base Value Object class
 * Value Objects are immutable and compared by their properties
 */
export abstract class ValueObject<T> {
  protected readonly props: T;

  protected constructor(props: T) {
    this.props = Object.freeze(props);
  }

  equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    // Compare via a canonical serialization rather than a raw JSON.stringify of
    // the props. Raw JSON.stringify has two structural-equality gaps (RACE-PURE-12):
    //   1. Key order is significant — {a:1,b:2} and {b:2,a:1} stringify differently
    //      and would compare as NOT equal even though they are structurally equal.
    //   2. undefined-valued keys are silently dropped — {a:1,b:undefined} and {a:1}
    //      stringify identically and would compare as equal even though their shapes
    //      differ (a key is present in one and absent in the other).
    // canonicalize() sorts keys at every level and preserves the presence of an
    // explicitly-undefined key, while still rendering Date as its ISO string — so the
    // comparison for every existing concrete VO (Email/PhoneNumber/DateRange, whose
    // props are defined and in a fixed order) is unchanged.
    return JSON.stringify(canonicalize(this.props)) === JSON.stringify(canonicalize(other.props));
  }

  /**
   * Get raw value for serialization
   */
  abstract toValue(): unknown;
}

/**
 * Marker for an explicitly-`undefined` object value, so a present-but-undefined key
 * is distinguished from an absent key after serialization (JSON.stringify drops the
 * former). The prefix makes an accidental collision with a real string value
 * vanishingly unlikely.
 */
const UNDEFINED_SENTINEL = '__vo_undefined__';

/**
 * Produce a structurally-canonical representation of a value for equality:
 * - object keys are sorted at every depth (key-order independent),
 * - explicitly-`undefined` values become a sentinel (so they survive JSON.stringify),
 * - `Date` is rendered as its ISO string (matching prior JSON.stringify behaviour),
 * - arrays and nested objects are canonicalized recursively,
 * - all other primitives pass through unchanged.
 */
function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    return UNDEFINED_SENTINEL;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    canonical[key] = canonicalize(obj[key]);
  }
  return canonical;
}
