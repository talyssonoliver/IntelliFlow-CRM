import { describe, expect, it } from 'vitest';
import {
  buildSignatureNameSchema,
  createEmailSignatureInputSchema,
  setDefaultSignatureInputSchema,
  updateEmailSignatureInputSchema,
} from '../email-signatures';

const id = 'c' + 'x'.repeat(24);

describe('createEmailSignatureInputSchema', () => {
  it('trims the name and defaults isDefault to false', () => {
    expect(
      createEmailSignatureInputSchema.parse({ scope: 'USER', name: '  Work  ', html: '<p>Me</p>' })
    ).toEqual({ scope: 'USER', name: 'Work', html: '<p>Me</p>', isDefault: false });
  });

  it.each([
    ['empty name', { name: '   ' }],
    ['long name', { name: 'n'.repeat(101) }],
    ['long html', { html: 'h'.repeat(20_001) }],
    ['bad scope', { scope: 'TEAM' }],
    ['unknown key', { userId: 'u' }],
  ])('rejects %s', (_label, patch) => {
    expect(
      createEmailSignatureInputSchema.safeParse({
        scope: 'USER',
        name: 'Work',
        html: '<p>Me</p>',
        ...patch,
      }).success
    ).toBe(false);
  });
});

describe('updateEmailSignatureInputSchema / setDefaultSignatureInputSchema', () => {
  it('requires an id and accepts a partial update', () => {
    expect(updateEmailSignatureInputSchema.safeParse({ id, name: 'New' }).success).toBe(true);
    expect(updateEmailSignatureInputSchema.safeParse({ name: 'New' }).success).toBe(false);
    expect(setDefaultSignatureInputSchema.safeParse({ id }).success).toBe(true);
  });
});

describe('buildSignatureNameSchema (superRefine duplicate names)', () => {
  const existing = [
    { id: 'a', name: 'Work' },
    { id: 'b', name: 'Personal' },
  ];

  it('accepts a new unique name', () => {
    expect(buildSignatureNameSchema(existing).safeParse({ name: 'Sales' }).success).toBe(true);
  });

  it('rejects a duplicate name case-insensitively and after trimming', () => {
    const result = buildSignatureNameSchema(existing).safeParse({ name: '  work ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name']);
      expect(result.error.issues[0]?.message).toMatch(/already exists/i);
    }
  });

  it('allows keeping the same name when renaming the signature itself', () => {
    expect(buildSignatureNameSchema(existing, 'a').safeParse({ name: 'WORK' }).success).toBe(true);
  });

  it('rejects duplicates inside a list payload, pointing at the second row', () => {
    const result = buildSignatureNameSchema([]).safeParse({
      name: 'One',
      siblings: ['Alpha', 'beta', 'ALPHA'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['siblings', 2]);
      expect(result.error.issues[0]?.message).toContain('rows 1 and 3');
    }
  });
});
