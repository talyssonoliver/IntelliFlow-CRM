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
    // Compare a canonical serialization of the props. A raw JSON.stringify(props) is
    // key-order sensitive — {a:1,b:2} and {b:2,a:1} stringify differently yet are
    // structurally equal (RACE-PURE-12 / #223). canonicalize() sorts object keys at
    // every depth to remove that fragility.
    //
    // It deliberately PRESERVES the other JSON.stringify semantics, in particular that
    // an `undefined`-valued key is dropped: many VO factories materialise optional
    // props as `x: options?.x` (i.e. present-but-undefined) while other shapes omit
    // them, and those must stay equal (e.g. Recurrence.createDaily without options).
    // Date (incl. invalid → null) and primitive/type distinctions are left to
    // JSON.stringify, so existing concrete VOs are unaffected.
    return JSON.stringify(canonicalize(this.props)) === JSON.stringify(canonicalize(other.props));
  }

  /**
   * Get raw value for serialization
   */
  abstract toValue(): unknown;
}

/**
 * Rebuild a value with object keys sorted at every depth, so structural equality is
 * independent of key insertion order. Everything else is left exactly as JSON.stringify
 * would render it:
 * - primitives and `null` pass through (JSON already distinguishes e.g. `1` from `"1"`),
 * - `Date` passes through (JSON renders its ISO string, or `null` for an invalid Date —
 *   no `toISOString()` throw),
 * - arrays are recursed element-wise (order is significant),
 * - plain objects are rebuilt via `Object.fromEntries` over sorted, non-`undefined`
 *   entries — dropping `undefined` matches JSON.stringify, and `Object.fromEntries`
 *   creates own data properties (so an own `__proto__` key is preserved, not routed
 *   through the prototype setter).
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .sort()
    .filter((key) => obj[key] !== undefined)
    .map((key) => [key, canonicalize(obj[key])] as const);
  return Object.fromEntries(entries);
}
