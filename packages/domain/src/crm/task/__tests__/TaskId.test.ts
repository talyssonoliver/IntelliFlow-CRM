/**
 * TaskId Value Object Tests
 *
 * Tests UUID validation for task identifiers
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { TaskId, InvalidTaskIdError } from '../TaskId';
import { validate as uuidValidate } from 'uuid';

describe('TaskId', () => {
  describe('create()', () => {
    it('should create with valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = TaskId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(TaskId);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with valid UUIDv4', () => {
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const result = TaskId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should create with uppercase UUID', () => {
      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = TaskId.create(validUuid);

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(validUuid);
    });

    it('should reject empty string', () => {
      const result = TaskId.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
      expect(result.error.code).toBe('INVALID_TASK_ID');
      expect(result.error.message).toContain('Invalid task ID:');
    });

    it('should reject null', () => {
      const result = TaskId.create(null as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
    });

    it('should reject undefined', () => {
      const result = TaskId.create(undefined as unknown as string);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
    });

    it('should reject invalid UUID format', () => {
      const result = TaskId.create('not-a-uuid');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
      expect(result.error.code).toBe('INVALID_TASK_ID');
    });

    it('should reject UUID with missing hyphens', () => {
      const result = TaskId.create('550e8400e29b41d4a716446655440000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
    });

    it('should reject UUID that is too short', () => {
      const result = TaskId.create('550e8400-e29b-41d4-a716-44665544000');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
    });

    it('should reject random string', () => {
      const result = TaskId.create('abc123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidTaskIdError);
    });
  });

  describe('generate()', () => {
    it('should generate valid UUID', () => {
      const taskId = TaskId.generate();

      expect(taskId).toBeInstanceOf(TaskId);
      expect(uuidValidate(taskId.value)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();

      expect(taskId1.value).not.toBe(taskId2.value);
    });

    it('should generate multiple unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(TaskId.generate().value);
      }

      expect(ids.size).toBe(50);
    });

    it('should generate UUIDs in valid format', () => {
      const taskId = TaskId.generate();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuidPattern.test(taskId.value)).toBe(true);
    });
  });

  describe('value', () => {
    it('should return the UUID value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const taskId = TaskId.create(uuid).value;

      expect(taskId.value).toBe(uuid);
    });

    it('should return generated UUID value', () => {
      const taskId = TaskId.generate();

      expect(typeof taskId.value).toBe('string');
      expect(uuidValidate(taskId.value)).toBe(true);
    });
  });

  describe('equals()', () => {
    it('should return true for equal IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const taskId1 = TaskId.create(uuid).value;
      const taskId2 = TaskId.create(uuid).value;

      expect(taskId1.equals(taskId2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const taskId1 = TaskId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const taskId2 = TaskId.create('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d').value;

      expect(taskId1.equals(taskId2)).toBe(false);
    });

    it('should return false for null', () => {
      const taskId = TaskId.generate();

      expect(taskId.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const taskId = TaskId.generate();

      expect(taskId.equals(undefined as any)).toBe(false);
    });
  });

  describe('toValue()', () => {
    it('should return the raw UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const taskId = TaskId.create(uuid).value;

      expect(taskId.toValue()).toBe(uuid);
    });

    it('should return generated UUID string', () => {
      const taskId = TaskId.generate();
      const value = taskId.toValue();

      expect(typeof value).toBe('string');
      expect(uuidValidate(value)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('should return the UUID as string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const taskId = TaskId.create(uuid).value;

      expect(taskId.toString()).toBe(uuid);
    });
  });

  describe('immutability', () => {
    it('should have frozen props', () => {
      const taskId = TaskId.generate();
      const props = (taskId as any).props;

      expect(Object.isFrozen(props)).toBe(true);
    });

    it('should not allow modification of value through props', () => {
      const taskId = TaskId.generate();

      expect(() => {
        (taskId as any).props.value = '550e8400-e29b-41d4-a716-446655440000';
      }).toThrow();
    });
  });
});
