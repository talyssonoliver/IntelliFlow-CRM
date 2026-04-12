import { describe, it, expect } from 'vitest';
import { ReviewId, InvalidReviewIdError } from '../ReviewId';

describe('ReviewId', () => {
  describe('create', () => {
    it('should create a ReviewId with provided valid UUID', () => {
      const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const reviewId = ReviewId.create(uuid);
      expect(reviewId.toValue()).toBe(uuid);
    });

    it('should create a ReviewId with auto-generated UUID when not provided', () => {
      const reviewId = ReviewId.create();
      expect(reviewId.toValue()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('validation', () => {
    it('should throw InvalidReviewIdError for invalid UUID format', () => {
      expect(() => ReviewId.create('invalid-uuid')).toThrow(InvalidReviewIdError);
    });

    it('should throw InvalidReviewIdError for empty string', () => {
      expect(() => ReviewId.create('')).toThrow(InvalidReviewIdError);
    });
  });

  describe('equals', () => {
    it('should return true for equal ReviewIds', () => {
      const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const id1 = ReviewId.create(uuid);
      const id2 = ReviewId.create(uuid);
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different ReviewIds', () => {
      const id1 = ReviewId.create();
      const id2 = ReviewId.create();
      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the UUID string', () => {
      const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const reviewId = ReviewId.create(uuid);
      expect(reviewId.toString()).toBe(uuid);
    });
  });
});
