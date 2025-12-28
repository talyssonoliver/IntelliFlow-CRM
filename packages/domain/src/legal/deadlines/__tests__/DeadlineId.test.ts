import { describe, it, expect } from 'vitest';
import { DeadlineId } from '../DeadlineId';

describe('DeadlineId', () => {
  describe('generate', () => {
    it('should generate a unique DeadlineId', () => {
      const id1 = DeadlineId.generate();
      const id2 = DeadlineId.generate();

      expect(id1.value).toBeDefined();
      expect(id2.value).toBeDefined();
      expect(id1.value).not.toBe(id2.value);
    });

    it('should generate a valid UUID format', () => {
      const id = DeadlineId.generate();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(id.value).toMatch(uuidRegex);
    });
  });

  describe('fromString', () => {
    it('should create DeadlineId from valid string', () => {
      const idValue = 'test-deadline-id-123';
      const id = DeadlineId.fromString(idValue);

      expect(id.value).toBe(idValue);
    });

    it('should trim whitespace from input', () => {
      const id = DeadlineId.fromString('  test-id  ');

      expect(id.value).toBe('test-id');
    });

    it('should throw error for empty string', () => {
      expect(() => DeadlineId.fromString('')).toThrow('DeadlineId cannot be empty');
    });

    it('should throw error for whitespace-only string', () => {
      expect(() => DeadlineId.fromString('   ')).toThrow('DeadlineId cannot be empty');
    });

    it('should throw error for null-like values', () => {
      expect(() => DeadlineId.fromString(null as unknown as string)).toThrow(
        'DeadlineId cannot be empty'
      );
    });
  });

  describe('equals', () => {
    it('should return true for equal DeadlineIds', () => {
      const id1 = DeadlineId.fromString('same-id');
      const id2 = DeadlineId.fromString('same-id');

      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different DeadlineIds', () => {
      const id1 = DeadlineId.fromString('id-1');
      const id2 = DeadlineId.fromString('id-2');

      expect(id1.equals(id2)).toBe(false);
    });

    it('should return true when comparing same instance', () => {
      const id = DeadlineId.generate();

      expect(id.equals(id)).toBe(true);
    });
  });

  describe('toString', () => {
    it('should return the string value', () => {
      const idValue = 'my-deadline-id';
      const id = DeadlineId.fromString(idValue);

      expect(id.toString()).toBe(idValue);
    });

    it('should return same value as value getter', () => {
      const id = DeadlineId.generate();

      expect(id.toString()).toBe(id.value);
    });
  });

  describe('value getter', () => {
    it('should return the internal value', () => {
      const id = DeadlineId.generate();

      expect(typeof id.value).toBe('string');
      expect(id.value.length).toBeGreaterThan(0);
    });
  });
});
