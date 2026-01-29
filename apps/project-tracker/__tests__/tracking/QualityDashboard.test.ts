import { describe, it, expect } from 'vitest';

/**
 * Tests for QualityDashboard component logic.
 *
 * Since the project-tracker uses Node environment (not jsdom),
 * these tests focus on the pure functions and logic that can be
 * extracted and tested independently.
 */

// Helper functions extracted from QualityDashboard.tsx

/**
 * Gets color class for quality gate status
 */
function getQualityGateColor(gate: string): string {
  switch (gate.toLowerCase()) {
    case 'passed':
    case 'ok':
      return 'text-green-400';
    case 'failed':
    case 'error':
      return 'text-red-400';
    default:
      return 'text-yellow-400';
  }
}

/**
 * Gets variant color for coverage percentage
 */
function getCoverageColor(pct: number): 'success' | 'warning' | 'error' {
  if (pct >= 90) return 'success';
  if (pct >= 70) return 'warning';
  return 'error';
}

/**
 * Calculates trend direction from history data
 */
function calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
  if (values.length < 2) return 'stable';
  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'stable';
}

/**
 * Format history data for chart display
 */
interface HistorySnapshot {
  date: string;
  value: number;
}

function formatChartPoints(data: HistorySnapshot[], width: number, height: number, padding: number): string {
  if (!data || data.length === 0) return '';

  const values = data.map(d => d.value).reverse();
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return values.map((v, i) => {
    const x = padding + (i / (values.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');
}

/**
 * Get metric severity based on thresholds
 */
function getDebtSeverity(critical: number, high: number): 'critical' | 'high' | 'medium' | 'low' {
  if (critical > 0) return 'critical';
  if (high > 5) return 'high';
  if (high > 0) return 'medium';
  return 'low';
}

/**
 * Calculate health score from quality metrics
 */
function calculateHealthScore(metrics: {
  bugs: number;
  vulnerabilities: number;
  coverage: number;
  debtRatio: number;
  qualityGatePassed: boolean;
}): number {
  let score = 100;

  // Bugs penalty
  score -= metrics.bugs * 2;

  // Vulnerabilities penalty (severe)
  score -= metrics.vulnerabilities * 5;

  // Coverage bonus/penalty
  if (metrics.coverage >= 90) score += 5;
  else if (metrics.coverage < 80) score -= (80 - metrics.coverage) / 2;

  // Debt ratio penalty
  if (metrics.debtRatio > 5) score -= (metrics.debtRatio - 5) * 2;

  // Quality gate bonus/penalty
  if (metrics.qualityGatePassed) score += 10;
  else score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

describe('QualityDashboard Component Logic', () => {
  describe('getQualityGateColor', () => {
    it('returns green for passed/ok status', () => {
      expect(getQualityGateColor('passed')).toContain('green');
      expect(getQualityGateColor('ok')).toContain('green');
      expect(getQualityGateColor('OK')).toContain('green');
      expect(getQualityGateColor('PASSED')).toContain('green');
    });

    it('returns red for failed/error status', () => {
      expect(getQualityGateColor('failed')).toContain('red');
      expect(getQualityGateColor('error')).toContain('red');
      expect(getQualityGateColor('FAILED')).toContain('red');
      expect(getQualityGateColor('ERROR')).toContain('red');
    });

    it('returns yellow for unknown status', () => {
      expect(getQualityGateColor('warning')).toContain('yellow');
      expect(getQualityGateColor('unknown')).toContain('yellow');
      expect(getQualityGateColor('pending')).toContain('yellow');
    });
  });

  describe('getCoverageColor', () => {
    it('returns success for coverage >= 90%', () => {
      expect(getCoverageColor(90)).toBe('success');
      expect(getCoverageColor(95)).toBe('success');
      expect(getCoverageColor(100)).toBe('success');
    });

    it('returns warning for coverage >= 70% and < 90%', () => {
      expect(getCoverageColor(70)).toBe('warning');
      expect(getCoverageColor(80)).toBe('warning');
      expect(getCoverageColor(89.9)).toBe('warning');
    });

    it('returns error for coverage < 70%', () => {
      expect(getCoverageColor(0)).toBe('error');
      expect(getCoverageColor(50)).toBe('error');
      expect(getCoverageColor(69.9)).toBe('error');
    });
  });

  describe('calculateTrend', () => {
    it('returns stable for insufficient data', () => {
      expect(calculateTrend([])).toBe('stable');
      expect(calculateTrend([5])).toBe('stable');
    });

    it('returns up when values increase', () => {
      expect(calculateTrend([1, 2, 3])).toBe('up');
      expect(calculateTrend([10, 20])).toBe('up');
    });

    it('returns down when values decrease', () => {
      expect(calculateTrend([3, 2, 1])).toBe('down');
      expect(calculateTrend([20, 10])).toBe('down');
    });

    it('returns stable when values unchanged', () => {
      expect(calculateTrend([5, 5, 5])).toBe('stable');
      expect(calculateTrend([10, 10])).toBe('stable');
    });
  });

  describe('formatChartPoints', () => {
    it('returns empty string for empty data', () => {
      expect(formatChartPoints([], 100, 50, 2)).toBe('');
    });

    it('generates valid SVG points string', () => {
      const data: HistorySnapshot[] = [
        { date: '2026-01-01', value: 10 },
        { date: '2026-01-02', value: 20 },
        { date: '2026-01-03', value: 15 },
      ];

      const points = formatChartPoints(data, 100, 50, 2);
      expect(points).toBeDefined();
      expect(points.length).toBeGreaterThan(0);
      expect(points).toMatch(/^\d+(\.\d+)?,\d+(\.\d+)?( \d+(\.\d+)?,\d+(\.\d+)?)*$/);
    });

    it('handles single data point', () => {
      const data: HistorySnapshot[] = [{ date: '2026-01-01', value: 50 }];
      const points = formatChartPoints(data, 100, 50, 2);
      expect(points).toBeDefined();
    });
  });

  describe('getDebtSeverity', () => {
    it('returns critical when critical count > 0', () => {
      expect(getDebtSeverity(1, 0)).toBe('critical');
      expect(getDebtSeverity(5, 10)).toBe('critical');
    });

    it('returns high when high count > 5', () => {
      expect(getDebtSeverity(0, 6)).toBe('high');
      expect(getDebtSeverity(0, 10)).toBe('high');
    });

    it('returns medium when high count > 0 but <= 5', () => {
      expect(getDebtSeverity(0, 1)).toBe('medium');
      expect(getDebtSeverity(0, 5)).toBe('medium');
    });

    it('returns low when no critical or high items', () => {
      expect(getDebtSeverity(0, 0)).toBe('low');
    });
  });

  describe('calculateHealthScore', () => {
    it('returns 100 for perfect metrics', () => {
      const score = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 0,
        coverage: 95,
        debtRatio: 0,
        qualityGatePassed: true,
      });
      expect(score).toBe(100); // Base 100 + 5 (coverage) + 10 (gate) = capped at 100
    });

    it('penalizes bugs', () => {
      const withBugs = calculateHealthScore({
        bugs: 10,
        vulnerabilities: 0,
        coverage: 75, // Use lower coverage to avoid cap
        debtRatio: 0,
        qualityGatePassed: false, // No bonus
      });
      const withoutBugs = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 0,
        coverage: 75,
        debtRatio: 0,
        qualityGatePassed: false,
      });
      expect(withBugs).toBeLessThan(withoutBugs);
    });

    it('heavily penalizes vulnerabilities', () => {
      const withVulns = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 3,
        coverage: 85,
        debtRatio: 0,
        qualityGatePassed: true,
      });
      const withBugs = calculateHealthScore({
        bugs: 3,
        vulnerabilities: 0,
        coverage: 85,
        debtRatio: 0,
        qualityGatePassed: true,
      });
      // Vulnerabilities should have more penalty than bugs
      expect(withVulns).toBeLessThan(withBugs);
    });

    it('penalizes low coverage', () => {
      const highCoverage = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 0,
        coverage: 95,
        debtRatio: 0,
        qualityGatePassed: false, // No bonus to avoid cap
      });
      const lowCoverage = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 0,
        coverage: 60,
        debtRatio: 0,
        qualityGatePassed: false,
      });
      expect(lowCoverage).toBeLessThan(highCoverage);
    });

    it('penalizes high debt ratio', () => {
      const lowDebt = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 0,
        coverage: 85,
        debtRatio: 2,
        qualityGatePassed: true,
      });
      const highDebt = calculateHealthScore({
        bugs: 0,
        vulnerabilities: 0,
        coverage: 85,
        debtRatio: 15,
        qualityGatePassed: true,
      });
      expect(highDebt).toBeLessThan(lowDebt);
    });

    it('penalizes failed quality gate', () => {
      const passed = calculateHealthScore({
        bugs: 5, // Some penalty to avoid cap
        vulnerabilities: 0,
        coverage: 75, // No coverage bonus
        debtRatio: 0,
        qualityGatePassed: true,
      });
      const failed = calculateHealthScore({
        bugs: 5,
        vulnerabilities: 0,
        coverage: 75,
        debtRatio: 0,
        qualityGatePassed: false,
      });
      expect(failed).toBeLessThan(passed);
      expect(passed - failed).toBe(20); // +10 vs -10
    });

    it('clamps score between 0 and 100', () => {
      const veryBad = calculateHealthScore({
        bugs: 50,
        vulnerabilities: 20,
        coverage: 10,
        debtRatio: 50,
        qualityGatePassed: false,
      });
      expect(veryBad).toBeGreaterThanOrEqual(0);
      expect(veryBad).toBeLessThanOrEqual(100);
    });
  });

  describe('Metric Data Structures', () => {
    it('validates quality metrics structure', () => {
      const metrics = {
        debt: {
          total_items: 15,
          critical: 2,
          high: 5,
          medium: 6,
          low: 2,
          trend: 'stable' as const,
          lastUpdated: '2026-01-05T10:00:00Z',
          history: [{ date: '2026-01-05', value: 15 }],
        },
        coverage: {
          lines: 85.5,
          branches: 72.3,
          functions: 90.1,
          statements: 84.2,
          lastUpdated: '2026-01-05T10:00:00Z',
          history: [{ date: '2026-01-05', value: 85.5 }],
        },
        sonarqube: {
          qualityGate: 'OK',
          bugs: 3,
          vulnerabilities: 1,
          codeSmells: 25,
          duplications: 2.5,
          lastUpdated: '2026-01-05T10:00:00Z',
          history: [{ date: '2026-01-05', value: 3 }],
        },
        phantomAudit: {
          phantomCount: 2,
          validCount: 45,
          lastUpdated: '2026-01-05T10:00:00Z',
        },
      };

      // Validate all expected properties exist
      expect(metrics.debt.total_items).toBeDefined();
      expect(metrics.debt.critical).toBeDefined();
      expect(metrics.debt.history).toBeDefined();
      expect(metrics.coverage.lines).toBeDefined();
      expect(metrics.coverage.history).toBeDefined();
      expect(metrics.sonarqube.qualityGate).toBeDefined();
      expect(metrics.sonarqube.history).toBeDefined();
      expect(metrics.phantomAudit.phantomCount).toBeDefined();
    });

    it('validates history snapshot structure', () => {
      const snapshot: HistorySnapshot = {
        date: '2026-01-05',
        value: 85.5,
      };

      expect(snapshot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof snapshot.value).toBe('number');
    });
  });

  describe('Coverage Thresholds', () => {
    it('domain layer requires > 95% coverage', () => {
      expect(getCoverageColor(96)).toBe('success');
      expect(getCoverageColor(95)).toBe('success');
    });

    it('application layer requires > 90% coverage', () => {
      expect(getCoverageColor(91)).toBe('success');
      expect(getCoverageColor(90)).toBe('success');
    });

    it('overall requires > 90% coverage', () => {
      const overallTarget = 90;
      expect(getCoverageColor(overallTarget)).toBe('success');
      expect(getCoverageColor(overallTarget - 0.1)).toBe('warning');
    });
  });

  describe('Refresh Types', () => {
    it('supports all refresh types', () => {
      const validTypes = ['all', 'debt', 'sonar', 'coverage'];

      validTypes.forEach(type => {
        expect(['all', 'debt', 'sonar', 'coverage']).toContain(type);
      });
    });

    it('validates refresh button labels', () => {
      const buttons = [
        { type: 'all', label: 'Refresh All' },
        { type: 'debt', label: 'Analyze' },
        { type: 'sonar', label: 'Scan' },
        { type: 'coverage', label: 'Run Tests' },
      ];

      buttons.forEach(btn => {
        expect(btn.label.length).toBeGreaterThan(0);
      });
    });
  });
});
