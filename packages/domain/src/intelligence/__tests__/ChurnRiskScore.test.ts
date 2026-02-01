/**
 * ChurnRiskScore Value Object Tests (IFC-095)
 */

import { describe, it, expect } from 'vitest';
import { ChurnRiskScore, InvalidChurnRiskScoreError, InvalidConfidenceError } from '../ChurnRiskScore';
import { CHURN_RISK_LEVELS } from '../../ai/AIConstants';

describe('ChurnRiskScore', () => {
  describe('create', () => {
    it('should create with valid score and confidence', () => {
      const score = ChurnRiskScore.create(75, 0.85);
      expect(score.getValue()).toBe(75);
      expect(score.getConfidence()).toBe(0.85);
    });

    it('should accept boundary value 0', () => {
      const score = ChurnRiskScore.create(0, 0.5);
      expect(score.getValue()).toBe(0);
    });

    it('should accept boundary value 100', () => {
      const score = ChurnRiskScore.create(100, 0.5);
      expect(score.getValue()).toBe(100);
    });

    it('should accept confidence boundary 0', () => {
      const score = ChurnRiskScore.create(50, 0);
      expect(score.getConfidence()).toBe(0);
    });

    it('should accept confidence boundary 1', () => {
      const score = ChurnRiskScore.create(50, 1);
      expect(score.getConfidence()).toBe(1);
    });

    it('should throw InvalidChurnRiskScoreError for score < 0', () => {
      expect(() => ChurnRiskScore.create(-1, 0.5)).toThrow(InvalidChurnRiskScoreError);
    });

    it('should throw InvalidChurnRiskScoreError for score > 100', () => {
      expect(() => ChurnRiskScore.create(101, 0.5)).toThrow(InvalidChurnRiskScoreError);
    });

    it('should throw InvalidConfidenceError for confidence < 0', () => {
      expect(() => ChurnRiskScore.create(50, -0.1)).toThrow(InvalidConfidenceError);
    });

    it('should throw InvalidConfidenceError for confidence > 1', () => {
      expect(() => ChurnRiskScore.create(50, 1.1)).toThrow(InvalidConfidenceError);
    });
  });

  describe('level', () => {
    it.each([
      [80, 'CRITICAL'],
      [95, 'CRITICAL'],
      [100, 'CRITICAL'],
      [60, 'HIGH'],
      [79, 'HIGH'],
      [40, 'MEDIUM'],
      [59, 'MEDIUM'],
      [20, 'LOW'],
      [39, 'LOW'],
      [0, 'MINIMAL'],
      [19, 'MINIMAL'],
    ])('should return %s for score %d', (score, expectedLevel) => {
      expect(ChurnRiskScore.create(score, 0.8).level).toBe(expectedLevel);
    });

    it('should return valid CHURN_RISK_LEVELS values', () => {
      const score = ChurnRiskScore.create(50, 0.8);
      expect(CHURN_RISK_LEVELS).toContain(score.level);
    });
  });

  describe('slaHours', () => {
    it.each([
      [85, 24],   // CRITICAL
      [80, 24],   // CRITICAL boundary
      [65, 48],   // HIGH
      [60, 48],   // HIGH boundary
      [45, 168],  // MEDIUM
      [40, 168],  // MEDIUM boundary
      [25, 336],  // LOW
      [20, 336],  // LOW boundary
      [10, 720],  // MINIMAL
      [0, 720],   // MINIMAL boundary
    ])('should return %d hours for score %d', (score, expectedHours) => {
      expect(ChurnRiskScore.create(score, 0.8).slaHours).toBe(expectedHours);
    });
  });

  describe('isHighConfidence', () => {
    it('should return true for confidence >= 0.7', () => {
      expect(ChurnRiskScore.create(50, 0.7).isHighConfidence()).toBe(true);
      expect(ChurnRiskScore.create(50, 0.9).isHighConfidence()).toBe(true);
      expect(ChurnRiskScore.create(50, 1).isHighConfidence()).toBe(true);
    });

    it('should return false for confidence < 0.7', () => {
      expect(ChurnRiskScore.create(50, 0.69).isHighConfidence()).toBe(false);
      expect(ChurnRiskScore.create(50, 0.5).isHighConfidence()).toBe(false);
      expect(ChurnRiskScore.create(50, 0).isHighConfidence()).toBe(false);
    });
  });

  describe('isHighRisk', () => {
    it('should return true for score >= 60', () => {
      expect(ChurnRiskScore.create(60, 0.8).isHighRisk()).toBe(true);
      expect(ChurnRiskScore.create(80, 0.8).isHighRisk()).toBe(true);
    });

    it('should return false for score < 60', () => {
      expect(ChurnRiskScore.create(59, 0.8).isHighRisk()).toBe(false);
      expect(ChurnRiskScore.create(30, 0.8).isHighRisk()).toBe(false);
    });
  });

  describe('isCritical', () => {
    it('should return true for score >= 80', () => {
      expect(ChurnRiskScore.create(80, 0.8).isCritical()).toBe(true);
      expect(ChurnRiskScore.create(100, 0.8).isCritical()).toBe(true);
    });

    it('should return false for score < 80', () => {
      expect(ChurnRiskScore.create(79, 0.8).isCritical()).toBe(false);
      expect(ChurnRiskScore.create(60, 0.8).isCritical()).toBe(false);
    });
  });

  describe('toValue', () => {
    it('should return serializable object with all fields', () => {
      const score = ChurnRiskScore.create(75, 0.85);
      const value = score.toValue();

      expect(value).toEqual({
        value: 75,
        confidence: 0.85,
        level: 'HIGH',
        slaHours: 48,
      });
    });
  });

  describe('equality', () => {
    it('should be equal for same values', () => {
      const score1 = ChurnRiskScore.create(50, 0.8);
      const score2 = ChurnRiskScore.create(50, 0.8);
      expect(score1.equals(score2)).toBe(true);
    });

    it('should not be equal for different values', () => {
      const score1 = ChurnRiskScore.create(50, 0.8);
      const score2 = ChurnRiskScore.create(60, 0.8);
      expect(score1.equals(score2)).toBe(false);
    });

    it('should not be equal for different confidence', () => {
      const score1 = ChurnRiskScore.create(50, 0.8);
      const score2 = ChurnRiskScore.create(50, 0.9);
      expect(score1.equals(score2)).toBe(false);
    });
  });
});
