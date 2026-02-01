import { describe, it, expect } from 'vitest';
import { AutoResponseDraftId } from '../AutoResponseDraftId';

describe('AutoResponseDraftId', () => {
  describe('create', () => {
    it('should create a new ID when no value provided', () => {
      const id = AutoResponseDraftId.create();
      expect(id.toString()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should create from valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const id = AutoResponseDraftId.create(uuid);
      expect(id.toString()).toBe(uuid);
    });

    it('should throw for invalid UUID', () => {
      expect(() => AutoResponseDraftId.create('invalid-uuid')).toThrow(
        'Invalid AutoResponseDraftId'
      );
    });
  });

  describe('fromString', () => {
    it('should create from valid UUID string', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const id = AutoResponseDraftId.fromString(uuid);
      expect(id.toString()).toBe(uuid);
    });
  });

  describe('equals', () => {
    it('should return true for same UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const id1 = AutoResponseDraftId.create(uuid);
      const id2 = AutoResponseDraftId.create(uuid);
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different UUIDs', () => {
      const id1 = AutoResponseDraftId.create();
      const id2 = AutoResponseDraftId.create();
      expect(id1.equals(id2)).toBe(false);
    });

    it('should return false for null', () => {
      const id = AutoResponseDraftId.create();
      expect(id.equals(null as any)).toBe(false);
    });
  });

  describe('toValue', () => {
    it('should return the UUID string', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const id = AutoResponseDraftId.create(uuid);
      expect(id.toValue()).toBe(uuid);
    });
  });
});
