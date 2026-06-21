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
 * Step 1 normalizes the value through JSON's own rules — `JSON.parse(JSON.stringify(v))`
 * applies custom `toJSON()`, keeps only own enumerable properties, renders `Date` as its
 * ISO string (invalid Date → `null`), drops `undefined`-valued keys, and resolves all
 * primitive/type handling. The result is plain JSON data (objects, arrays, primitives).
 * Step 2 sorts the keys of that plain data recursively, then serializes. Because step 1
 * already stripped everything exotic (Dates, toJSON, inherited/non-enumerable props),
 * step 2 only ever reorders keys — it does not change which data is included.
 */
function stableStringify(value: unknown): string {
  const json = JSON.stringify(value);
  // A value JSON.stringify cannot represent at the top level (undefined, a function, a
  // symbol, or an object whose toJSON() returns undefined) yields `undefined`. Keep that
  // distinct from JSON `null` ("null"), as the prior raw-JSON.stringify comparison did.
  if (json === undefined) {
    return 'undefined';
  }
  return JSON.stringify(sortKeysDeep(JSON.parse(json)));
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  // Object.fromEntries creates own data properties, so an own `__proto__` key (which
  // JSON.parse can produce) is preserved rather than routed through the prototype setter.
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((key) => [key, sortKeysDeep(obj[key])])
  );
}
