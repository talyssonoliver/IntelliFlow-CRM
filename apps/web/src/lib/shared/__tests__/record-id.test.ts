/**
 * isRecordId (#1097): the web's check for an id the api will accept.
 */

import { describe, it, expect } from 'vitest';

import { isRecordId } from '../record-id';

describe('isRecordId', () => {
  it.each([
    ['a Prisma cuid', 'cmhbx3k2p0000l8086a1b2c3d'],
    ['a seed uuid', '0b6f3c1e-8f2a-4c3d-9e4f-5a6b7c8d9e0f'],
  ])('accepts %s', (_label, id) => {
    expect(isRecordId(id)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['a path', '../admin'],
    ['whitespace', 'not a/valid id'],
    ['an over-long id', 'a'.repeat(65)],
  ])('rejects %s', (_label, id) => {
    expect(isRecordId(id)).toBe(false);
  });
});
