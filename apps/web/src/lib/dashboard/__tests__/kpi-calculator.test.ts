import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  computeDeltaPercent,
  isTrendingUp,
  computeTicketUrgent,
  computePipelineStagePercent,
  chartMax,
  computeBarHeightPercent,
  formatGBP,
} from '../kpi-calculator';

/**
 * Dashboard KPI Calculator unit tests (PG-058).
 *
 * Pure functions — no React, no tRPC, no DOM. Every branch is reachable by a
 * unit test, which is what makes the diff-coverage gate satisfiable here.
 */

describe('kpi-calculator', () => {
  describe('DASHBOARD_REFETCH_INTERVAL_MS', () => {
    it('is 60 seconds (matches global staleTime / server cache life)', () => {
      expect(DASHBOARD_REFETCH_INTERVAL_MS).toBe(60_000);
    });
  });

  describe('computeDeltaPercent', () => {
    it('computes positive period-over-period change (unrounded)', () => {
      // previous = 1240 - 100 = 1140
      expect(computeDeltaPercent(100, 1140)).toBeCloseTo((100 / 1140) * 100, 10);
    });

    it('returns 0 when previous is 0 (growth from zero, not Infinity)', () => {
      expect(computeDeltaPercent(100, 0)).toBe(0);
    });

    it('returns 0 when previous is negative', () => {
      expect(computeDeltaPercent(50, -10)).toBe(0);
    });

    it('returns 0 for a zero delta', () => {
      expect(computeDeltaPercent(0, 1000)).toBe(0);
    });

    it('handles negative delta (decline)', () => {
      expect(computeDeltaPercent(-50, 1000)).toBeCloseTo(-5, 10);
    });

    it('does not throw for a tiny previous value', () => {
      expect(() => computeDeltaPercent(1, 0.01)).not.toThrow();
      expect(computeDeltaPercent(1, 0.01)).toBeCloseTo(10000, 6);
    });

    it('returns 0 for non-finite inputs', () => {
      expect(computeDeltaPercent(Number.NaN, 100)).toBe(0);
      expect(computeDeltaPercent(100, Number.NaN)).toBe(0);
      expect(computeDeltaPercent(100, Number.POSITIVE_INFINITY)).toBeCloseTo(0, 10);
    });
  });

  describe('isTrendingUp', () => {
    it('is true for a positive delta', () => {
      expect(isTrendingUp(12)).toBe(true);
    });

    it('is true for a zero delta (zero == on track)', () => {
      expect(isTrendingUp(0)).toBe(true);
    });

    it('is false for a negative delta', () => {
      expect(isTrendingUp(-3)).toBe(false);
    });

    it('is false for a non-finite delta', () => {
      expect(isTrendingUp(Number.NaN)).toBe(false);
    });
  });

  describe('computeTicketUrgent', () => {
    it('returns 0 for undefined input', () => {
      expect(computeTicketUrgent(undefined)).toBe(0);
    });

    it('returns 0 for an empty object', () => {
      expect(computeTicketUrgent({})).toBe(0);
    });

    it('counts AT_RISK only', () => {
      expect(computeTicketUrgent({ AT_RISK: 3 })).toBe(3);
    });

    it('counts BREACHED only', () => {
      expect(computeTicketUrgent({ BREACHED: 2 })).toBe(2);
    });

    it('sums AT_RISK + BREACHED', () => {
      expect(computeTicketUrgent({ AT_RISK: 3, BREACHED: 2 })).toBe(5);
    });

    it('treats null fields as 0', () => {
      expect(computeTicketUrgent({ AT_RISK: null, BREACHED: null })).toBe(0);
    });

    it('returns 0 when both are 0', () => {
      expect(computeTicketUrgent({ AT_RISK: 0, BREACHED: 0 })).toBe(0);
    });
  });

  describe('computePipelineStagePercent', () => {
    it('computes a rounded percentage from numbers', () => {
      expect(computePipelineStagePercent(10000, 50000)).toBe(20);
    });

    it('accepts Prisma Decimal string inputs', () => {
      expect(computePipelineStagePercent('10000', '50000')).toBe(20);
    });

    it('returns 0 when total is 0 (number)', () => {
      expect(computePipelineStagePercent(5000, 0)).toBe(0);
    });

    it('returns 0 when total is "0" (string)', () => {
      expect(computePipelineStagePercent('5000', '0')).toBe(0);
    });

    it('returns 0 when both are 0', () => {
      expect(computePipelineStagePercent(0, 0)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      expect(computePipelineStagePercent(1, 3)).toBe(33);
    });

    it('returns 100 at full value', () => {
      expect(computePipelineStagePercent(50000, 50000)).toBe(100);
    });

    it('can exceed 100 for an anomalous stage value', () => {
      expect(computePipelineStagePercent(60000, 50000)).toBe(120);
    });

    it('returns 0 for undefined stage value', () => {
      expect(computePipelineStagePercent(undefined as unknown as number, 50000)).toBe(0);
    });

    it('returns 0 for an unparseable (empty) total string', () => {
      expect(computePipelineStagePercent('5000', '')).toBe(0);
    });
  });

  describe('chartMax', () => {
    it('returns the max of the series', () => {
      expect(chartMax([3, 9, 5])).toBe(9);
    });

    it('returns 1 for an empty array', () => {
      expect(chartMax([])).toBe(1);
    });

    it('returns 1 when all values are 0', () => {
      expect(chartMax([0, 0, 0])).toBe(1);
    });

    it('returns 1 when the max is below 1', () => {
      expect(chartMax([0.2, 0.5])).toBe(1);
    });

    it('handles a single value', () => {
      expect(chartMax([42])).toBe(42);
    });

    it('coerces non-finite entries to 0', () => {
      expect(chartMax([Number.NaN, 7])).toBe(7);
    });
  });

  describe('computeBarHeightPercent', () => {
    it('computes a proportional height', () => {
      expect(computeBarHeightPercent(15000, 20000)).toBe(75);
    });

    it('applies the default minimum floor (2) to tiny positive values', () => {
      expect(computeBarHeightPercent(1, 10000)).toBe(2);
    });

    it('renders no bar (0) for a zero value', () => {
      expect(computeBarHeightPercent(0, 20000)).toBe(0);
    });

    it('renders no bar (0) for a negative value', () => {
      expect(computeBarHeightPercent(-5, 20000)).toBe(0);
    });

    it('returns the floor when max is 0 but the value is positive', () => {
      expect(computeBarHeightPercent(5000, 0)).toBe(2);
    });

    it('returns 0 when both are 0', () => {
      expect(computeBarHeightPercent(0, 0)).toBe(0);
    });

    it('returns 100 at full height', () => {
      expect(computeBarHeightPercent(20000, 20000)).toBe(100);
    });

    it('returns 0 for a zero value regardless of minPercent', () => {
      expect(computeBarHeightPercent(0, 6)).toBe(0);
      expect(computeBarHeightPercent(0, 6, 0)).toBe(0);
    });
  });

  describe('formatGBP', () => {
    it('formats a whole amount with no decimals', () => {
      expect(formatGBP(124500)).toBe('£124,500');
    });

    it('formats zero', () => {
      expect(formatGBP(0)).toBe('£0');
    });

    it('formats a negative amount', () => {
      expect(formatGBP(-5000)).toBe('-£5,000');
    });

    it('rounds a fractional amount to 0 dp by default', () => {
      expect(formatGBP(Number('45200.75'))).toBe('£45,201');
      expect(formatGBP(Number('45200.49'))).toBe('£45,200');
    });

    it('formats a large amount with separators', () => {
      expect(formatGBP(1_000_000)).toBe('£1,000,000');
    });

    it('honours an explicit fractionDigits', () => {
      expect(formatGBP(45200.5, 2)).toBe('£45,200.50');
    });

    it('coerces a non-finite amount to £0', () => {
      expect(formatGBP(Number.NaN)).toBe('£0');
    });
  });
});
