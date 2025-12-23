/**
 * ContactId Value Object Tests
 *
 * Tests UUID validation for contact identifiers
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { ContactId, InvalidContactIdError } from '../ContactId';
import { validate as uuidValidate } from 'uuid';

describe('ContactId', () => {
  describe('create()', () => {
    it('should create with valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = ContactId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(ContactId);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with valid UUIDv4', () => {
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const result = ContactId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with uppercase UUID', () => {
      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = ContactId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should reject empty string', () => {
      const result = ContactId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
      expect(result.error.code).toBe('INVALID_CONTACT_ID');
      expect(result.error.message).toContain('Invalid contact ID:');
    });

    it('should reject null', () => {
      const result = ContactId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
    });

    it('should reject undefined', () => {
      const result = ContactId.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
    });

    it('should reject invalid UUID format', () => {
      const result = ContactId.create('not-a-uuid');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
      expect(result.error.code).toBe('INVALID_CONTACT_ID');
    });

    it('should reject UUID with missing hyphens', () => {
      const result = ContactId.create('550e8400e29b41d4a716446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
    });

    it('should reject UUID that is too short', () => {
      const result = ContactId.create('550e8400-e29b-41d4-a716-44665544000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
    });

    it('should reject random string', () => {
      const result = ContactId.create('abc123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactIdError);
    });
  });

  describe('generate()', () => {
    it('should generate valid UUID', () => {
      const contactId = ContactId.generate();

      expect(contactId).toBeInstanceOf(ContactId);
      expect(uuidValidate(contactId.value)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const contactId1 = ContactId.generate();
      const contactId2 = ContactId.generate();

      expect(contactId1.value).not.toBe(contactId2.value);
    });

    it('should generate multiple unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(ContactId.generate().value);
      }

      expect(ids.size).toBe(50);
    });

    it('should generate UUIDs in valid format', () => {
      const contactId = ContactId.generate();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuidPattern.test(contactId.value)).toBe(true);
    });
  });

  describe('value', () => {
    it('should return the UUID value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const contactId = ContactId.create(uuid).value;

      expect(contactId.value).toBe(uuid);
    });

    it('should return generated UUID value', () => {
      const contactId = ContactId.generate();

      expect(typeof contactId.value).toBe('string');
      expect(uuidValidate(contactId.value)).toBe(true);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const contactId1 = ContactId.create(uuid).value;
      const contactId2 = ContactId.create(uuid).value;

      expect(contactId1.equals(contactId2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const contactId1 = ContactId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const contactId2 = ContactId.create('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d').value;

      expect(contactId1.equals(contactId2)).toBe(false);
    });

    it('should return false for null', () => {
      const contactId = ContactId.generate();

      expect(contactId.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const contactId = ContactId.generate();

      expect(contactId.equals(undefined as any)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const contactId = ContactId.create(uuid).value;

      expect(contactId.toValue()).toBe(uuid);
    });

    it('should return generated UUID string', () => {
      const contactId = ContactId.generate();
      const value = contactId.toValue();

      expect(typeof value).toBe('string');
      expect(uuidValidate(value)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID as string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const contactId = ContactId.create(uuid).value;

      expect(contactId.toString()).toBe(uuid);
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const contactId = ContactId.generate();
      const props = (contactId as any).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const contactId = ContactId.generate();

      expect(() => {
        (contactId as any).props.value = '550e8400-e29b-41d4-a716-446655440000';
      }).toThrow();
    });
  });
});
