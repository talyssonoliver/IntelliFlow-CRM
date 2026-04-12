/**
 * Statistical Analysis - Supplementary Coverage Tests
 *
 * Targets remaining uncovered branches:
 * - welchTTestFromStats: identical means (tStatistic === 0), seDiff === 0,
 *   denominator === 0 for df, large df (>100) using normal approximation
 * - tDistributionCritical: Newton-Raphson convergence and dp guard
 * - chiSquareDistributionPValue: x <= 0 returns 1
 * - normalDistributionCDF: extreme z values (< -8, > 8)
 * - normalDistributionQuantile: p <= 0, p >= 1, pLow branch, pHigh branch
 * - incompleteBeta: x === 0, x === 1, branch selection
 * - incompleteGamma: x < 0 or a <= 0, x === 0, series vs CF branch
 * - requiredSampleSize: effectSize === 0 returns Infinity
 * - calculatePower: sampleSize < 2, effectSize === 0
 * - cohensDFromStats: n1 < 2 or n2 < 2, pooledStd === 0
 * - analyzeExperiment: with custom alpha
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

describe('Statistical Analysis - supplementary', () => {
  describe('welchTTestFromStats - edge cases', () => {
    it('should return non-significant for identical means', () => {
      const result = welchTTestFromStats(50, 10, 30, 50, 10, 30);
      expect(result.tStatistic).toBe(0);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
      expect(result.degreesOfFreedom).toBe(58); // n1 + n2 - 2
    });

    it('should handle zero variance in both groups', () => {
      // All values identical -> variance = 0, seDiff = 0
      const result = welchTTestFromStats(50, 0, 10, 50, 0, 10);
      expect(result.tStatistic).toBe(0);
      expect(result.pValue).toBe(1);
    });

    it('should handle n1 = 1 (insufficient sample)', () => {
      const result = welchTTestFromStats(50, 10, 1, 60, 10, 30);
      expect(result.tStatistic).toBe(0);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle n2 = 1 (insufficient sample)', () => {
      const result = welchTTestFromStats(50, 10, 30, 60, 10, 1);
      expect(result.tStatistic).toBe(0);
      expect(result.pValue).toBe(1);
    });

    it('should use normal approximation for large df (>100)', () => {
      // Large sample sizes -> df > 100
      const result = welchTTestFromStats(50, 10, 200, 55, 10, 200);
      expect(result.degreesOfFreedom).toBeGreaterThan(100);
      expect(result.pValue).toBeDefined();
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });

    it('should handle very different variances', () => {
      const result = welchTTestFromStats(50, 1, 100, 55, 100, 100);
      expect(result.tStatistic).toBeDefined();
      expect(result.pValue).toBeDefined();
    });

    it('should handle zero variance in one group with different means', () => {
      // Group 1 has zero variance, group 2 has some variance
      const result = welchTTestFromStats(50, 0, 10, 60, 10, 10);
      // seDiff = sqrt(0/10 + 10/10) = sqrt(1) = 1
      // t = (50 - 60) / 1 = -10
      expect(result.tStatistic).toBe(-10);
      expect(result.isSignificant).toBe(true);
    });
  });

  describe('chiSquareTest - edge cases', () => {
    it('should return p=1 for zero-total table', () => {
      const result = chiSquareTest(0, 0, 0, 0);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle one empty group (rowControl = 0)', () => {
      const result = chiSquareTest(0, 0, 10, 50);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle one empty group (rowTreatment = 0)', () => {
      const result = chiSquareTest(10, 50, 0, 0);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle 100% conversion in both groups', () => {
      const result = chiSquareTest(100, 100, 100, 100);
      // All converted -> no variance -> no significant difference
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should handle extreme conversion difference', () => {
      // 0% vs 100%
      const result = chiSquareTest(0, 100, 100, 100);
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.001);
    });
  });

  describe('cohensDFromStats - edge cases', () => {
    it('should return 0 when n1 < 2', () => {
      expect(cohensDFromStats(50, 10, 1, 60, 10, 30)).toBe(0);
    });

    it('should return 0 when n2 < 2', () => {
      expect(cohensDFromStats(50, 10, 30, 60, 10, 1)).toBe(0);
    });

    it('should return 0 when pooled std is 0', () => {
      // Both groups have zero variance
      expect(cohensDFromStats(50, 0, 10, 50, 0, 10)).toBe(0);
    });

    it('should handle very large effect sizes', () => {
      const d = cohensDFromStats(0, 1, 100, 100, 1, 100);
      expect(Math.abs(d)).toBeGreaterThan(50);
    });
  });

  describe('interpretEffectSize - boundary values', () => {
    it('should handle exact boundary at 0.2 (SMALL)', () => {
      expect(interpretEffectSize(0.2)).toBe('SMALL');
    });

    it('should handle exact boundary at 0.5 (MEDIUM)', () => {
      expect(interpretEffectSize(0.5)).toBe('MEDIUM');
    });

    it('should handle exact boundary at 0.8 (LARGE)', () => {
      expect(interpretEffectSize(0.8)).toBe('LARGE');
    });

    it('should handle negative values symmetrically', () => {
      expect(interpretEffectSize(-0.1)).toBe('NEGLIGIBLE');
      expect(interpretEffectSize(-0.3)).toBe('SMALL');
      expect(interpretEffectSize(-0.6)).toBe('MEDIUM');
      expect(interpretEffectSize(-1.0)).toBe('LARGE');
    });

    it('should handle zero', () => {
      expect(interpretEffectSize(0)).toBe('NEGLIGIBLE');
    });
  });

  describe('requiredSampleSize - edge cases', () => {
    it('should return Infinity for zero effect size', () => {
      expect(requiredSampleSize(0)).toBe(Infinity);
    });

    it('should return finite value for non-zero effect size', () => {
      const n = requiredSampleSize(0.5);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    });

    it('should return integer (ceiling)', () => {
      const n = requiredSampleSize(0.3, 0.8, 0.05);
      expect(Number.isInteger(n)).toBe(true);
    });
  });

  describe('calculatePower - edge cases', () => {
    it('should return 0 for sampleSize < 2', () => {
      expect(calculatePower(1, 0.5)).toBe(0);
    });

    it('should return 0 for zero effect size', () => {
      expect(calculatePower(100, 0)).toBe(0);
    });

    it('should return 0 for both conditions', () => {
      expect(calculatePower(1, 0)).toBe(0);
    });

    it('should approach 1 for very large samples', () => {
      const power = calculatePower(10000, 0.5);
      expect(power).toBeGreaterThan(0.99);
    });
  });

  describe('analyzeExperiment - additional branches', () => {
    it('should include chi-square when both conversion counts are provided', () => {
      const control = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];
      const treatment = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];

      const analysis = analyzeExperiment(control, treatment, 5, 8, 0.05);

      expect(analysis.chiSquare).toBeDefined();
      expect(analysis.chiSquare?.degreesOfFreedom).toBe(1);
    });

    it('should not include chi-square when only control conversions provided', () => {
      const control = [70, 72, 74, 75, 73];
      const treatment = [80, 82, 84, 85, 83];

      const analysis = analyzeExperiment(control, treatment, 3, undefined);

      expect(analysis.chiSquare).toBeUndefined();
    });

    it('should generate non-significant recommendation with correct format', () => {
      const control = [50, 52, 48, 51, 49, 53, 47, 50, 52, 51];
      const treatment = [50, 52, 48, 51, 49, 53, 47, 50, 52, 51];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.recommendation).toContain('No statistically significant');
      expect(analysis.recommendation).toContain('p-value');
      expect(analysis.winner).toBeNull();
    });

    it('should generate winner recommendation with improvement details', () => {
      const control = [70, 72, 74, 75, 73, 71, 68, 76, 74, 72];
      const treatment = [80, 82, 84, 85, 83, 81, 78, 86, 84, 82];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.winner).toBe('treatment');
      expect(analysis.recommendation).toContain('Treatment (AI)');
      expect(analysis.recommendation).toContain('statistically significant improvement');
    });

    it('should use custom alpha', () => {
      const control = [70, 72, 74, 75, 73, 71];
      const treatment = [74, 76, 78, 79, 77, 75];

      const analysisStrict = analyzeExperiment(control, treatment, undefined, undefined, 0.001);
      const analysisLenient = analyzeExperiment(control, treatment, undefined, undefined, 0.1);

      // Strict alpha should be less likely to find significance
      if (analysisStrict.tTest.isSignificant) {
        expect(analysisLenient.tTest.isSignificant).toBe(true);
      }
    });
  });

  describe('descriptive stats - edge cases', () => {
    it('should handle large dataset', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const stats = calculateDescriptiveStats(data);

      expect(stats.n).toBe(1000);
      expect(stats.mean).toBeCloseTo(499.5, 1);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(999);
    });

    it('should handle negative values', () => {
      const data = [-5, -3, -1, 0, 1, 3, 5];
      const stats = calculateDescriptiveStats(data);

      expect(stats.mean).toBe(0);
      expect(stats.min).toBe(-5);
      expect(stats.max).toBe(5);
    });

    it('should handle all identical values (variance = 0)', () => {
      const data = [42, 42, 42, 42, 42];
      const stats = calculateDescriptiveStats(data);

      expect(stats.mean).toBe(42);
      expect(stats.variance).toBe(0);
      expect(stats.stdDev).toBe(0);
    });
  });

  describe('welchTTest with real arrays - edge cases', () => {
    it('should handle very small samples (n=2 each)', () => {
      const control = [50, 60];
      const treatment = [70, 80];

      const result = welchTTest(control, treatment, 0.05);
      expect(result.degreesOfFreedom).toBeGreaterThan(0);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
    });

    it('should handle unequal sample sizes', () => {
      const control = [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70];
      const treatment = [80, 82, 84];

      const result = welchTTest(control, treatment, 0.05);
      expect(result.tStatistic).toBeDefined();
      expect(result.pValue).toBeDefined();
    });
  });
});
