import { describe, it, expect } from 'vitest';
import { createAccountSchema, updateAccountSchema } from '../account';

const ID = '00000000-0000-4000-8000-000000000001';

describe('account geography validators (PG-197)', () => {
  describe('createAccountSchema', () => {
    it('accepts optional geography and ownerId', () => {
      const result = createAccountSchema.parse({
        name: 'Acme',
        country: ' gb ',
        region: 'London',
        postalCode: 'SW1A 1AA',
        ownerId: ID,
      });
      expect(result).toMatchObject({
        country: 'GB',
        region: 'London',
        postalCode: 'SW1A 1AA',
        ownerId: ID,
      });
    });

    it('accepts an account without geography or ownerId', () => {
      const result = createAccountSchema.parse({ name: 'Acme' });
      expect(result.country).toBeUndefined();
      expect(result.ownerId).toBeUndefined();
    });

    it('rejects UK (the ISO code is GB)', () => {
      expect(createAccountSchema.safeParse({ name: 'Acme', country: 'UK' }).success).toBe(false);
    });

    it('rejects a region over 100 and a postal code over 20 characters', () => {
      expect(createAccountSchema.safeParse({ name: 'A', region: 'r'.repeat(101) }).success).toBe(
        false
      );
      expect(createAccountSchema.safeParse({ name: 'A', postalCode: 'p'.repeat(21) }).success).toBe(
        false
      );
    });

    it('turns empty strings into undefined', () => {
      const result = createAccountSchema.parse({
        name: 'Acme',
        country: '',
        region: ' ',
        postalCode: '',
      });
      expect(result.country).toBeUndefined();
      expect(result.region).toBeUndefined();
      expect(result.postalCode).toBeUndefined();
    });

    it('rejects an ownerId that is not an id', () => {
      expect(createAccountSchema.safeParse({ name: 'A', ownerId: '' }).success).toBe(false);
    });
  });

  describe('updateAccountSchema', () => {
    it('accepts null to clear', () => {
      const result = updateAccountSchema.parse({
        id: ID,
        country: null,
        region: null,
        postalCode: null,
      });
      expect(result).toMatchObject({ country: null, region: null, postalCode: null });
    });

    it('maps an empty string to null (clear)', () => {
      expect(updateAccountSchema.parse({ id: ID, region: '' }).region).toBeNull();
    });

    it('leaves absent fields undefined (unchanged)', () => {
      const result = updateAccountSchema.parse({ id: ID, name: 'Acme' });
      expect(result.country).toBeUndefined();
      expect(result.region).toBeUndefined();
      expect(result.postalCode).toBeUndefined();
    });

    it('rejects an invalid country', () => {
      expect(updateAccountSchema.safeParse({ id: ID, country: 'ZZ' }).success).toBe(false);
    });

    it('does not accept ownerId', () => {
      const result = updateAccountSchema.parse({ id: ID, ownerId: ID } as never);
      expect(result).not.toHaveProperty('ownerId');
    });
  });
});
