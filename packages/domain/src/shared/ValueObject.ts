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
    // produces JSON.stringify's exact output but with object keys in sorted order, so
    // the only behavioural change versus the previous comparison is key-order
    // independence.
    return stableStringify(this.props) === stableStringify(other.props);
  }

  /**
   * Get raw value for serialization
   */
  abstract toValue(): unknown;
}

/**
 * JSON.stringify a value with object keys emitted in sorted order, so two structurally
 * equal values produce the same string regardless of key insertion order.
 *
 * 1. `JSON.stringify(value)` applies every JSON rule — custom `toJSON()`, own-enumerable
 *    keys only, `Date`→ISO (invalid→`null`), dropping `undefined` values, and type
 *    handling. A top-level value it cannot represent (undefined / function / symbol /
 *    `toJSON()`→undefined) yields `undefined`; keep that distinct from JSON `null`.
 * 2. Re-parse to plain JSON data (no `Date`/`toJSON`/inherited/non-enumerable members
 *    remain), then re-serialize with the collected keys, sorted, as JSON.stringify's
 *    array replacer — which forces every object to emit its keys in that order. Running
 *    the sort through native JSON.stringify (rather than a hand-rolled recursion) keeps
 *    deep structures within the same engine limits the first pass already cleared, and on
 *    plain data the array replacer only sees own enumerable keys.
 */
function stableStringify(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    return 'undefined';
  }
  const normalized = JSON.parse(json);
  const keys = new Set<string>();
  JSON.stringify(normalized, (key, val) => {
    keys.add(key);
    return val;
  });
  return JSON.stringify(normalized, [...keys].sort());
}
