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
 * primitive/type handling. A top-level value JSON cannot represent (undefined / function
 * / symbol / `toJSON()`→undefined) yields `undefined`; keep that distinct from JSON
 * `null`. The result is otherwise plain JSON data (objects, arrays, primitives). Step 2
 * sorts the keys of that plain data recursively over its own enumerable keys only
 * (`Object.fromEntries` preserves an own `__proto__` key rather than routing it through
 * the prototype setter), then serializes. Because step 1 already stripped everything
 * exotic, step 2 only ever reorders keys.
 */
function stableStringify(value: unknown): string {
  // `JSON.stringify` is typed to return `string`, but at runtime it returns
  // `undefined` for a top-level value JSON cannot represent (undefined / function
  // / symbol / `toJSON()`→undefined). Type `json` honestly as `string | undefined`
  // so the undefined branch is a real, reachable path — without this annotation a
  // type-flow analyzer treats `json === undefined` as always-false dead code.
  const json: string | undefined = JSON.stringify(value);
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
  return Object.fromEntries(
    Object.keys(obj)
      // Deterministic, locale-INDEPENDENT key ordering (UTF-16 code-unit order,
      // identical to the default `.sort()` behaviour). A canonical serialization
      // must NOT use `localeCompare` — it is locale-dependent, so the same props
      // could canonicalize differently across environments and break equality.
      .sort((a, b) => {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
      })
      .map((key) => [key, sortKeysDeep(obj[key])])
  );
}
