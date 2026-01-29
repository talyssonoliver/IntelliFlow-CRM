/**
 * CaseTaskId Value Object Tests
 *
 * Tests for the CaseTaskId value object ensuring proper validation
 * and generation of case task identifiers.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { CaseTaskId, InvalidCaseTaskIdError } from '../CaseTaskId';

describe('CaseTaskId Value Object', () => {
  describe('create()', () => {
    it('should create a valid CaseTaskId from a UUID string', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = CaseTaskId.create(uuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(uuid);
    });

    it('should fail with an invalid UUID', () => {
      const invalidUuid = 'not-a-valid-uuid';
      const result = CaseTaskId.create(invalidUuid);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidCaseTaskIdError);
      expect(result.error.code).toBe('INVALID_CASE_TASK_ID');
    });

    it('should fail with an empty string', () => {
      const result = CaseTaskId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidCaseTaskIdError);
    });

    it('should fail with null-like values', () => {
      const result = CaseTaskId.create('null');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('generate()', () => {
    it('should generate a valid CaseTaskId', () => {
      const taskId = CaseTaskId.generate();

      expect(taskId).toBeInstanceOf(CaseTaskId);
      expect(taskId.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = CaseTaskId.generate();
      const id2 = CaseTaskId.generate();

      expect(id1.value).not.toBe(id2.value);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = CaseTaskId.create(uuid);

      expect(result.value.toValue()).toBe(uuid);
    });
  });

  describe('toString()', () => {
    it('should return the string representation', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = CaseTaskId.create(uuid);

      expect(result.value.toString()).toBe(uuid);
    });
  });

  describe('equals()', () => {
    it('should return true for equal CaseTaskIds', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const id1 = CaseTaskId.create(uuid).value;
      const id2 = CaseTaskId.create(uuid).value;

      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different CaseTaskIds', () => {
      const id1 = CaseTaskId.generate();
      const id2 = CaseTaskId.generate();

      expect(id1.equals(id2)).toBe(false);
    });
  });
});
