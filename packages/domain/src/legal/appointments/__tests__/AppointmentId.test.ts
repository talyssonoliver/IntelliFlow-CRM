/**
 * AppointmentId Value Object Tests
 *
 * Tests the AppointmentId value object which encapsulates
 * appointment identifier validation using UUID format.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { AppointmentId, InvalidAppointmentIdError } from '../AppointmentId';

describe('AppointmentId Value Object', () => {
  describe('create()', () => {
    it('should create an AppointmentId with a valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = AppointmentId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should fail with an invalid UUID', () => {
      const invalidUuid = 'not-a-uuid';
      const result = AppointmentId.create(invalidUuid);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAppointmentIdError);
      expect(result.error.code).toBe('INVALID_APPOINTMENT_ID');
    });

    it('should fail with an empty string', () => {
      const result = AppointmentId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAppointmentIdError);
    });

    it('should fail with a partial UUID', () => {
      const partialUuid = '550e8400-e29b-41d4';
      const result = AppointmentId.create(partialUuid);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAppointmentIdError);
    });

    it('should fail with null-like input', () => {
      const result = AppointmentId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
    });

    it('should accept lowercase UUID', () => {
      const lowercaseUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = AppointmentId.create(lowercaseUuid);

      expect(result.isSuccess).toBe(true);
    });

    it('should accept uppercase UUID', () => {
      const uppercaseUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = AppointmentId.create(uppercaseUuid);

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('generate()', () => {
    it('should generate a valid AppointmentId', () => {
      const id = AppointmentId.generate();

      expect(id).toBeInstanceOf(AppointmentId);
      expect(id.value).toBeDefined();
      expect(id.value.length).toBe(36); // UUID format length
    });

    it('should generate unique IDs', () => {
      const id1 = AppointmentId.generate();
      const id2 = AppointmentId.generate();
      const id3 = AppointmentId.generate();

      expect(id1.value).not.toBe(id2.value);
      expect(id2.value).not.toBe(id3.value);
      expect(id1.value).not.toBe(id3.value);
    });

    it('should generate IDs that pass validation', () => {
      const generated = AppointmentId.generate();
      const validated = AppointmentId.create(generated.value);

      expect(validated.isSuccess).toBe(true);
      expect(validated.value.value).toBe(generated.value);
    });
  });

  describe('toValue()', () => {
    it('should return the string value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = AppointmentId.create(uuid).value;

      expect(id.toValue()).toBe(uuid);
    });
  });

  describe('toString()', () => {
    it('should return the string representation', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = AppointmentId.create(uuid).value;

      expect(id.toString()).toBe(uuid);
    });

    it('should be usable in string concatenation', () => {
      const id = AppointmentId.generate();
      const message = `Appointment ID: ${id}`;

      expect(message).toContain(id.value);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id1 = AppointmentId.create(uuid).value;
      const id2 = AppointmentId.create(uuid).value;

      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const id1 = AppointmentId.generate();
      const id2 = AppointmentId.generate();

      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('InvalidAppointmentIdError', () => {
    it('should have correct error code', () => {
      const error = new InvalidAppointmentIdError('invalid');

      expect(error.code).toBe('INVALID_APPOINTMENT_ID');
      expect(error.message).toContain('invalid');
    });
  });
});
