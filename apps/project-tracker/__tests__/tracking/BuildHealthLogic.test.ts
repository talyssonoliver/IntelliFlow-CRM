import { describe, it, expect, vi } from 'vitest';

// Mock UI dependencies so pure-function imports resolve without Next.js aliases
vi.mock('@/lib/icons', () => ({ Icon: () => null }));
vi.mock('../../components/tracking/shared', () => ({
  RefreshButton: () => null,
  MetricCard: () => null,
  StaleIndicator: () => null,
}));

import {
  computeAllPassing,
  computeCacheHitRate,
  computeTestPassRate,
  type BuildMetrics,
} from '../../components/tracking/BuildHealth';

/**
 * Pure-function logic tests for BuildHealth.
 * Imports extracted functions directly from BuildHealth.tsx.
 * No RTL or component imports needed.
 */

function makeBuildMetrics(overrides?: Partial<BuildMetrics>): BuildMetrics {
  return {
    turbo: {
      success: true,
      tasks_run: 10,
      tasks_cached: 5,
      duration_ms: 5000,
      errors: [],
      lastRun: '2026-01-01T00:00:00Z',
    },
    tests: {
      passed: 10,
      failed: 0,
      skipped: 0,
      total: 10,
      coverage: 90,
      lastRun: '2026-01-01T00:00:00Z',
    },
    typecheck: {
      success: true,
      errors: 0,
      warnings: 0,
      lastRun: '2026-01-01T00:00:00Z',
    },
    lint: {
      success: true,
      errors: 0,
      warnings: 0,
      lastRun: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

// --- Helper functions for threshold classification (mirrors BuildHealth render logic) ---

function getCoverageVariant(coverage: number): 'success' | 'warning' | 'error' {
  return coverage >= 90 ? 'success' : coverage >= 70 ? 'warning' : 'error';
}

function getCacheVariant(cacheHitRate: number): 'success' | 'warning' {
  return cacheHitRate > 50 ? 'success' : 'warning';
}

describe('BuildHealthLogic', () => {
  describe('computeAllPassing', () => {
    it('returns true for null data (all defaults are truthy)', () => {
      expect(computeAllPassing(null)).toBe(true);
    });

    it('returns true when all sections passing and 0 failed tests', () => {
      const data = makeBuildMetrics();
      expect(computeAllPassing(data)).toBe(true);
    });

    it('returns false when turbo.success is false', () => {
      const data = makeBuildMetrics({
        turbo: {
          success: false,
          tasks_run: 10,
          tasks_cached: 5,
          duration_ms: 5000,
          errors: ['err'],
          lastRun: null,
        },
      });
      expect(computeAllPassing(data)).toBe(false);
    });

    it('returns false when typecheck.success is false', () => {
      const data = makeBuildMetrics({
        typecheck: { success: false, errors: 3, warnings: 0, lastRun: null },
      });
      expect(computeAllPassing(data)).toBe(false);
    });

    it('returns false when lint.success is false', () => {
      const data = makeBuildMetrics({
        lint: { success: false, errors: 2, warnings: 1, lastRun: null },
      });
      expect(computeAllPassing(data)).toBe(false);
    });

    it('returns false when tests.failed is 1', () => {
      const data = makeBuildMetrics({
        tests: { passed: 9, failed: 1, skipped: 0, total: 10, coverage: 90, lastRun: null },
      });
      expect(computeAllPassing(data)).toBe(false);
    });

    it('returns false for mixed failures (turbo fail + lint pass + tests ok)', () => {
      const data = makeBuildMetrics({
        turbo: {
          success: false,
          tasks_run: 10,
          tasks_cached: 0,
          duration_ms: 1000,
          errors: [],
          lastRun: null,
        },
      });
      expect(computeAllPassing(data)).toBe(false);
    });
  });

  describe('computeCacheHitRate', () => {
    it('returns 0 when tasksRun is 0 (divide-by-zero guard)', () => {
      expect(computeCacheHitRate(0, 0)).toBe(0);
    });

    it('returns 0 when tasksCached is 0 with tasksRun=10 (0% cache)', () => {
      expect(computeCacheHitRate(10, 0)).toBe(0);
    });

    it('returns 50 for tasksCached=5, tasksRun=10', () => {
      expect(computeCacheHitRate(10, 5)).toBe(50);
    });

    it('returns 100 for tasksCached=10, tasksRun=10 (full cache)', () => {
      expect(computeCacheHitRate(10, 10)).toBe(100);
    });

    it('returns 33 for tasksCached=1, tasksRun=3 (rounding)', () => {
      expect(computeCacheHitRate(3, 1)).toBe(33);
    });
  });

  describe('computeTestPassRate', () => {
    it('returns 100 when total is 0 (no tests = 100%)', () => {
      expect(computeTestPassRate(0, 0)).toBe(100);
    });

    it('returns 100 for passed=10, total=10', () => {
      expect(computeTestPassRate(10, 10)).toBe(100);
    });

    it('returns 0 for passed=0, total=10', () => {
      expect(computeTestPassRate(0, 10)).toBe(0);
    });

    it('returns 50 for passed=5, total=10', () => {
      expect(computeTestPassRate(5, 10)).toBe(50);
    });

    it('returns 67 for passed=2, total=3 (rounding)', () => {
      expect(computeTestPassRate(2, 3)).toBe(67);
    });
  });

  describe('Coverage threshold classification', () => {
    it('coverage >= 90 → variant success', () => {
      expect(getCoverageVariant(90)).toBe('success');
    });

    it('coverage = 89 → variant warning', () => {
      expect(getCoverageVariant(89)).toBe('warning');
    });

    it('coverage >= 70 → variant warning', () => {
      expect(getCoverageVariant(70)).toBe('warning');
    });

    it('coverage = 69 → variant error', () => {
      expect(getCoverageVariant(69)).toBe('error');
    });

    it('coverage = 0 → variant error', () => {
      expect(getCoverageVariant(0)).toBe('error');
    });

    it('coverage = 100 → variant success', () => {
      expect(getCoverageVariant(100)).toBe('success');
    });
  });

  describe('Cache variant classification', () => {
    it('cacheHitRate > 50 → variant success', () => {
      expect(getCacheVariant(51)).toBe('success');
    });

    it('cacheHitRate = 50 → variant warning', () => {
      expect(getCacheVariant(50)).toBe('warning');
    });

    it('cacheHitRate = 51 → variant success', () => {
      expect(getCacheVariant(51)).toBe('success');
    });

    it('cacheHitRate = 0 → variant warning', () => {
      expect(getCacheVariant(0)).toBe('warning');
    });

    it('cacheHitRate = 100 → variant success', () => {
      expect(getCacheVariant(100)).toBe('success');
    });

    it('cacheHitRate = 49 → variant warning', () => {
      expect(getCacheVariant(49)).toBe('warning');
    });
  });
});
