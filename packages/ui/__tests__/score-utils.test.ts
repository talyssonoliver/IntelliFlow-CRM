// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  getScoreTier,
  getScoreTierConfig,
  getConfidenceLevel,
  getConfidenceLevelConfig,
  formatConfidence,
  formatImpact,
  getImpactDirection,
  sortFactorsByImpact,
  getTopFactors,
  getTotalPositiveImpact,
  getTotalNegativeImpact,
  getImpactBarWidth,
  SCORE_THRESHOLDS,
  CONFIDENCE_THRESHOLDS,
} from '../src/components/score/utils';
import type { ScoreFactor } from '../src/components/score/types';

describe('Score Utils', () => {
  describe('getScoreTier', () => {
    it('should return "hot" for scores >= 80', () => {
      expect(getScoreTier(80)).toBe('hot');
      expect(getScoreTier(90)).toBe('hot');
      expect(getScoreTier(100)).toBe('hot');
    });

    it('should return "warm" for scores >= 50 and < 80', () => {
      expect(getScoreTier(50)).toBe('warm');
      expect(getScoreTier(65)).toBe('warm');
      expect(getScoreTier(79)).toBe('warm');
    });

    it('should return "cold" for scores < 50', () => {
      expect(getScoreTier(0)).toBe('cold');
      expect(getScoreTier(25)).toBe('cold');
      expect(getScoreTier(49)).toBe('cold');
    });
  });

  describe('getScoreTierConfig', () => {
    it('should return hot config for high scores', () => {
      const config = getScoreTierConfig(85);
      expect(config.tier).toBe('hot');
      expect(config.label).toBe('Hot');
      expect(config.color).toBe('text-success');
      expect(config.icon).toBe('local_fire_department');
    });

    it('should return warm config for medium scores', () => {
      const config = getScoreTierConfig(60);
      expect(config.tier).toBe('warm');
      expect(config.label).toBe('Warm');
      expect(config.color).toBe('text-warning');
      expect(config.icon).toBe('thermostat');
    });

    it('should return cold config for low scores', () => {
      const config = getScoreTierConfig(30);
      expect(config.tier).toBe('cold');
      expect(config.label).toBe('Cold');
      expect(config.color).toBe('text-muted-foreground');
      expect(config.icon).toBe('ac_unit');
    });
  });

  describe('getConfidenceLevel', () => {
    it('should return "high" for confidence >= 0.8', () => {
      expect(getConfidenceLevel(0.8)).toBe('high');
      expect(getConfidenceLevel(0.9)).toBe('high');
      expect(getConfidenceLevel(1)).toBe('high');
    });

    it('should return "medium" for confidence >= 0.5 and < 0.8', () => {
      expect(getConfidenceLevel(0.5)).toBe('medium');
      expect(getConfidenceLevel(0.65)).toBe('medium');
      expect(getConfidenceLevel(0.79)).toBe('medium');
    });

    it('should return "low" for confidence < 0.5', () => {
      expect(getConfidenceLevel(0)).toBe('low');
      expect(getConfidenceLevel(0.25)).toBe('low');
      expect(getConfidenceLevel(0.49)).toBe('low');
    });
  });

  describe('getConfidenceLevelConfig', () => {
    it('should return high config for high confidence', () => {
      const config = getConfidenceLevelConfig(0.9);
      expect(config.level).toBe('high');
      expect(config.label).toBe('High Confidence');
      expect(config.color).toBe('text-success');
    });

    it('should return medium config for medium confidence', () => {
      const config = getConfidenceLevelConfig(0.6);
      expect(config.level).toBe('medium');
      expect(config.label).toBe('Medium Confidence');
      expect(config.color).toBe('text-warning');
    });

    it('should return low config for low confidence', () => {
      const config = getConfidenceLevelConfig(0.3);
      expect(config.level).toBe('low');
      expect(config.label).toBe('Low Confidence');
      expect(config.color).toBe('text-destructive');
    });
  });

  describe('formatConfidence', () => {
    it('should format confidence as percentage', () => {
      expect(formatConfidence(0.85)).toBe('85%');
      expect(formatConfidence(0.5)).toBe('50%');
      expect(formatConfidence(1)).toBe('100%');
      expect(formatConfidence(0)).toBe('0%');
    });

    it('should round to nearest whole number', () => {
      expect(formatConfidence(0.856)).toBe('86%');
      expect(formatConfidence(0.854)).toBe('85%');
    });
  });

  describe('formatImpact', () => {
    it('should add + sign for positive impacts', () => {
      expect(formatImpact(10)).toBe('+10');
      expect(formatImpact(25)).toBe('+25');
    });

    it('should show - sign for negative impacts', () => {
      expect(formatImpact(-10)).toBe('-10');
      expect(formatImpact(-25)).toBe('-25');
    });

    it('should handle zero impact', () => {
      expect(formatImpact(0)).toBe('+0');
    });
  });

  describe('getImpactDirection', () => {
    it('should return positive for positive impact', () => {
      expect(getImpactDirection(10)).toBe('positive');
    });

    it('should return negative for negative impact', () => {
      expect(getImpactDirection(-10)).toBe('negative');
    });

    it('should return neutral for zero impact', () => {
      expect(getImpactDirection(0)).toBe('neutral');
    });
  });

  describe('sortFactorsByImpact', () => {
    const factors: ScoreFactor[] = [
      { name: 'Low', impact: 5, reasoning: 'test' },
      { name: 'High', impact: 30, reasoning: 'test' },
      { name: 'Negative', impact: -20, reasoning: 'test' },
      { name: 'Medium', impact: 15, reasoning: 'test' },
    ];

    it('should sort by absolute impact descending', () => {
      const sorted = sortFactorsByImpact(factors);
      expect(sorted[0].name).toBe('High');
      expect(sorted[1].name).toBe('Negative');
      expect(sorted[2].name).toBe('Medium');
      expect(sorted[3].name).toBe('Low');
    });

    it('should not mutate original array', () => {
      const original = [...factors];
      sortFactorsByImpact(factors);
      expect(factors).toEqual(original);
    });
  });

  describe('getTopFactors', () => {
    const factors: ScoreFactor[] = [
      { name: 'A', impact: 5, reasoning: 'test' },
      { name: 'B', impact: 30, reasoning: 'test' },
      { name: 'C', impact: -20, reasoning: 'test' },
      { name: 'D', impact: 15, reasoning: 'test' },
    ];

    it('should return top N factors by absolute impact', () => {
      const top2 = getTopFactors(factors, 2);
      expect(top2).toHaveLength(2);
      expect(top2[0].name).toBe('B');
      expect(top2[1].name).toBe('C');
    });

    it('should return all factors if limit exceeds length', () => {
      const all = getTopFactors(factors, 10);
      expect(all).toHaveLength(4);
    });
  });

  describe('getTotalPositiveImpact', () => {
    it('should sum positive impacts only', () => {
      const factors: ScoreFactor[] = [
        { name: 'A', impact: 10, reasoning: 'test' },
        { name: 'B', impact: -5, reasoning: 'test' },
        { name: 'C', impact: 15, reasoning: 'test' },
      ];
      expect(getTotalPositiveImpact(factors)).toBe(25);
    });

    it('should return 0 for all negative factors', () => {
      const factors: ScoreFactor[] = [
        { name: 'A', impact: -10, reasoning: 'test' },
        { name: 'B', impact: -5, reasoning: 'test' },
      ];
      expect(getTotalPositiveImpact(factors)).toBe(0);
    });
  });

  describe('getTotalNegativeImpact', () => {
    it('should sum negative impacts only', () => {
      const factors: ScoreFactor[] = [
        { name: 'A', impact: 10, reasoning: 'test' },
        { name: 'B', impact: -5, reasoning: 'test' },
        { name: 'C', impact: -15, reasoning: 'test' },
      ];
      expect(getTotalNegativeImpact(factors)).toBe(-20);
    });

    it('should return 0 for all positive factors', () => {
      const factors: ScoreFactor[] = [
        { name: 'A', impact: 10, reasoning: 'test' },
        { name: 'B', impact: 5, reasoning: 'test' },
      ];
      expect(getTotalNegativeImpact(factors)).toBe(0);
    });
  });

  describe('getImpactBarWidth', () => {
    it('should calculate percentage relative to max impact', () => {
      expect(getImpactBarWidth(25, 50)).toBe(50);
      expect(getImpactBarWidth(50, 50)).toBe(100);
      expect(getImpactBarWidth(10, 50)).toBe(20);
    });

    it('should use absolute value for negative impacts', () => {
      expect(getImpactBarWidth(-25, 50)).toBe(50);
    });

    it('should cap at 100%', () => {
      expect(getImpactBarWidth(75, 50)).toBe(100);
    });

    it('should use default max impact of 50', () => {
      expect(getImpactBarWidth(25)).toBe(50);
    });
  });

  describe('Constants', () => {
    it('should have correct score thresholds', () => {
      expect(SCORE_THRESHOLDS.hot).toBe(80);
      expect(SCORE_THRESHOLDS.warm).toBe(50);
    });

    it('should have correct confidence thresholds', () => {
      expect(CONFIDENCE_THRESHOLDS.high).toBe(0.8);
      expect(CONFIDENCE_THRESHOLDS.medium).toBe(0.5);
    });
  });
});
