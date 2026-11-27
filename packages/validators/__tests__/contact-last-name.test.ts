/**
 * MVP-003: the last name is optional on a contact, the first name is not. A contact created from a
 * lead with only a company is named after the company (empty last name) and must be saveable.
 */
import { describe, it, expect } from 'vitest';
import { createContactSchema, updateContactSchema, contactResponseSchema } from '../src/contact';

const email = 'owner@pilates.example.invalid';
const ID = '123e4567-e89b-12d3-a456-426614174000';

describe('contact last name is optional (MVP-003)', () => {
  describe('createContactSchema', () => {
    it.each([
      ['omitted', {}],
      ['empty', { lastName: '' }],
      ['only spaces', { lastName: '   ' }],
    ])('saves with only a first name when the last name is %s', (_label, extra) => {
      const result = createContactSchema.safeParse({
        email,
        firstName: 'Studio Pilates Demo',
        ...extra,
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ firstName: 'Studio Pilates Demo', lastName: '' });
    });

    it('still keeps a last name that is given, trimmed', () => {
      const result = createContactSchema.safeParse({ email, firstName: 'Ana', lastName: ' Lima ' });
      expect(result.data?.lastName).toBe('Lima');
    });

    it('still requires a first name', () => {
      expect(createContactSchema.safeParse({ email, lastName: 'Lima' }).success).toBe(false);
      expect(
        createContactSchema.safeParse({ email, firstName: '', lastName: 'Lima' }).success
      ).toBe(false);
    });

    it('still bounds the last name', () => {
      const result = createContactSchema.safeParse({
        email,
        firstName: 'Ana',
        lastName: 'B'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateContactSchema', () => {
    it('lets the last name be cleared to empty', () => {
      const result = updateContactSchema.safeParse({
        id: ID,
        firstName: 'Studio Pilates Demo',
        lastName: '',
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ firstName: 'Studio Pilates Demo', lastName: '' });
    });

    it('leaves the last name out of the update when it is omitted, so it is not wiped', () => {
      const result = updateContactSchema.safeParse({ id: ID, firstName: 'Ana' });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('lastName');
    });

    it('still refuses an empty first name', () => {
      expect(updateContactSchema.safeParse({ id: ID, firstName: '' }).success).toBe(false);
    });
  });

  it('a contact with an empty last name is a valid response', () => {
    const base = {
      id: ID,
      email,
      firstName: 'Studio Pilates Demo',
      lastName: '',
      title: null,
      phone: null,
      department: null,
      status: 'ACTIVE',
      accountId: null,
      ownerId: ID,
      leadId: null,
      streetAddress: null,
      city: null,
      zipCode: null,
      company: null,
      linkedInUrl: null,
      contactType: null,
      tags: [],
      contactNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = contactResponseSchema.safeParse(base);
    expect(result.error?.issues.map((i) => i.path.join('.'))).not.toContain('lastName');
  });
});
