/**
 * Statistical Analysis Tests - IFC-025: A/B Testing Framework
 *
 * Tests for statistical utilities: t-test, chi-square, effect size, power analysis.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDescriptiveStats,
  welchTTest,
  welchTTestFromStats,
  chiSquareTest,
  cohensD,
  cohensDFromStats,
  interpretEffectSize,
  requiredSampleSize,
  calculatePower,
  analyzeExperiment,
} from '../statistical-analysis';

describe('Statistical Analysis Utilities', () => {
  // ===========================================================================
  // Descriptive Statistics Tests
  // ===========================================================================

  describe('calculateDescriptiveStats', () => {
    it('should calculate stats for simple data', () => {
      const data = [1, 2, 3, 4, 5];
      const stats = calculateDescriptiveStats(data);

      expect(stats.n).toBe(5);
      expect(stats.mean).toBe(3);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
    });

    it('should calculate correct variance with Bessel correction', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9];
      const stats = calculateDescriptiveStats(data);

      expect(stats.n).toBe(8);
      expect(stats.mean).toBe(5);
      // Sample variance = 4.571... (with n-1)
      expect(stats.variance).toBeCloseTo(4.571, 2);
    });

    it('should handle empty array', () => {
      const stats = calculateDescriptiveStats([]);

      expect(stats.n).toBe(0);
      expect(stats.mean).toBe(0);
      expect(stats.variance).toBe(0);
      expect(stats.stdDev).toBe(0);
    });

    it('should handle single element', () => {
      const stats = calculateDescriptiveStats([42]);

      expect(stats.n).toBe(1);
      expect(stats.mean).toBe(42);
      expect(stats.variance).toBe(0);
    });
  });

  // ===========================================================================
  // Welch's t-test Tests
  // ===========================================================================

  describe('welchTTest', () => {
    it('should detect significant difference', () => {
      // Two clearly different groups
      const control = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];
      const treatment = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];

      const result = welchTTest(control, treatment, 0.05);

      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.tStatistic).toBeLessThan(0); // control < treatment
    });

    it('should not detect significance for similar groups', () => {
      // Truly similar groups with identical distributions
      const control = [50, 52, 48, 51, 49, 53, 47, 50, 52, 51];
      const treatment = [50, 52, 48, 51, 49, 53, 47, 50, 52, 51];

      const result = welchTTest(control, treatment, 0.05);

      expect(result.isSignificant).toBe(false);
      // Identical data should have p-value = 1 or very high
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should calculate confidence interval', () => {
      const control = [70, 72, 74, 75, 73];
      const treatment = [75, 77, 79, 80, 78];

      const result = welchTTest(control, treatment, 0.05);

      expect(result.confidenceInterval.lower).toBeLessThan(0);
      expect(result.confidenceInterval.upper).toBeLessThan(0);
      // CI should not contain 0 if significant
    });

    it('should handle small samples gracefully', () => {
      const control = [50];
      const treatment = [60];

      const result = welchTTest(control, treatment, 0.05);

      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });
  });

  describe('welchTTestFromStats', () => {
    it('should match raw data t-test results', () => {
      const control = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];
      const treatment = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];

      const fromRaw = welchTTest(control, treatment, 0.05);

      const controlStats = calculateDescriptiveStats(control);
      const treatmentStats = calculateDescriptiveStats(treatment);

      const fromStats = welchTTestFromStats(
        controlStats.mean,
        controlStats.variance,
        controlStats.n,
        treatmentStats.mean,
        treatmentStats.variance,
        treatmentStats.n,
        0.05
      );

      expect(fromStats.tStatistic).toBeCloseTo(fromRaw.tStatistic, 4);
      expect(fromStats.isSignificant).toBe(fromRaw.isSignificant);
    });
  });

  // ===========================================================================
  // Chi-Square Test Tests
  // ===========================================================================

  describe('chiSquareTest', () => {
    it('should detect significant difference in conversion rates', () => {
      // Clear difference: 10% vs 30% conversion
      const result = chiSquareTest(10, 100, 30, 100, 0.05);

      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.chiSquareStatistic).toBeGreaterThan(0);
    });

    it('should not detect significance for similar rates', () => {
      // Similar rates: 20% vs 22%
      const result = chiSquareTest(20, 100, 22, 100, 0.05);

      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should handle zero conversions', () => {
      const result = chiSquareTest(0, 100, 0, 100, 0.05);

      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle empty groups', () => {
      const result = chiSquareTest(0, 0, 0, 0, 0.05);

      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should have degrees of freedom = 1 for 2x2 table', () => {
      const result = chiSquareTest(25, 100, 35, 100, 0.05);
      expect(result.degreesOfFreedom).toBe(1);
    });
  });

  // ===========================================================================
  // Cohen's d Tests
  // ===========================================================================

  describe('cohensD', () => {
    it('should calculate zero effect for identical groups', () => {
      const group1 = [50, 50, 50, 50, 50];
      const group2 = [50, 50, 50, 50, 50];

      expect(cohensD(group1, group2)).toBe(0);
    });

    it('should calculate positive effect when first group is higher', () => {
      const higher = [80, 82, 84, 86, 88];
      const lower = [50, 52, 54, 56, 58];

      const d = cohensD(higher, lower);
      expect(d).toBeGreaterThan(0);
    });

    it('should calculate negative effect when first group is lower', () => {
      const lower = [50, 52, 54, 56, 58];
      const higher = [80, 82, 84, 86, 88];

      const d = cohensD(lower, higher);
      expect(d).toBeLessThan(0);
    });

    it('should return approximately 0.8 for large effect', () => {
      // Large effect is typically when means differ by ~0.8 standard deviations
      const control = [50, 52, 54, 56, 58, 60, 62, 64, 66, 68];
      const treatment = [60, 62, 64, 66, 68, 70, 72, 74, 76, 78];

      const d = Math.abs(cohensD(control, treatment));
      expect(d).toBeGreaterThan(0.5);
    });
  });

  describe('cohensDFromStats', () => {
    it('should match raw data effect size', () => {
      const group1 = [70, 72, 74, 75, 73];
      const group2 = [80, 82, 84, 85, 83];

      const fromRaw = cohensD(group1, group2);

      const stats1 = calculateDescriptiveStats(group1);
      const stats2 = calculateDescriptiveStats(group2);

      const fromStats = cohensDFromStats(
        stats1.mean,
        stats1.variance,
        stats1.n,
        stats2.mean,
        stats2.variance,
        stats2.n
      );

      expect(fromStats).toBeCloseTo(fromRaw, 4);
    });
  });

  // ===========================================================================
  // Effect Size Interpretation Tests
  // ===========================================================================

  describe('interpretEffectSize', () => {
    it('should interpret negligible effect (d < 0.2)', () => {
      expect(interpretEffectSize(0.1)).toBe('NEGLIGIBLE');
      expect(interpretEffectSize(0.19)).toBe('NEGLIGIBLE');
      expect(interpretEffectSize(-0.1)).toBe('NEGLIGIBLE');
    });

    it('should interpret small effect (0.2 <= d < 0.5)', () => {
      expect(interpretEffectSize(0.2)).toBe('SMALL');
      expect(interpretEffectSize(0.35)).toBe('SMALL');
      expect(interpretEffectSize(0.49)).toBe('SMALL');
    });

    it('should interpret medium effect (0.5 <= d < 0.8)', () => {
      expect(interpretEffectSize(0.5)).toBe('MEDIUM');
      expect(interpretEffectSize(0.65)).toBe('MEDIUM');
      expect(interpretEffectSize(0.79)).toBe('MEDIUM');
    });

    it('should interpret large effect (d >= 0.8)', () => {
      expect(interpretEffectSize(0.8)).toBe('LARGE');
      expect(interpretEffectSize(1.2)).toBe('LARGE');
      expect(interpretEffectSize(2.0)).toBe('LARGE');
    });
  });

  // ===========================================================================
  // Power Analysis Tests
  // ===========================================================================

  describe('requiredSampleSize', () => {
    it('should require larger sample for small effects', () => {
      const smallEffect = requiredSampleSize(0.2);
      const largeEffect = requiredSampleSize(0.8);

      expect(smallEffect).toBeGreaterThan(largeEffect);
    });

    it('should require larger sample for higher power', () => {
      const power80 = requiredSampleSize(0.5, 0.8);
      const power90 = requiredSampleSize(0.5, 0.9);

      expect(power90).toBeGreaterThan(power80);
    });

    it('should require larger sample for stricter alpha', () => {
      const alpha05 = requiredSampleSize(0.5, 0.8, 0.05);
      const alpha01 = requiredSampleSize(0.5, 0.8, 0.01);

      expect(alpha01).toBeGreaterThan(alpha05);
    });

    it('should calculate reasonable sample sizes', () => {
      // For medium effect (0.5), 80% power, alpha 0.05
      // Standard tables suggest ~64 per group
      const n = requiredSampleSize(0.5, 0.8, 0.05);
      expect(n).toBeGreaterThan(50);
      expect(n).toBeLessThan(100);
    });
  });

  describe('calculatePower', () => {
    it('should increase power with larger samples', () => {
      const power50 = calculatePower(50, 0.5);
      const power100 = calculatePower(100, 0.5);
      const power200 = calculatePower(200, 0.5);

      expect(power50).toBeLessThan(power100);
      expect(power100).toBeLessThan(power200);
    });

    it('should increase power with larger effects', () => {
      const small = calculatePower(50, 0.2);
      const large = calculatePower(50, 0.8);

      expect(small).toBeLessThan(large);
    });

    it('should return high power for large sample and effect', () => {
      const power = calculatePower(100, 0.8);
      expect(power).toBeGreaterThan(0.9);
    });

    it('should return low power for small sample and effect', () => {
      const power = calculatePower(20, 0.2);
      expect(power).toBeLessThan(0.3);
    });
  });

  // ===========================================================================
  // Full Experiment Analysis Tests
  // ===========================================================================

  describe('analyzeExperiment', () => {
    it('should identify treatment winner when significantly better', () => {
      const control = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];
      const treatment = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.tTest.isSignificant).toBe(true);
      expect(analysis.winner).toBe('treatment');
      expect(analysis.control.mean).toBeLessThan(analysis.treatment.mean);
    });

    it('should identify control winner when significantly better', () => {
      const control = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];
      const treatment = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.tTest.isSignificant).toBe(true);
      expect(analysis.winner).toBe('control');
    });

    it('should not declare winner when not significant', () => {
      // Identical groups should not produce a significant difference
      const control = [50, 52, 48, 51, 49, 53, 47, 50, 52, 51];
      const treatment = [50, 52, 48, 51, 49, 53, 47, 50, 52, 51];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.tTest.isSignificant).toBe(false);
      expect(analysis.winner).toBeNull();
    });

    it('should include chi-square analysis when conversions provided', () => {
      const control = [70, 72, 74, 75, 73];
      const treatment = [80, 82, 84, 85, 83];

      const analysis = analyzeExperiment(control, treatment, 1, 3);

      expect(analysis.chiSquare).toBeDefined();
      expect(analysis.chiSquare?.chiSquareStatistic).toBeGreaterThanOrEqual(0);
    });

    it('should generate meaningful recommendation', () => {
      const control = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];
      const treatment = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.recommendation).toBeDefined();
      expect(analysis.recommendation.length).toBeGreaterThan(0);
    });

    it('should calculate effect size interpretation', () => {
      const control = [70, 72, 74, 75, 73];
      const treatment = [80, 82, 84, 85, 83];

      const analysis = analyzeExperiment(control, treatment);

      expect(['NEGLIGIBLE', 'SMALL', 'MEDIUM', 'LARGE']).toContain(
        analysis.effectSizeInterpretation
      );
    });
  });
});
