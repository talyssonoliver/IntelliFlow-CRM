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
    // Compare a canonical, type-tagged serialization of the props rather than a raw
    // JSON.stringify, which has structural-equality gaps (RACE-PURE-12 / #223):
    //   1. Key order is significant — {a:1,b:2} and {b:2,a:1} stringify differently
    //      yet are structurally equal.
    //   2. undefined-valued keys are silently dropped — {a:1,b:undefined} and {a:1}
    //      stringify identically yet differ in shape (key present vs absent).
    // canonicalize() sorts keys at every depth and emits a type tag for every value, so
    // a present-but-undefined key, and values that would otherwise serialize alike (e.g.
    // the string "1" vs the number 1), stay distinct. Existing concrete VOs
    // (Email/PhoneNumber/DateRange) — defined, fixed-order props — are unaffected.
    return JSON.stringify(canonicalize(this.props)) === JSON.stringify(canonicalize(other.props));
  }

  /**
   * Get raw value for serialization
   */
  abstract toValue(): unknown;
}

/**
 * Produce a structurally-canonical, type-tagged representation of a value for equality.
 *
 * Every value becomes a `[tag, ...]` tuple so distinct types never collide and special
 * object keys cannot be lost:
 * - `undefined` / `null` → `['undefined']` / `['null']` (distinguishes a present
 *   undefined key from an absent one without an ambiguous sentinel string),
 * - primitives → `[typeof, value]` (so `"1"` ≠ `1`),
 * - `Date` → `['date', iso | null]` — an *invalid* Date renders as `null` (matching the
 *   prior JSON.stringify behaviour) instead of throwing from `toISOString()`,
 * - arrays → `['array', items.map(canonicalize)]`,
 * - plain objects → `['object', sortedEntries]` built as `[key, value]` tuples (not by
 *   assigning to an object literal, which would trigger the `__proto__` setter and drop
 *   an own `__proto__` key), key-order independent.
 */
function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    return ['undefined'];
  }
  if (value === null) {
    return ['null'];
  }
  const valueType = typeof value;
  if (valueType !== 'object') {
    return [valueType, value];
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return ['date', Number.isNaN(time) ? null : value.toISOString()];
  }
  if (Array.isArray(value)) {
    return ['array', value.map(canonicalize)];
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .sort()
    .map((key) => [key, canonicalize(obj[key])]);
  return ['object', entries];
}
