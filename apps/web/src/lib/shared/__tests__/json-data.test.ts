import { describe, it, expect } from 'vitest';
import { hasFields, isLinkCategory, isOneOf, parseJsonArray } from '../json-data';

describe('hasFields', () => {
  it('accepts an object whose fields have the given kinds', () => {
    expect(
      hasFields(
        { a: 'x', n: 1, b: true, s: ['y'] },
        { a: 'string', n: 'number', b: 'boolean', s: 'string[]' }
      )
    ).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', [1]],
    ['a string', 'x'],
    ['a missing field', {}],
    ['a wrong kind', { a: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(hasFields(value, { a: 'string' })).toBe(false);
  });

  it('rejects a string[] field holding a non-string', () => {
    expect(hasFields({ s: ['ok', 2] }, { s: 'string[]' })).toBe(false);
  });

  it('allows an optional field to be absent, but not of the wrong kind', () => {
    expect(hasFields({ a: 'x' }, { a: 'string' }, { t: 'string[]' })).toBe(true);
    expect(hasFields({ a: 'x', t: 'not-an-array' }, { a: 'string' }, { t: 'string[]' })).toBe(
      false
    );
  });
});

describe('isOneOf', () => {
  it('accepts only the allowed strings', () => {
    expect(isOneOf('beta', ['beta', 'stable'])).toBe(true);
    expect(isOneOf('gamma', ['beta', 'stable'])).toBe(false);
    expect(isOneOf(1, ['beta'])).toBe(false);
  });
});

describe('isLinkCategory', () => {
  const category = { id: 'c', title: 'T', description: 'D', icon: 'code', color: 'bg-blue-500' };
  const isItem = (v: unknown) => hasFields(v, { id: 'string' });

  it('accepts a category whose items all pass', () => {
    expect(isLinkCategory({ ...category, items: [{ id: 'a' }] }, isItem)).toBe(true);
  });

  it('rejects a category with a bad item, no items, or a missing field', () => {
    expect(isLinkCategory({ ...category, items: [{ id: 1 }] }, isItem)).toBe(false);
    expect(isLinkCategory(category, isItem)).toBe(false);
    expect(isLinkCategory({ ...category, color: undefined, items: [] }, isItem)).toBe(false);
  });
});

describe('parseJsonArray', () => {
  const isNumber = (v: unknown) => typeof v === 'number';

  it('returns the array when every entry passes', () => {
    expect(parseJsonArray<number>([1, 2], 'nums.json', isNumber)).toEqual([1, 2]);
  });

  it('names the file when the data is not an array', () => {
    expect(() => parseJsonArray({}, 'nums.json', isNumber)).toThrow('nums.json: expected an array');
  });

  it('names the file and the first bad entry', () => {
    expect(() => parseJsonArray([1, 'two', 'three'], 'nums.json', isNumber)).toThrow(
      'nums.json: entry 1 does not match its type'
    );
  });
});
