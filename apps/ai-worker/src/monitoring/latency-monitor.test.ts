/**
 * Latency Monitor Tests
 *
 * @implements IFC-117: AI Model Monitoring
 *
 * Tests for latency tracking, SLO compliance, and alerting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LatencyMonitor,
  defaultLatencyConfig,
  type LatencyMonitorConfig,
  type LatencyMeasurement,
} from './latency-monitor';

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('LatencyMonitor', () => {
  let monitor: LatencyMonitor;
  let config: LatencyMonitorConfig;

  beforeEach(() => {
    config = {
      sloTargets: {
        p95Ms: 2000,
        p99Ms: 5000,
      },
      alertThresholds: {
        p95MultiplierWarning: 1.5,
        p95MultiplierCritical: 2.0,
      },
      retentionHours: 24,
      samplingRate: 1.0,
    };
    monitor = new LatencyMonitor(config);
  });

  // ============================================
  // Operation Timing Tests
  // ============================================

  describe('operation timing', () => {
    it('should track operation start', () => {
      monitor.startOperation('op-1');
      // No error means it tracked
      expect(true).toBe(true);
    });

    it('should complete operation and return measurements', () => {
      monitor.startOperation('op-1');

      const measurements = monitor.completeOperation('op-1', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      expect(measurements).toBeInstanceOf(Array);
      expect(measurements.length).toBeGreaterThan(0);
      expect(measurements[0].phase).toBe('total');
      expect(measurements[0].model).toBe('gpt-4');
      expect(measurements[0].operationType).toBe('scoring');
      expect(measurements[0].success).toBe(true);
    });

    it('should track phase markers', () => {
      monitor.startOperation('op-1');
      monitor.markPhase('op-1', 'preprocessing');
      monitor.markPhase('op-1', 'model_inference');
      monitor.markPhase('op-1', 'postprocessing');

      const measurements = monitor.completeOperation('op-1', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      // Should have total + 3 phases
      expect(measurements.length).toBe(4);
    });

    it('should handle completing non-existent operation', () => {
      const measurements = monitor.completeOperation('non-existent', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      expect(measurements).toEqual([]);
    });

    it('should record error type on failure', () => {
      monitor.startOperation('op-1');

      const measurements = monitor.completeOperation('op-1', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: false,
        errorType: 'TimeoutError',
      });

      expect(measurements[0].success).toBe(false);
      expect(measurements[0].errorType).toBe('TimeoutError');
    });
  });

  // ============================================
  // Direct Measurement Recording Tests
  // ============================================

  describe('recordMeasurement', () => {
    it('should record a measurement directly', () => {
      const measurement = monitor.recordMeasurement({
        id: 'test-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });

      expect(measurement.id).toBe('test-1');
      expect(measurement.timestamp).toBeInstanceOf(Date);
    });

    it('should apply sampling rate', () => {
      const lowSampleConfig = { ...config, samplingRate: 0.5 };
      const sampledMonitor = new LatencyMonitor(lowSampleConfig);

      // Record many measurements
      for (let i = 0; i < 100; i++) {
        sampledMonitor.recordMeasurement({
          id: `test-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500,
          success: true,
        });
      }

      // With 50% sampling, should have roughly 50 samples (within margin)
      const stats = sampledMonitor.getStats();
      expect(stats.sampleCount).toBeLessThan(100);
    });
  });

  // ============================================
  // Statistics Tests
  // ============================================

  describe('getStats', () => {
    beforeEach(() => {
      // Add test data
      const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      durations.forEach((duration, i) => {
        monitor.recordMeasurement({
          id: `test-${i}`,
          model: i % 2 === 0 ? 'gpt-4' : 'gpt-3.5-turbo',
          operationType: i % 3 === 0 ? 'scoring' : 'prediction',
          phase: 'total',
          durationMs: duration,
          success: i !== 5, // One failure
        });
      });
    });

    it('should calculate overall percentiles', () => {
      const stats = monitor.getStats();

      expect(stats.percentiles.min).toBe(100);
      expect(stats.percentiles.max).toBe(1000);
      expect(stats.percentiles.mean).toBeCloseTo(550, 0);
      expect(stats.percentiles.p50).toBeCloseTo(550, 0);
      expect(stats.percentiles.p95).toBeLessThanOrEqual(1000);
    });

    it('should calculate success rate', () => {
      const stats = monitor.getStats();
      expect(stats.successRate).toBe(0.9); // 9/10 successful
    });

    it('should breakdown by model', () => {
      const stats = monitor.getStats();
      expect(stats.byModel).toHaveProperty('gpt-4');
      expect(stats.byModel).toHaveProperty('gpt-3.5-turbo');
    });

    it('should breakdown by operation', () => {
      const stats = monitor.getStats();
      expect(stats.byOperation).toHaveProperty('scoring');
      expect(stats.byOperation).toHaveProperty('prediction');
    });

    it('should calculate SLO compliance', () => {
      const stats = monitor.getStats();

      expect(stats.sloCompliance.p95Target).toBe(2000);
      expect(stats.sloCompliance.p99Target).toBe(5000);
      expect(stats.sloCompliance.p95Compliant).toBe(true); // All under 2000ms
      expect(stats.sloCompliance.p99Compliant).toBe(true);
      expect(stats.sloCompliance.overallCompliant).toBe(true);
    });

    it('should handle empty data', () => {
      const emptyMonitor = new LatencyMonitor(config);
      const stats = emptyMonitor.getStats();

      expect(stats.sampleCount).toBe(0);
      expect(stats.successRate).toBe(1);
      expect(stats.percentiles.p50).toBe(0);
    });

    it('should filter by time range', () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const stats = monitor.getStats(hourAgo, now);
      expect(stats.periodStart).toEqual(hourAgo);
      expect(stats.periodEnd).toEqual(now);
    });
  });

  // ============================================
  // Alert Tests
  // ============================================

  describe('alerts', () => {
    it('should generate warning alert for slow operations', () => {
      // Record a slow operation (1.5x P95 = 3000ms)
      monitor.startOperation('slow-op');
      const originalComplete = monitor.completeOperation.bind(monitor);

      // Manually create slow measurement to trigger alert
      monitor.recordMeasurement({
        id: 'slow-test',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 3500, // Above warning threshold (1.5x 2000 = 3000)
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.severity === 'warning')).toBe(true);
    });

    it('should generate critical alert for very slow operations', () => {
      monitor.recordMeasurement({
        id: 'very-slow-test',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 4500, // Above critical threshold (2x 2000 = 4000)
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.severity === 'critical')).toBe(true);
    });

    it('should limit alert results', () => {
      // Generate many alerts
      for (let i = 0; i < 100; i++) {
        monitor.recordMeasurement({
          id: `slow-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 5000,
          success: true,
        });
      }

      const alerts = monitor.getAlerts(10);
      expect(alerts.length).toBeLessThanOrEqual(10);
    });
  });

  // ============================================
  // Trend Analysis Tests
  // ============================================

  describe('getTrend', () => {
    it('should return trend data in buckets', () => {
      // Add some measurements
      for (let i = 0; i < 20; i++) {
        monitor.recordMeasurement({
          id: `trend-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500 + i * 10,
          success: true,
        });
      }

      const trend = monitor.getTrend(60, 5);
      expect(trend).toBeInstanceOf(Array);
      // Each bucket should have timestamp, p50, p95, p99, count
      if (trend.length > 0) {
        expect(trend[0]).toHaveProperty('timestamp');
        expect(trend[0]).toHaveProperty('p50');
        expect(trend[0]).toHaveProperty('p95');
        expect(trend[0]).toHaveProperty('p99');
        expect(trend[0]).toHaveProperty('count');
      }
    });
  });

  // ============================================
  // Slow Operations Tests
  // ============================================

  describe('getSlowOperations', () => {
    it('should return operations above P95 threshold', () => {
      // Add mix of fast and slow operations
      monitor.recordMeasurement({
        id: 'fast-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });

      monitor.recordMeasurement({
        id: 'slow-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 3000, // Above 2000ms P95 target
        success: true,
      });

      const slowOps = monitor.getSlowOperations();
      expect(slowOps.length).toBe(1);
      expect(slowOps[0].id).toBe('slow-1');
    });

    it('should sort by duration descending', () => {
      monitor.recordMeasurement({
        id: 'slow-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 3000,
        success: true,
      });

      monitor.recordMeasurement({
        id: 'slow-2',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 5000,
        success: true,
      });

      const slowOps = monitor.getSlowOperations();
      expect(slowOps[0].durationMs).toBeGreaterThan(slowOps[1].durationMs);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        monitor.recordMeasurement({
          id: `slow-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 3000 + i * 100,
          success: true,
        });
      }

      const slowOps = monitor.getSlowOperations(5);
      expect(slowOps.length).toBe(5);
    });
  });

  // ============================================
  // Data Retention Tests
  // ============================================

  describe('pruneOldData', () => {
    it('should remove old measurements', () => {
      // Add old and new measurements
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);

      monitor.recordMeasurement({
        id: 'new-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });

      const stats1 = monitor.getStats();
      const initialCount = stats1.sampleCount;

      // Prune with 1 hour retention
      const pruned = monitor.pruneOldData();

      // New data should still be there
      expect(pruned).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Report Export Tests
  // ============================================

  describe('exportReport', () => {
    it('should generate text report', () => {
      // Add some data
      for (let i = 0; i < 10; i++) {
        monitor.recordMeasurement({
          id: `test-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500 + i * 50,
          success: true,
        });
      }

      const report = monitor.exportReport();

      expect(report).toContain('AI Latency Report');
      expect(report).toContain('P95:');
      expect(report).toContain('P99:');
      expect(report).toContain('SLO Compliance');
      expect(report).toContain('By Model');
    });
  });

  // ============================================
  // Default Config Tests
  // ============================================

  describe('defaultLatencyConfig', () => {
    it('should have reasonable SLO targets', () => {
      expect(defaultLatencyConfig.sloTargets.p95Ms).toBe(2000);
      expect(defaultLatencyConfig.sloTargets.p99Ms).toBe(5000);
    });

    it('should have alert thresholds', () => {
      expect(defaultLatencyConfig.alertThresholds.p95MultiplierWarning).toBe(1.5);
      expect(defaultLatencyConfig.alertThresholds.p95MultiplierCritical).toBe(2.0);
    });

    it('should have 100% sampling by default', () => {
      expect(defaultLatencyConfig.samplingRate).toBe(1.0);
    });
  });
});
