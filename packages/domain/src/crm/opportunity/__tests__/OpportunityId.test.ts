/**
 * OpportunityId Value Object Tests
 *
 * Tests UUID validation for opportunity identifiers
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { OpportunityId, InvalidOpportunityIdError } from '../OpportunityId';
import { validate as uuidValidate } from 'uuid';

describe('OpportunityId', () => {
  describe('create()', () => {
    it('should create with valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = OpportunityId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(OpportunityId);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with valid UUIDv4', () => {
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const result = OpportunityId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with uppercase UUID', () => {
      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = OpportunityId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should reject empty string', () => {
      const result = OpportunityId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
      expect(result.error.code).toBe('INVALID_OPPORTUNITY_ID');
      expect(result.error.message).toContain('Invalid opportunity ID:');
    });

    it('should reject null', () => {
      const result = OpportunityId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
    });

    it('should reject undefined', () => {
      const result = OpportunityId.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
    });

    it('should reject invalid UUID format', () => {
      const result = OpportunityId.create('not-a-uuid');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
      expect(result.error.code).toBe('INVALID_OPPORTUNITY_ID');
    });

    it('should reject UUID with missing hyphens', () => {
      const result = OpportunityId.create('550e8400e29b41d4a716446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
    });

    it('should reject UUID that is too short', () => {
      const result = OpportunityId.create('550e8400-e29b-41d4-a716-44665544000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
    });

    it('should reject random string', () => {
      const result = OpportunityId.create('abc123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityIdError);
    });
  });

  describe('generate()', () => {
    it('should generate valid UUID', () => {
      const opportunityId = OpportunityId.generate();

      expect(opportunityId).toBeInstanceOf(OpportunityId);
      expect(uuidValidate(opportunityId.value)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const opportunityId1 = OpportunityId.generate();
      const opportunityId2 = OpportunityId.generate();

      expect(opportunityId1.value).not.toBe(opportunityId2.value);
    });

    it('should generate multiple unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(OpportunityId.generate().value);
      }

      expect(ids.size).toBe(50);
    });

    it('should generate UUIDs in valid format', () => {
      const opportunityId = OpportunityId.generate();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuidPattern.test(opportunityId.value)).toBe(true);
    });
  });

  describe('value', () => {
    it('should return the UUID value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const opportunityId = OpportunityId.create(uuid).value;

      expect(opportunityId.value).toBe(uuid);
    });

    it('should return generated UUID value', () => {
      const opportunityId = OpportunityId.generate();

      expect(typeof opportunityId.value).toBe('string');
      expect(uuidValidate(opportunityId.value)).toBe(true);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const opportunityId1 = OpportunityId.create(uuid).value;
      const opportunityId2 = OpportunityId.create(uuid).value;

      expect(opportunityId1.equals(opportunityId2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const opportunityId1 = OpportunityId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const opportunityId2 = OpportunityId.create('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d').value;

      expect(opportunityId1.equals(opportunityId2)).toBe(false);
    });

    it('should return false for null', () => {
      const opportunityId = OpportunityId.generate();

      expect(opportunityId.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const opportunityId = OpportunityId.generate();

      expect(opportunityId.equals(undefined as any)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const opportunityId = OpportunityId.create(uuid).value;

      expect(opportunityId.toValue()).toBe(uuid);
    });

    it('should return generated UUID string', () => {
      const opportunityId = OpportunityId.generate();
      const value = opportunityId.toValue();

      expect(typeof value).toBe('string');
      expect(uuidValidate(value)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID as string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const opportunityId = OpportunityId.create(uuid).value;

      expect(opportunityId.toString()).toBe(uuid);
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const opportunityId = OpportunityId.generate();
      const props = (opportunityId as any).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const opportunityId = OpportunityId.generate();

      expect(() => {
        (opportunityId as any).props.value = '550e8400-e29b-41d4-a716-446655440000';
      }).toThrow();
    });
  });
});
