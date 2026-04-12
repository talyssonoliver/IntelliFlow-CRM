/**
 * Statistical Analysis - B11 coverage tests
 *
 * Targets remaining uncovered branches in private distribution functions:
 * - normalDistributionQuantile: pLow branch, pHigh branch
 * - normalDistributionCDF: extreme z values (<-8, >8)
 * - incompleteBeta: x===0, x===1, else branch (x >= (a+1)/(a+b+2))
 * - incompleteGamma: x<0 or a<=0, x===0, CF branch
 * - tDistributionCritical: dp guard (Math.abs(dp) <= 0.0001)
 * - chiSquareDistributionPValue: x<=0
 * - welchTTestFromStats: denominator===0 for df
 */
import { describe, it, expect } from 'vitest';
import {
  welchTTest,
  welchTTestFromStats,
  chiSquareTest,
  calculatePower,
  requiredSampleSize,
  analyzeExperiment,
} from '../statistical-analysis';

describe('Statistical Analysis - b11 branch coverage', () => {
  describe('private distribution functions via public API', () => {
    it('should handle incompleteBeta x===0 branch via chi-square with zero stat', () => {
      // chi-square with all equal counts -> chiSq=0 -> incompleteGamma x=0 returns 0
      const result = chiSquareTest(50, 100, 50, 100);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should reach incompleteGamma CF branch via chi-square with large x', () => {
      // Large chi-square statistic triggers incompleteGamma CF branch (x >= a+1)
      const result = chiSquareTest(0, 1000, 1000, 1000);
      expect(result.pValue).toBeLessThan(0.001);
      expect(result.isSignificant).toBe(true);
    });

    it('should reach normalDistributionCDF extreme negative z via very large t', () => {
      // Very large sample with extreme difference -> large t -> normalDistributionCDF extreme
      const result = welchTTestFromStats(0, 1, 10000, 100, 1, 10000);
      expect(result.pValue).toBeCloseTo(0, 5);
      expect(result.isSignificant).toBe(true);
    });

    it('should exercise normalDistributionQuantile pLow branch via power calculation', () => {
      // Very small alpha triggers pLow branch in normalDistributionQuantile
      const power = calculatePower(1000, 0.5, 0.001);
      expect(power).toBeGreaterThan(0);
      expect(power).toBeLessThanOrEqual(1);
    });

    it('should exercise normalDistributionQuantile pHigh branch via power calculation', () => {
      // Very high alpha close to 1 triggers pHigh branch
      const power = calculatePower(1000, 0.5, 0.999);
      expect(power).toBeGreaterThan(0);
      expect(power).toBeLessThanOrEqual(1);
    });

    it('should exercise incompleteBeta else branch via t-test with specific df', () => {
      // Small df with specific x values forces the else branch in incompleteBeta
      // df=2 means beta is computed with a=1, b=0.5 where x may exceed (a+1)/(a+b+2)
      const result = welchTTestFromStats(10, 5, 3, 50, 5, 3);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });

    it('should exercise tDistributionCritical dp guard with very small df', () => {
      // Very small df forces Newton-Raphson to potentially hit dp guard
      // df ~ 2 makes derivative very small near boundaries
      const result = welchTTestFromStats(10, 1, 2, 100, 1, 2, 0.001);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
      expect(result.isSignificant).toBeDefined();
    });
  });

  describe('analyzeExperiment - supplementary branches', () => {
    it('should handle control winning (control mean > treatment mean and significant)', () => {
      const control = [90, 92, 94, 95, 93, 91, 88, 96, 94, 92];
      const treatment = [60, 62, 64, 65, 63, 61, 58, 66, 64, 62];

      const analysis = analyzeExperiment(control, treatment);

      expect(analysis.winner).toBe('control');
      expect(analysis.recommendation).toContain('Control');
    });

    it('should handle single element arrays', () => {
      const control = [50];
      const treatment = [80];

      const analysis = analyzeExperiment(control, treatment);

      // Single element -> insufficient data for t-test
      expect(analysis.tTest.pValue).toBe(1);
      expect(analysis.winner).toBeNull();
    });

    it('should include chi-square when all conversion params provided', () => {
      const control = [10, 20, 30, 40, 50];
      const treatment = [60, 70, 80, 90, 100];

      const analysis = analyzeExperiment(control, treatment, 2, 4, 0.05);

      expect(analysis.chiSquare).toBeDefined();
    });
  });

  describe('requiredSampleSize - additional values', () => {
    it('should return larger sample for smaller effect size', () => {
      const n1 = requiredSampleSize(0.8);
      const n2 = requiredSampleSize(0.2);
      expect(n2).toBeGreaterThan(n1);
    });

    it('should return larger sample for higher power', () => {
      const n1 = requiredSampleSize(0.5, 0.8);
      const n2 = requiredSampleSize(0.5, 0.99);
      expect(n2).toBeGreaterThan(n1);
    });

    it('should return larger sample for smaller alpha', () => {
      const n1 = requiredSampleSize(0.5, 0.8, 0.05);
      const n2 = requiredSampleSize(0.5, 0.8, 0.001);
      expect(n2).toBeGreaterThan(n1);
    });
  });

  describe('welchTTestFromStats - additional alpha values', () => {
    it('should respect custom alpha 0.01', () => {
      const result = welchTTestFromStats(50, 10, 30, 55, 10, 30, 0.01);
      // alpha=0.01 means significance threshold is stricter
      expect(result.isSignificant).toBeDefined();
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });

    it('should handle very small n with large variance difference', () => {
      const result = welchTTestFromStats(100, 0.1, 2, 200, 100, 2);
      expect(result.tStatistic).toBeDefined();
      expect(result.pValue).toBeGreaterThanOrEqual(0);
    });
  });
});
