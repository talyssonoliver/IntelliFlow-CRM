/**
 * TicketId Value Object Tests
 *
 * Tests UUID validation for ticket identifiers
 * Coverage target: >95% for domain layer
 *
 * Follows the same pattern as other domain entities (LeadId, TaskId, etc.)
 */

import { describe, it, expect } from 'vitest';
import { TicketId, InvalidTicketIdError } from '../TicketId';
import { validate as uuidValidate } from 'uuid';

describe('TicketId', () => {
  describe('create()', () => {
    it('should create with valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = TicketId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(TicketId);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with generated UUID', () => {
      const generated = TicketId.generate();
      const result = TicketId.create(generated.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(generated.value);
    });

    it('should reject empty string', () => {
      const result = TicketId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
      expect(result.error.code).toBe('INVALID_TICKET_ID');
      expect(result.error.message).toContain('Invalid ticket ID:');
    });

    it('should reject null', () => {
      const result = TicketId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });

    it('should reject undefined', () => {
      const result = TicketId.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });

    it('should reject random string', () => {
      const result = TicketId.create('not-a-uuid');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });

    it('should reject too short string', () => {
      const result = TicketId.create('abc123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });

    it('should reject too long string', () => {
      const result = TicketId.create('a'.repeat(100));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });

    it('should reject numeric-only string', () => {
      const result = TicketId.create('12345678901234567890123456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });

    it('should reject malformed UUID', () => {
      const result = TicketId.create('550e8400-e29b-41d4-a716');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTicketIdError);
    });
  });

  describe('generate()', () => {
    it('should generate valid UUID', () => {
      const ticketId = TicketId.generate();

      expect(ticketId).toBeInstanceOf(TicketId);
      expect(uuidValidate(ticketId.value)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const ticketId1 = TicketId.generate();
      const ticketId2 = TicketId.generate();

      expect(ticketId1.value).not.toBe(ticketId2.value);
    });

    it('should generate multiple unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(TicketId.generate().value);
      }

      expect(ids.size).toBe(50);
    });

    it('should generate UUIDs that pass uuidValidate validation', () => {
      const ticketId = TicketId.generate();

      expect(uuidValidate(ticketId.value)).toBe(true);
    });
  });

  describe('value getter', () => {
    it('should return the UUID value', () => {
      const uuid = TicketId.generate().value;
      const ticketId = TicketId.create(uuid).value;

      expect(ticketId.value).toBe(uuid);
    });

    it('should return generated UUID value', () => {
      const ticketId = TicketId.generate();

      expect(typeof ticketId.value).toBe('string');
      expect(uuidValidate(ticketId.value)).toBe(true);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = TicketId.generate().value;
      const ticketId1 = TicketId.create(uuid).value;
      const ticketId2 = TicketId.create(uuid).value;

      expect(ticketId1.equals(ticketId2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const ticketId1 = TicketId.generate();
      const ticketId2 = TicketId.generate();

      expect(ticketId1.equals(ticketId2)).toBe(false);
    });

    it('should return false for null', () => {
      const ticketId = TicketId.generate();

      expect(ticketId.equals(null as unknown as TicketId)).toBe(false);
    });

    it('should return false for undefined', () => {
      const ticketId = TicketId.generate();

      expect(ticketId.equals(undefined as unknown as TicketId)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = TicketId.generate().value;
      const ticketId = TicketId.create(uuid).value;

      expect(ticketId.toValue()).toBe(uuid);
    });

    it('should return generated UUID string', () => {
      const ticketId = TicketId.generate();
      const value = ticketId.toValue();

      expect(typeof value).toBe('string');
      expect(uuidValidate(value)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID as string', () => {
      const uuid = TicketId.generate().value;
      const ticketId = TicketId.create(uuid).value;

      expect(ticketId.toString()).toBe(uuid);
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const ticketId = TicketId.generate();
      const props = (ticketId as unknown as { props: Record<string, unknown> }).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const ticketId = TicketId.generate();

      expect(() => {
        (ticketId as unknown as { props: { value: string } }).props.value = 'changed';
      }).toThrow();
    });
  });
});
