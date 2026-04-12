/**
 * CaseId Value Object Tests
 *
 * Tests for the CaseId value object ensuring proper validation
 * and generation of case identifiers.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { CaseId, InvalidCaseIdError } from '../CaseId';

describe('CaseId Value Object', () => {
  describe('create()', () => {
    it('should create a valid CaseId from a UUID string', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = CaseId.create(uuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(uuid);
    });

    it('should fail with an invalid UUID', () => {
      const invalidUuid = 'not-a-valid-uuid';
      const result = CaseId.create(invalidUuid);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidCaseIdError);
      expect(result.error.code).toBe('INVALID_CASE_ID');
    });

    it('should fail with an empty string', () => {
      const result = CaseId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidCaseIdError);
    });

    it('should fail with a partial UUID', () => {
      const partialUuid = '123e4567-e89b';
      const result = CaseId.create(partialUuid);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidCaseIdError);
    });
  });

  describe('generate()', () => {
    it('should generate a valid CaseId', () => {
      const caseId = CaseId.generate();

      expect(caseId).toBeInstanceOf(CaseId);
      expect(caseId.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = CaseId.generate();
      const id2 = CaseId.generate();

      expect(id1.value).not.toBe(id2.value);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = CaseId.create(uuid);

      expect(result.value.toValue()).toBe(uuid);
    });
  });

  describe('toString()', () => {
    it('should return the string representation', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = CaseId.create(uuid);

      expect(result.value.toString()).toBe(uuid);
    });
  });

  describe('equals()', () => {
    it('should return true for equal CaseIds', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const id1 = CaseId.create(uuid).value;
      const id2 = CaseId.create(uuid).value;

      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different CaseIds', () => {
      const id1 = CaseId.generate();
      const id2 = CaseId.generate();

      expect(id1.equals(id2)).toBe(false);
    });
  });
});
