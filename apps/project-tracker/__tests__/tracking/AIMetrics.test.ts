import { describe, it, expect } from 'vitest';

import {
  calculateCostUtilization,
  computeAIHealthStatus,
  formatCost,
  formatPercent,
  getAccuracyColor,
  getCostUtilizationColor,
  getDriftBarWidth,
  getLatencyColor,
  getRoiVariant,
  getSloComplianceStatus,
} from '../../components/tracking/AIMetrics';

/**
 * AIMetrics' exported helpers, imported from the component. This file used to define copies of
 * them inline, because the root test project had no `@/` alias for project-tracker code and the
 * component could not be imported (#1216); vitest.config.ts now resolves it.
 */

// --- Tests ---

describe('AIMetrics component logic', () => {
  describe('getCostUtilizationColor', () => {
    it('returns green class for pct <= 70', () => {
      expect(getCostUtilizationColor(50)).toBe('text-green-600');
    });

    it('returns yellow class for pct 71-90', () => {
      expect(getCostUtilizationColor(80)).toBe('text-yellow-600');
    });

    it('returns red class for pct > 90', () => {
      expect(getCostUtilizationColor(95)).toBe('text-red-600');
    });

    it('boundary: exactly 70 returns green', () => {
      expect(getCostUtilizationColor(70)).toBe('text-green-600');
    });

    it('boundary: exactly 71 returns yellow', () => {
      expect(getCostUtilizationColor(71)).toBe('text-yellow-600');
    });

    it('boundary: exactly 90 returns yellow', () => {
      expect(getCostUtilizationColor(90)).toBe('text-yellow-600');
    });

    it('boundary: exactly 91 returns red', () => {
      expect(getCostUtilizationColor(91)).toBe('text-red-600');
    });
  });

  describe('calculateCostUtilization', () => {
    it('normal calculation: (100/500)*100 = 20', () => {
      expect(calculateCostUtilization(100, 500)).toBe(20);
    });

    it('zero budget returns 0 (no division by zero)', () => {
      expect(calculateCostUtilization(100, 0)).toBe(0);
    });

    it('over budget caps at computed value (not clamped)', () => {
      expect(calculateCostUtilization(600, 500)).toBe(120);
    });

    it('rounds to integer', () => {
      expect(calculateCostUtilization(33, 100)).toBe(33);
      expect(calculateCostUtilization(1, 3)).toBe(33);
    });
  });

  describe('getDriftBarWidth', () => {
    it('score 0 returns 0', () => {
      expect(getDriftBarWidth(0, 0.05)).toBe(0);
    });

    it('score = threshold returns 100', () => {
      expect(getDriftBarWidth(0.05, 0.05)).toBe(100);
    });

    it('score > threshold clamps at 100', () => {
      expect(getDriftBarWidth(0.1, 0.05)).toBe(100);
    });

    it('score < threshold returns proportional value', () => {
      expect(getDriftBarWidth(0.025, 0.05)).toBe(50);
    });
  });

  describe('getLatencyColor (p50 thresholds: 500ms green / 1000ms yellow)', () => {
    const p50Thresholds = { green: 500, yellow: 1000 };

    it('below 500ms returns green', () => {
      expect(getLatencyColor(300, p50Thresholds)).toBe('text-green-600');
    });

    it('500-999ms returns yellow', () => {
      expect(getLatencyColor(700, p50Thresholds)).toBe('text-yellow-600');
    });

    it('1000ms+ returns red', () => {
      expect(getLatencyColor(1500, p50Thresholds)).toBe('text-red-600');
    });

    it('boundary at exactly 500ms returns yellow', () => {
      expect(getLatencyColor(500, p50Thresholds)).toBe('text-yellow-600');
    });
  });

  describe('getLatencyColor (p95 thresholds: 1000ms green / 2000ms yellow)', () => {
    const p95Thresholds = { green: 1000, yellow: 2000 };

    it('below 1000ms returns green', () => {
      expect(getLatencyColor(800, p95Thresholds)).toBe('text-green-600');
    });

    it('1000-1999ms returns yellow', () => {
      expect(getLatencyColor(1500, p95Thresholds)).toBe('text-yellow-600');
    });

    it('2000ms+ returns red', () => {
      expect(getLatencyColor(2500, p95Thresholds)).toBe('text-red-600');
    });
  });

  describe('getAccuracyColor', () => {
    it('>= 0.9 returns green', () => {
      expect(getAccuracyColor(0.95)).toBe('text-green-600');
    });

    it('0.8-0.89 returns yellow', () => {
      expect(getAccuracyColor(0.85)).toBe('text-yellow-600');
    });

    it('< 0.8 returns red', () => {
      expect(getAccuracyColor(0.7)).toBe('text-red-600');
    });

    it('boundary: exactly 0.9 returns green', () => {
      expect(getAccuracyColor(0.9)).toBe('text-green-600');
    });

    it('boundary: exactly 0.8 returns yellow', () => {
      expect(getAccuracyColor(0.8)).toBe('text-yellow-600');
    });
  });

  describe('getSloComplianceStatus', () => {
    it('both null returns pending', () => {
      expect(getSloComplianceStatus(null, null)).toBe('pending');
    });

    it('both true returns compliant', () => {
      expect(getSloComplianceStatus(true, true)).toBe('compliant');
    });

    it('any false returns violation', () => {
      expect(getSloComplianceStatus(false, true)).toBe('violation');
      expect(getSloComplianceStatus(true, false)).toBe('violation');
      expect(getSloComplianceStatus(false, false)).toBe('violation');
    });

    it('mixed null/true returns pending', () => {
      expect(getSloComplianceStatus(null, true)).toBe('pending');
      expect(getSloComplianceStatus(true, null)).toBe('pending');
    });
  });

  describe('getRoiVariant', () => {
    it('null returns default', () => {
      expect(getRoiVariant(null, 200)).toBe('default');
    });

    it('>= 200 returns success', () => {
      expect(getRoiVariant(250, 200)).toBe('success');
      expect(getRoiVariant(200, 200)).toBe('success');
    });

    it('100-199 returns warning', () => {
      expect(getRoiVariant(150, 200)).toBe('warning');
      expect(getRoiVariant(100, 200)).toBe('warning');
    });

    it('< 100 returns error', () => {
      expect(getRoiVariant(50, 200)).toBe('error');
      expect(getRoiVariant(0, 200)).toBe('error');
    });
  });

  describe('formatPercent / formatCost', () => {
    it('formatPercent(0.051, 1) returns "5.1"', () => {
      expect(formatPercent(0.051, 1)).toBe('5.1');
    });

    it('formatPercent(0.95) returns "95" (0-decimal default)', () => {
      expect(formatPercent(0.95)).toBe('95');
    });

    it('formatCost(42.5) returns "42.50"', () => {
      expect(formatCost(42.5)).toBe('42.50');
    });

    it('formatCost(0.0035) returns "0.00" (3-decimal input rounds to 2)', () => {
      expect(formatCost(0.0035)).toBe('0.00');
    });
  });
});

describe('computeAIHealthStatus', () => {
  const data = (over: Partial<Record<string, unknown>> = {}) =>
    ({
      drift: { score: 0.1, detected: false },
      hallucination: { rate: 0.01, threshold: 0.05 },
      slo: { p95_actual_ms: 800 },
      roi: { current_percentage: 150 },
      ...over,
    }) as Parameters<typeof computeAIHealthStatus>[0];

  it('is pending with no data, or with no measurement at all', () => {
    expect(computeAIHealthStatus(null, 'compliant')).toBe('pending');
    expect(
      computeAIHealthStatus(
        data({
          drift: { score: null, detected: false },
          hallucination: { rate: null, threshold: 0.05 },
          slo: { p95_actual_ms: null },
          roi: { current_percentage: null },
        }),
        'pending'
      )
    ).toBe('pending');
  });

  it('is green when every measurement is within its target and the SLO holds', () => {
    expect(computeAIHealthStatus(data(), 'compliant')).toBe('green');
  });

  it('is yellow while the SLO is not yet known', () => {
    expect(computeAIHealthStatus(data(), 'pending')).toBe('yellow');
  });

  it.each([
    ['drift is detected', data({ drift: { score: 0.4, detected: true } }), 'compliant'],
    [
      'hallucinations exceed the threshold',
      data({ hallucination: { rate: 0.06, threshold: 0.05 } }),
      'compliant',
    ],
    ['the SLO is violated', data(), 'violation'],
    ['ROI is below 100%', data({ roi: { current_percentage: 99 } }), 'compliant'],
  ] as const)('is red when %s', (_case, input, slo) => {
    expect(computeAIHealthStatus(input, slo)).toBe('red');
  });

  it('is not red at exactly the hallucination threshold or exactly 100% ROI', () => {
    expect(
      computeAIHealthStatus(
        data({ hallucination: { rate: 0.05, threshold: 0.05 }, roi: { current_percentage: 100 } }),
        'compliant'
      )
    ).toBe('green');
  });
});
