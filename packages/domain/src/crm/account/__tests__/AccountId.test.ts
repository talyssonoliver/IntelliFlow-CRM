/**
 * AccountId Value Object Tests
 *
 * Tests UUID validation for account identifiers
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { AccountId, InvalidAccountIdError } from '../AccountId';
import { validate as uuidValidate } from 'uuid';

describe('AccountId', () => {
  describe('create()', () => {
    it('should create with valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = AccountId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(AccountId);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with valid UUIDv4', () => {
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const result = AccountId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with uppercase UUID', () => {
      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = AccountId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should reject empty string', () => {
      const result = AccountId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
      expect(result.error.code).toBe('INVALID_ACCOUNT_ID');
      expect(result.error.message).toContain('Invalid account ID:');
    });

    it('should reject null', () => {
      const result = AccountId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
    });

    it('should reject undefined', () => {
      const result = AccountId.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
    });

    it('should reject invalid UUID format', () => {
      const result = AccountId.create('not-a-uuid');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
      expect(result.error.code).toBe('INVALID_ACCOUNT_ID');
    });

    it('should reject UUID with missing hyphens', () => {
      const result = AccountId.create('550e8400e29b41d4a716446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
    });

    it('should reject UUID that is too short', () => {
      const result = AccountId.create('550e8400-e29b-41d4-a716-44665544000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
    });

    it('should reject random string', () => {
      const result = AccountId.create('abc123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAccountIdError);
    });
  });

  describe('generate()', () => {
    it('should generate valid UUID', () => {
      const accountId = AccountId.generate();

      expect(accountId).toBeInstanceOf(AccountId);
      expect(uuidValidate(accountId.value)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const accountId1 = AccountId.generate();
      const accountId2 = AccountId.generate();

      expect(accountId1.value).not.toBe(accountId2.value);
    });

    it('should generate multiple unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(AccountId.generate().value);
      }

      expect(ids.size).toBe(50);
    });

    it('should generate UUIDs in valid format', () => {
      const accountId = AccountId.generate();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuidPattern.test(accountId.value)).toBe(true);
    });
  });

  describe('value', () => {
    it('should return the UUID value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const accountId = AccountId.create(uuid).value;

      expect(accountId.value).toBe(uuid);
    });

    it('should return generated UUID value', () => {
      const accountId = AccountId.generate();

      expect(typeof accountId.value).toBe('string');
      expect(uuidValidate(accountId.value)).toBe(true);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const accountId1 = AccountId.create(uuid).value;
      const accountId2 = AccountId.create(uuid).value;

      expect(accountId1.equals(accountId2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const accountId1 = AccountId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const accountId2 = AccountId.create('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d').value;

      expect(accountId1.equals(accountId2)).toBe(false);
    });

    it('should return false for null', () => {
      const accountId = AccountId.generate();

      expect(accountId.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const accountId = AccountId.generate();

      expect(accountId.equals(undefined as any)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const accountId = AccountId.create(uuid).value;

      expect(accountId.toValue()).toBe(uuid);
    });

    it('should return generated UUID string', () => {
      const accountId = AccountId.generate();
      const value = accountId.toValue();

      expect(typeof value).toBe('string');
      expect(uuidValidate(value)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID as string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const accountId = AccountId.create(uuid).value;

      expect(accountId.toString()).toBe(uuid);
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const accountId = AccountId.generate();
      const props = (accountId as any).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const accountId = AccountId.generate();

      expect(() => {
        (accountId as any).props.value = '550e8400-e29b-41d4-a716-446655440000';
      }).toThrow();
    });
  });
});
