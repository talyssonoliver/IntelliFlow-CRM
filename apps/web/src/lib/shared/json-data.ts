/**
 * Shape checks for content kept as JSON under src/data.
 *
 * A JSON import is typed from whatever the file happens to contain, not from
 * the interface the code relies on, so each data file is checked once when its
 * module loads. A malformed entry then fails loudly, naming the file and the
 * entry, instead of rendering `undefined` somewhere downstream.
 */

export type FieldKind = 'string' | 'number' | 'boolean' | 'string[]';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function kindMatches(value: unknown, kind: FieldKind): boolean {
  return kind === 'string[]' ? isStringArray(value) : typeof value === kind;
}

/**
 * Whether `value` is a plain object whose `required` fields all have the given
 * kinds, and whose `optional` fields, when present, do too.
 */
export function hasFields(
  value: unknown,
  required: Readonly<Record<string, FieldKind>>,
  optional: Readonly<Record<string, FieldKind>> = {}
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    Object.entries(required).every(([key, kind]) => kindMatches(obj[key], kind)) &&
    Object.entries(optional).every(
      ([key, kind]) => obj[key] === undefined || kindMatches(obj[key], kind)
    )
  );
}

/** Whether `value` is one of the `allowed` strings. */
export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * A category of linked items, the shape the developer integration and guide
 * lists share: id, title, description, icon, colour, and `items` that each
 * pass `isItem`.
 */
export function isLinkCategory(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return (
    hasFields(value, {
      id: 'string',
      title: 'string',
      description: 'string',
      icon: 'string',
      color: 'string',
    }) &&
    Array.isArray(value.items) &&
    value.items.every(isItem)
  );
}

/**
 * Returns `data` as `T[]` once every entry passes `isItem`; otherwise throws,
 * naming `source` and the index of the first entry that does not.
 */
export function parseJsonArray<T>(
  data: unknown,
  source: string,
  isItem: (item: unknown) => boolean
): T[] {
  if (!Array.isArray(data)) throw new Error(`${source}: expected an array`);
  const bad = data.findIndex((entry) => !isItem(entry));
  if (bad !== -1) throw new Error(`${source}: entry ${bad} does not match its type`);
  return data as T[];
}
