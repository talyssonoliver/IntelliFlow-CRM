import { describe, it, expect } from 'vitest';
import {
  buildErrorState,
  buildRefreshState,
  getCoverageColor,
  getQualityGateColor,
} from '../../components/tracking/QualityDashboard';

/**
 * QualityDashboard's helpers, imported from the component. This file used to copy them, and
 * also tested calculateTrend, formatChartPoints, getDebtSeverity and calculateHealthScore,
 * which exist nowhere in the product (trend and health score are read from data); those cases
 * are gone (#1216).
 */

describe('getQualityGateColor', () => {
  it.each(['passed', 'ok', 'PASSED', 'Ok'])('is green for %j', (gate) => {
    expect(getQualityGateColor(gate)).toBe('text-green-600');
  });

  it.each(['failed', 'error', 'FAILED'])('is red for %j', (gate) => {
    expect(getQualityGateColor(gate)).toBe('text-red-600');
  });

  it.each(['pending', 'warn', ''])('is yellow for anything else (%j)', (gate) => {
    expect(getQualityGateColor(gate)).toBe('text-yellow-600');
  });
});

describe('getCoverageColor', () => {
  it('is success from 90%, warning from 70%, error below', () => {
    expect(getCoverageColor(100)).toBe('success');
    expect(getCoverageColor(90)).toBe('success');
    expect(getCoverageColor(89.9)).toBe('warning');
    expect(getCoverageColor(70)).toBe('warning');
    expect(getCoverageColor(69.9)).toBe('error');
    expect(getCoverageColor(0)).toBe('error');
  });
});

describe('refresh and error state', () => {
  it('marks one report as refreshing without touching the others or the input', () => {
    const current = { sonar: false, coverage: true };
    const next = buildRefreshState(current, 'sonar');
    expect(next).toEqual({ sonar: true, coverage: true });
    expect(current).toEqual({ sonar: false, coverage: true });
  });

  it('records one report’s error without touching the others or the input', () => {
    const current = { sonar: null, coverage: 'old' };
    const next = buildErrorState(current, 'sonar', 'timed out');
    expect(next).toEqual({ sonar: 'timed out', coverage: 'old' });
    expect(current).toEqual({ sonar: null, coverage: 'old' });
  });
});
