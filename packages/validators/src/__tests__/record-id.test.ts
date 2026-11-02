/**
 * recordIdSchema (#1074): the id of a persisted record, as carried by queue jobs.
 *
 * Every core model uses `@default(cuid())`, seed data uses UUIDs, and scheduled
 * jobs use system ids, so the schema accepts all three and stays bounded with
 * the same character set as #1052's actor-id rule.
 */

import { describe, it, expect } from 'vitest';

import { recordIdSchema, MAX_RECORD_ID_LENGTH } from '../record-id';

// The shape Prisma's @default(cuid()) issues: 'c' plus 24 lower-case base36 chars.
const CUID = 'cmhbx3k2p0000l8086a1b2c3d';
const UUID = '0b6f3c1e-8f2a-4c3d-9e4f-5a6b7c8d9e0f';

describe('recordIdSchema', () => {
  it.each([
    ['a Prisma cuid', CUID],
    ['a seed uuid', UUID],
    ['an id at the length cap', 'a'.repeat(MAX_RECORD_ID_LENGTH)],
    ['an id with underscores and hyphens', 'tenant_system-1'],
  ])('accepts %s', (_label, id) => {
    expect(recordIdSchema.safeParse(id).success).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['an id over the length cap', 'a'.repeat(MAX_RECORD_ID_LENGTH + 1)],
    ['a path traversal', '../etc'],
    ['whitespace', 'c abc'],
    ['a newline', `${CUID}\n`],
    ['a quote', `${CUID}'`],
    ['a non-string', 42],
  ])('rejects %s', (_label, id) => {
    expect(recordIdSchema.safeParse(id).success).toBe(false);
  });

  it('caps ids at 64 characters, which fits a cuid (25) and a uuid (36)', () => {
    expect(MAX_RECORD_ID_LENGTH).toBe(64);
  });
});
