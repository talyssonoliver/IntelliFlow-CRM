import { describe, it, expect } from 'vitest';

/**
 * Tests for AIMetrics component logic.
 *
 * Pure-function extraction pattern: replicate inline helper functions
 * from the component for testability (no DOM rendering, no React imports).
 * Follows QualityDashboard.test.ts pattern.
 */

// --- Pure functions replicated from AIMetrics.tsx ---

function getCostUtilizationColor(pct: number): string {
  if (pct > 90) return 'text-red-600';
  if (pct > 70) return 'text-yellow-600';
  return 'text-green-600';
}

function calculateCostUtilization(current: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.round((current / budget) * 100);
}

function getDriftBarWidth(score: number, threshold: number): number {
  if (threshold === 0) return 0;
  return Math.min((score / threshold) * 100, 100);
}

function getLatencyColor(
  ms: number,
  thresholds: { green: number; yellow: number }
): string {
  if (ms < thresholds.green) return 'text-green-600';
  if (ms < thresholds.yellow) return 'text-yellow-600';
  return 'text-red-600';
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 0.9) return 'text-green-600';
  if (accuracy >= 0.8) return 'text-yellow-600';
  return 'text-red-600';
}

function getSloComplianceStatus(
  p95: boolean | null,
  p99: boolean | null
): 'compliant' | 'violation' | 'pending' {
  if (p95 === null || p99 === null) return 'pending';
  if (p95 === false || p99 === false) return 'violation';
  return 'compliant';
}

function getRoiVariant(
  roi: number | null,
  _target: number
): string {
  if (roi === null) return 'default';
  if (roi >= 200) return 'success';
  if (roi >= 100) return 'warning';
  return 'error';
}

function formatPercent(value: number, decimals?: number): string {
  const d = decimals ?? 0;
  return (value * 100).toFixed(d);
}

function formatCost(value: number): string {
  return value.toFixed(2);
}

// --- AIMetricsData interface for validation ---

interface AIMetricsData {
  models: Array<{
    name: string;
    latency_p50: number | null;
    latency_p95: number | null;
    accuracy: number | null;
    cost_per_1k: number;
    requests_24h: number;
    cost_total: number;
  }>;
  drift: {
    detected: boolean;
    score: number | null;
    lastCheck: string | null;
    threshold: number;
    history: Array<{ date: string; score: number; detected: boolean }>;
    alerts: Array<{ timestamp: string; severity: string; message: string }>;
  };
  costs: {
    current_month: number;
    budget: number;
    forecast: number;
    trend: 'up' | 'down' | 'stable';
    history: Array<{ date: string; amount: number }>;
    by_model: Record<string, number>;
  };
  hallucination: {
    rate: number | null;
    threshold: number;
    samples_checked: number;
    history: Array<{ date: string; rate: number }>;
  };
  slo: {
    p95_target_ms: number;
    p99_target_ms: number;
    p95_actual_ms: number | null;
    p99_actual_ms: number | null;
    p95_compliant: boolean | null;
    p99_compliant: boolean | null;
    success_rate: number | null;
  };
  roi: {
    current_percentage: number | null;
    target_percentage: number;
    total_cost: number;
    total_value: number;
    trend: 'improving' | 'stable' | 'declining' | null;
  };
}

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

  describe('AIMetricsData interface validation', () => {
    it('accepts all-null metric fields without type errors', () => {
      const data: AIMetricsData = {
        models: [],
        drift: {
          detected: false,
          score: null,
          lastCheck: null,
          threshold: 0.05,
          history: [],
          alerts: [],
        },
        costs: {
          current_month: 0,
          budget: 500,
          forecast: 0,
          trend: 'stable',
          history: [],
          by_model: {},
        },
        hallucination: {
          rate: null,
          threshold: 0.05,
          samples_checked: 0,
          history: [],
        },
        slo: {
          p95_target_ms: 2000,
          p99_target_ms: 5000,
          p95_actual_ms: null,
          p99_actual_ms: null,
          p95_compliant: null,
          p99_compliant: null,
          success_rate: null,
        },
        roi: {
          current_percentage: null,
          target_percentage: 200,
          total_cost: 0,
          total_value: 0,
          trend: null,
        },
      };

      expect(data).toBeDefined();
      expect(data.drift.score).toBeNull();
      expect(data.slo.p95_actual_ms).toBeNull();
      expect(data.roi.current_percentage).toBeNull();
    });

    it('includes slo, roi, history arrays, costs.by_model', () => {
      const data: AIMetricsData = {
        models: [
          {
            name: 'test-model',
            latency_p50: 500,
            latency_p95: 1000,
            accuracy: 0.9,
            cost_per_1k: 0.03,
            requests_24h: 100,
            cost_total: 3.0,
          },
        ],
        drift: {
          detected: false,
          score: 0.02,
          lastCheck: '2026-01-01T00:00:00Z',
          threshold: 0.05,
          history: [{ date: '2026-01-01', score: 0.02, detected: false }],
          alerts: [
            {
              timestamp: '2026-01-01T00:00:00Z',
              severity: 'warning',
              message: 'Drift approaching threshold',
            },
          ],
        },
        costs: {
          current_month: 100,
          budget: 500,
          forecast: 150,
          trend: 'up',
          history: [{ date: '2026-01-01', amount: 80 }],
          by_model: { 'test-model': 100 },
        },
        hallucination: {
          rate: 0.03,
          threshold: 0.05,
          samples_checked: 100,
          history: [{ date: '2026-01-01', rate: 0.03 }],
        },
        slo: {
          p95_target_ms: 2000,
          p99_target_ms: 5000,
          p95_actual_ms: 1500,
          p99_actual_ms: 3000,
          p95_compliant: true,
          p99_compliant: true,
          success_rate: 0.99,
        },
        roi: {
          current_percentage: 250,
          target_percentage: 200,
          total_cost: 1000,
          total_value: 2500,
          trend: 'improving',
        },
      };

      expect(data.slo).toBeDefined();
      expect(data.roi).toBeDefined();
      expect(data.drift.history).toHaveLength(1);
      expect(data.drift.alerts).toHaveLength(1);
      expect(data.hallucination.history).toHaveLength(1);
      expect(data.costs.history).toHaveLength(1);
      expect(data.costs.by_model).toHaveProperty('test-model');
      expect(data.models[0].cost_total).toBe(3.0);
    });
  });
});
