import { describe, it, expect } from 'vitest';
import { ConfidenceScore, InvalidConfidenceScoreError } from '../ConfidenceScore';
import { DEFAULT_CONFIDENCE_THRESHOLD, CHAIN_CONFIDENCE_THRESHOLDS } from '../../AIConstants';

describe('ConfidenceScore', () => {
  describe('create', () => {
    it('should create a valid confidence score at lower boundary (0.0)', () => {
      const score = ConfidenceScore.create(0.0);
      expect(score.toValue()).toBe(0.0);
    });

    it('should create a valid confidence score at upper boundary (1.0)', () => {
      const score = ConfidenceScore.create(1.0);
      expect(score.toValue()).toBe(1.0);
    });

    it('should create a valid confidence score at default threshold (0.85)', () => {
      const score = ConfidenceScore.create(DEFAULT_CONFIDENCE_THRESHOLD);
      expect(score.toValue()).toBe(0.85);
    });

    it('should create a valid confidence score for mid-range value', () => {
      const score = ConfidenceScore.create(0.5);
      expect(score.toValue()).toBe(0.5);
    });
  });

  describe('validation', () => {
    it('should throw InvalidConfidenceScoreError for score below 0', () => {
      expect(() => ConfidenceScore.create(-0.1)).toThrow(InvalidConfidenceScoreError);
    });

    it('should throw InvalidConfidenceScoreError for score above 1', () => {
      expect(() => ConfidenceScore.create(1.1)).toThrow(InvalidConfidenceScoreError);
    });

    it('should throw InvalidConfidenceScoreError for NaN', () => {
      expect(() => ConfidenceScore.create(NaN)).toThrow(InvalidConfidenceScoreError);
    });
  });

  describe('isAboveThreshold', () => {
    it('should return true when score equals threshold', () => {
      const score = ConfidenceScore.create(0.85);
      expect(score.isAboveThreshold(0.85)).toBe(true);
    });

    it('should return true when score is above threshold', () => {
      const score = ConfidenceScore.create(0.9);
      expect(score.isAboveThreshold(0.85)).toBe(true);
    });

    it('should return false when score is below threshold', () => {
      const score = ConfidenceScore.create(0.84);
      expect(score.isAboveThreshold(0.85)).toBe(false);
    });

    it('should work with chain-specific thresholds', () => {
      const score = ConfidenceScore.create(0.82);
      // SENTIMENT_ANALYSIS has 0.80 threshold
      expect(score.isAboveThreshold(CHAIN_CONFIDENCE_THRESHOLDS.SENTIMENT_ANALYSIS)).toBe(true);
      // AUTO_RESPONSE has 0.90 threshold
      expect(score.isAboveThreshold(CHAIN_CONFIDENCE_THRESHOLDS.AUTO_RESPONSE)).toBe(false);
    });
  });

  describe('requiresReview', () => {
    it('should require review when below threshold', () => {
      const score = ConfidenceScore.create(0.84);
      expect(score.requiresReview(0.85)).toBe(true);
    });

    it('should not require review when at or above threshold', () => {
      const score = ConfidenceScore.create(0.85);
      expect(score.requiresReview(0.85)).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal scores', () => {
      const score1 = ConfidenceScore.create(0.85);
      const score2 = ConfidenceScore.create(0.85);
      expect(score1.equals(score2)).toBe(true);
    });

    it('should return false for different scores', () => {
      const score1 = ConfidenceScore.create(0.85);
      const score2 = ConfidenceScore.create(0.86);
      expect(score1.equals(score2)).toBe(false);
    });
  });
});
