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
    // Compare a key-order-independent serialization of the props. A raw
    // JSON.stringify(props) is order-sensitive — {a:1,b:2} and {b:2,a:1} stringify
    // differently yet are structurally equal (RACE-PURE-12 / #223). stableStringify
    // delegates ALL serialization to JSON.stringify (so toJSON(), Date→ISO, invalid
    // Date→null, undefined-key drop, and type distinctions like 1 vs "1" are preserved
    // exactly), and only forces object keys into a canonical (sorted) order — so the
    // sole behavioural change versus the previous comparison is key-order independence.
    return stableStringify(this.props) === stableStringify(other.props);
  }

  /**
   * Get raw value for serialization
   */
  abstract toValue(): unknown;
}

/**
 * JSON.stringify a value with object keys emitted in a canonical (sorted) order, so two
 * structurally-equal values produce the same string regardless of key insertion order.
 *
 * Uses the standard two-pass array-replacer technique: the first pass collects every
 * property key that appears anywhere in the structure; the second pass passes those keys
 * (sorted) as JSON.stringify's array replacer, which forces every object to emit its keys
 * in that order. All other serialization semantics (custom toJSON, Date, dropping
 * undefined values, primitive/type handling) are JSON.stringify's own.
 */
function stableStringify(value: unknown): string {
  const keys = new Set<string>();
  JSON.stringify(value, (key, val) => {
    keys.add(key);
    return val;
  });
  return JSON.stringify(value, [...keys].sort());
}
