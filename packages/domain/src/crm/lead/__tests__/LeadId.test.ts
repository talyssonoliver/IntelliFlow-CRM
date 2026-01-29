/**
 * LeadId Value Object Tests
 *
 * Tests UUID validation for lead identifiers
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { LeadId, InvalidLeadIdError } from '../LeadId';
import { validate as uuidValidate } from 'uuid';

describe('LeadId', () => {
  describe('create()', () => {
    it('should create with valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = LeadId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(LeadId);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with valid UUIDv4', () => {
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const result = LeadId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with uppercase UUID', () => {
      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = LeadId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with mixed case UUID', () => {
      const validUuid = '550e8400-E29B-41d4-A716-446655440000';
      const result = LeadId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should reject empty string', () => {
      const result = LeadId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
      expect(result.error.code).toBe('INVALID_LEAD_ID');
      expect(result.error.message).toContain('Invalid lead ID:');
    });

    it('should reject null', () => {
      const result = LeadId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject undefined', () => {
      const result = LeadId.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject invalid UUID format', () => {
      const result = LeadId.create('not-a-uuid');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
      expect(result.error.code).toBe('INVALID_LEAD_ID');
    });

    it('should reject UUID with missing hyphens', () => {
      const result = LeadId.create('550e8400e29b41d4a716446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject UUID with incorrect hyphen positions', () => {
      const result = LeadId.create('550e8400-e29b41d4-a716-446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject UUID with non-hex characters', () => {
      const result = LeadId.create('550e8400-e29b-41d4-a716-44665544000g');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject UUID that is too short', () => {
      const result = LeadId.create('550e8400-e29b-41d4-a716-44665544000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject UUID that is too long', () => {
      const result = LeadId.create('550e8400-e29b-41d4-a716-4466554400000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject random string', () => {
      const result = LeadId.create('abc123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject numeric string', () => {
      const result = LeadId.create('123456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject UUID with spaces', () => {
      const result = LeadId.create('550e8400 e29b 41d4 a716 446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });

    it('should reject UUID with extra characters', () => {
      const result = LeadId.create('550e8400-e29b-41d4-a716-446655440000-extra');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidLeadIdError);
    });
  });

  describe('generate()', () => {
    it('should generate valid UUID', () => {
      const leadId = LeadId.generate();

      expect(leadId).toBeInstanceOf(LeadId);
      expect(uuidValidate(leadId.value)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const leadId1 = LeadId.generate();
      const leadId2 = LeadId.generate();

      expect(leadId1.value).not.toBe(leadId2.value);
    });

    it('should generate multiple unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(LeadId.generate().value);
      }

      expect(ids.size).toBe(100);
    });

    it('should generate UUIDs in valid format', () => {
      const leadId = LeadId.generate();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuidPattern.test(leadId.value)).toBe(true);
    });
  });

  describe('value', () => {
    it('should return the UUID value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const leadId = LeadId.create(uuid).value;

      expect(leadId.value).toBe(uuid);
    });

    it('should return generated UUID value', () => {
      const leadId = LeadId.generate();

      expect(typeof leadId.value).toBe('string');
      expect(uuidValidate(leadId.value)).toBe(true);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const leadId1 = LeadId.create(uuid).value;
      const leadId2 = LeadId.create(uuid).value;

      expect(leadId1.equals(leadId2)).toBe(true);
    });

    it('should return false for different case UUIDs (case-sensitive comparison)', () => {
      const leadId1 = LeadId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const leadId2 = LeadId.create('550E8400-E29B-41D4-A716-446655440000').value;

      // UUIDs are stored as-is and compared via JSON.stringify (case-sensitive)
      expect(leadId1.equals(leadId2)).toBe(false);
    });

    it('should return false for different IDs', () => {
      const leadId1 = LeadId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const leadId2 = LeadId.create('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d').value;

      expect(leadId1.equals(leadId2)).toBe(false);
    });

    it('should return false for different generated IDs', () => {
      const leadId1 = LeadId.generate();
      const leadId2 = LeadId.generate();

      expect(leadId1.equals(leadId2)).toBe(false);
    });

    it('should return false for null', () => {
      const leadId = LeadId.generate();

      expect(leadId.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const leadId = LeadId.generate();

      expect(leadId.equals(undefined as any)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const leadId = LeadId.create(uuid).value;

      expect(leadId.toValue()).toBe(uuid);
    });

    it('should return generated UUID string', () => {
      const leadId = LeadId.generate();
      const value = leadId.toValue();

      expect(typeof value).toBe('string');
      expect(uuidValidate(value)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID as string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const leadId = LeadId.create(uuid).value;

      expect(leadId.toString()).toBe(uuid);
    });

    it('should return generated UUID as string', () => {
      const leadId = LeadId.generate();
      const str = leadId.toString();

      expect(typeof str).toBe('string');
      expect(uuidValidate(str)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const leadId = LeadId.generate();
      const props = (leadId as any).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const leadId = LeadId.generate();

      expect(() => {
        (leadId as any).props.value = '550e8400-e29b-41d4-a716-446655440000';
      }).toThrow();
    });
  });
});
