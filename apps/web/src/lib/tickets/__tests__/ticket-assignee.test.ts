/**
 * Ticket assignee gate (#1097): both ticket detail pages assign through it.
 */

import { describe, it, expect } from 'vitest';

import { INVALID_ASSIGNEE_TOAST, toAssigneeId } from '../ticket-assignee';

describe('toAssigneeId', () => {
  it.each([
    ['a Prisma cuid', 'cmhbx3k2p0000l8086a1b2c3d', 'cmhbx3k2p0000l8086a1b2c3d'],
    ['a seed uuid', '0b6f3c1e-8f2a-4c3d-9e4f-5a6b7c8d9e0f', '0b6f3c1e-8f2a-4c3d-9e4f-5a6b7c8d9e0f'],
    ['a padded cuid, trimmed', '  cmhbx3k2p0000l8086a1b2c3d ', 'cmhbx3k2p0000l8086a1b2c3d'],
  ])('returns %s', (_label, input, expected) => {
    expect(toAssigneeId(input)).toBe(expected);
  });

  it.each([
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a word the api rejects', 'not-a-uuid'],
    ['a path', '../admin'],
  ])('returns null for %s', (_label, input) => {
    expect(toAssigneeId(input)).toBeNull();
  });

  it('keeps the destructive toast both pages show', () => {
    expect(INVALID_ASSIGNEE_TOAST).toEqual({
      title: 'Invalid Assignee',
      description: 'Cannot assign ticket because user ID is invalid.',
      variant: 'destructive',
    });
  });
});
