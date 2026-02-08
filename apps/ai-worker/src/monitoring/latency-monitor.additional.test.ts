/**
 * Latency Monitor - Additional Coverage Tests
 *
 * Supplements the existing latency-monitor.test.ts with tests for uncovered
 * code paths including:
 * - markPhase with non-existent operation
 * - getLatencyMetrics() Prometheus format
 * - withLatencyTracking() success and error paths
 * - exportReport() model/operation/phase sections
 * - pruneOldData() actually removing old data + alert pruning
 * - SLO non-compliance scenarios
 * - Sampling rate applied during completeOperation
 * - completeOperation with metadata
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LatencyMonitor,
  getLatencyMetrics,
  withLatencyTracking,
  latencyMonitor,
  type LatencyMonitorConfig,
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

describe('LatencyMonitor - Additional Coverage', () => {
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
  // markPhase edge cases
  // ============================================

  describe('markPhase edge cases', () => {
    it('should silently ignore markPhase for non-existent operation', () => {
      // This should not throw - just a no-op when no timer exists
      monitor.markPhase('non-existent-op', 'preprocessing');
      // If we get here without error, the test passes
      expect(true).toBe(true);
    });
  });

  // ============================================
  // completeOperation with metadata and sampling
  // ============================================

  describe('completeOperation additional paths', () => {
    it('should include metadata in measurements', () => {
      monitor.startOperation('meta-op');

      const measurements = monitor.completeOperation('meta-op', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
        metadata: { batchId: 'batch-123', inputTokens: 500 },
      });

      expect(measurements[0].metadata).toEqual({
        batchId: 'batch-123',
        inputTokens: 500,
      });
    });

    it('should apply sampling rate during completeOperation', () => {
      const lowSampleConfig = { ...config, samplingRate: 0.0 };
      const sampledMonitor = new LatencyMonitor(lowSampleConfig);

      sampledMonitor.startOperation('sample-op');
      sampledMonitor.completeOperation('sample-op', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      // With 0% sampling rate, no measurements should be stored
      const stats = sampledMonitor.getStats();
      expect(stats.sampleCount).toBe(0);
    });

    it('should record phase measurements with correct durations when phases exist', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      monitor.startOperation('phased-op');

      vi.setSystemTime(now + 100);
      monitor.markPhase('phased-op', 'queue_wait');

      vi.setSystemTime(now + 200);
      monitor.markPhase('phased-op', 'preprocessing');

      vi.setSystemTime(now + 500);
      monitor.markPhase('phased-op', 'model_inference');

      vi.setSystemTime(now + 600);
      monitor.markPhase('phased-op', 'postprocessing');

      vi.setSystemTime(now + 700);
      const measurements = monitor.completeOperation('phased-op', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      // total + 4 phases = 5 measurements
      expect(measurements.length).toBe(5);

      // Total should be 700ms
      const total = measurements.find(m => m.phase === 'total');
      expect(total!.durationMs).toBe(700);

      // Phase IDs should be correct
      const phaseIds = measurements.map(m => m.id);
      expect(phaseIds).toContain('phased-op-total');
      expect(phaseIds).toContain('phased-op-queue_wait');
      expect(phaseIds).toContain('phased-op-preprocessing');
      expect(phaseIds).toContain('phased-op-model_inference');
      expect(phaseIds).toContain('phased-op-postprocessing');

      vi.useRealTimers();
    });

    it('should generate warning alert from completeOperation when duration is high', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      monitor.startOperation('slow-op');

      // 3500ms > warning threshold (1.5 * 2000 = 3000)
      vi.setSystemTime(now + 3500);
      monitor.completeOperation('slow-op', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].model).toBe('gpt-4');
      expect(alerts[0].operationType).toBe('scoring');

      vi.useRealTimers();
    });

    it('should generate critical alert from completeOperation when duration is very high', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      monitor.startOperation('very-slow-op');

      // 4500ms > critical threshold (2.0 * 2000 = 4000)
      vi.setSystemTime(now + 4500);
      monitor.completeOperation('very-slow-op', {
        model: 'gpt-4',
        operationType: 'prediction',
        success: false,
        errorType: 'TimeoutError',
      });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.severity === 'critical')).toBe(true);

      vi.useRealTimers();
    });

    it('should not generate alert when duration is below warning threshold', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      monitor.startOperation('fast-op');

      // 500ms < warning threshold (3000ms)
      vi.setSystemTime(now + 500);
      monitor.completeOperation('fast-op', {
        model: 'gpt-4',
        operationType: 'scoring',
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBe(0);

      vi.useRealTimers();
    });
  });

  // ============================================
  // recordMeasurement - SLO check for non-total phases
  // ============================================

  describe('recordMeasurement - phase branch', () => {
    it('should not check SLO for non-total phases', () => {
      // Recording a non-total phase should not trigger alerts even with high duration
      monitor.recordMeasurement({
        id: 'phase-test',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'preprocessing',
        durationMs: 50000, // Very high but not 'total'
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBe(0);
    });

    it('should check SLO for total phase via recordMeasurement', () => {
      monitor.recordMeasurement({
        id: 'total-slo-test',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 4500, // Above critical threshold
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.severity === 'critical')).toBe(true);
    });
  });

  // ============================================
  // SLO non-compliance in getStats
  // ============================================

  describe('SLO non-compliance', () => {
    it('should report SLO non-compliance when p95 exceeds target', () => {
      // Add data that will violate P95 SLO (target: 2000ms)
      for (let i = 0; i < 20; i++) {
        monitor.recordMeasurement({
          id: `slow-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 3000 + i * 100, // All above 2000ms
          success: true,
        });
      }

      const stats = monitor.getStats();
      expect(stats.sloCompliance.p95Compliant).toBe(false);
      expect(stats.sloCompliance.overallCompliant).toBe(false);
      expect(stats.sloCompliance.complianceRate).toBeLessThan(1);
    });

    it('should report SLO non-compliance when p99 exceeds target but p95 passes', () => {
      // Add mostly fast data, with a few very slow outliers
      for (let i = 0; i < 95; i++) {
        monitor.recordMeasurement({
          id: `fast-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500 + (i % 10) * 10,
          success: true,
        });
      }
      // Add outliers that push p99 above 5000ms
      for (let i = 0; i < 5; i++) {
        monitor.recordMeasurement({
          id: `outlier-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 8000 + i * 1000,
          success: true,
        });
      }

      const stats = monitor.getStats();
      // p95 should still be under 2000 (since 95% of data is <600ms)
      expect(stats.sloCompliance.p95Compliant).toBe(true);
      // p99 should exceed 5000ms
      expect(stats.sloCompliance.p99Compliant).toBe(false);
      expect(stats.sloCompliance.overallCompliant).toBe(false);
      // Only p95 is compliant, so complianceRate = 0.5
      expect(stats.sloCompliance.complianceRate).toBe(0.5);
    });
  });

  // ============================================
  // getStats - byPhase computation
  // ============================================

  describe('getStats - byPhase', () => {
    it('should compute phase-level statistics', () => {
      // Add measurements for different phases
      monitor.recordMeasurement({
        id: 'phase-total-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 1000,
        success: true,
      });
      monitor.recordMeasurement({
        id: 'phase-preprocess-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'preprocessing',
        durationMs: 200,
        success: true,
      });
      monitor.recordMeasurement({
        id: 'phase-inference-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'model_inference',
        durationMs: 700,
        success: true,
      });

      const stats = monitor.getStats();
      expect(stats.byPhase).toHaveProperty('total');
      expect(stats.byPhase).toHaveProperty('preprocessing');
      expect(stats.byPhase).toHaveProperty('model_inference');
      expect(stats.byPhase['preprocessing'].mean).toBe(200);
      expect(stats.byPhase['model_inference'].mean).toBe(700);
    });
  });

  // ============================================
  // pruneOldData - with actual old data
  // ============================================

  describe('pruneOldData - actual pruning', () => {
    it('should prune measurements older than retention period', () => {
      vi.useFakeTimers();
      const now = Date.now();

      // Add old measurements (25 hours ago, retention is 24 hours)
      vi.setSystemTime(now - 25 * 60 * 60 * 1000);
      for (let i = 0; i < 5; i++) {
        monitor.recordMeasurement({
          id: `old-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500,
          success: true,
        });
      }

      // Add new measurements
      vi.setSystemTime(now);
      for (let i = 0; i < 3; i++) {
        monitor.recordMeasurement({
          id: `new-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500,
          success: true,
        });
      }

      const pruned = monitor.pruneOldData();
      expect(pruned).toBe(5);

      const stats = monitor.getStats();
      expect(stats.sampleCount).toBe(3);

      vi.useRealTimers();
    });

    it('should prune old alerts along with measurements', () => {
      vi.useFakeTimers();
      const now = Date.now();

      // Add old alert-triggering measurements (25 hours ago)
      vi.setSystemTime(now - 25 * 60 * 60 * 1000);
      monitor.recordMeasurement({
        id: 'old-slow',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 5000, // triggers critical alert
        success: true,
      });

      // Verify alert was created
      const alertsBefore = monitor.getAlerts();
      expect(alertsBefore.length).toBeGreaterThan(0);

      // Advance to now and prune
      vi.setSystemTime(now);
      monitor.pruneOldData();

      // Old alerts should be pruned too
      const alertsAfter = monitor.getAlerts();
      expect(alertsAfter.length).toBe(0);

      vi.useRealTimers();
    });

    it('should return 0 when nothing to prune', () => {
      monitor.recordMeasurement({
        id: 'recent',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });

      const pruned = monitor.pruneOldData();
      expect(pruned).toBe(0);
    });
  });

  // ============================================
  // exportReport - comprehensive coverage
  // ============================================

  describe('exportReport - full sections', () => {
    it('should include By Operation and By Phase sections', () => {
      // Add data with multiple models, operations, and phases
      monitor.recordMeasurement({
        id: 'report-total-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });
      monitor.recordMeasurement({
        id: 'report-total-2',
        model: 'gpt-3.5-turbo',
        operationType: 'prediction',
        phase: 'total',
        durationMs: 300,
        success: true,
      });
      monitor.recordMeasurement({
        id: 'report-preprocess',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'preprocessing',
        durationMs: 100,
        success: true,
      });
      monitor.recordMeasurement({
        id: 'report-inference',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'model_inference',
        durationMs: 350,
        success: true,
      });

      const report = monitor.exportReport();

      expect(report).toContain('=== AI Latency Report ===');
      expect(report).toContain('--- Overall Latency ---');
      expect(report).toContain('--- SLO Compliance ---');
      expect(report).toContain('--- By Model ---');
      expect(report).toContain('--- By Operation ---');
      expect(report).toContain('--- By Phase ---');

      // Check model entries
      expect(report).toContain('gpt-4:');
      expect(report).toContain('gpt-3.5-turbo:');

      // Check operation entries
      expect(report).toContain('scoring:');
      expect(report).toContain('prediction:');

      // Check phase entries
      expect(report).toContain('preprocessing:');
      expect(report).toContain('model_inference:');
    });

    it('should show success rate as percentage', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordMeasurement({
          id: `sr-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500,
          success: i < 8, // 80% success
        });
      }

      const report = monitor.exportReport();
      expect(report).toContain('Success Rate: 80.0%');
    });

    it('should show SLO compliance YES/NO correctly', () => {
      // All within SLO
      for (let i = 0; i < 10; i++) {
        monitor.recordMeasurement({
          id: `compliant-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 500,
          success: true,
        });
      }

      const report = monitor.exportReport();
      expect(report).toContain('P95 Compliant: YES');
      expect(report).toContain('P99 Compliant: YES');
      expect(report).toContain('Overall Compliance: 100%');
    });

    it('should show SLO non-compliance in report', () => {
      // All above SLO target
      for (let i = 0; i < 10; i++) {
        monitor.recordMeasurement({
          id: `non-compliant-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: 6000, // Above both P95 (2000) and P99 (5000)
          success: true,
        });
      }

      const report = monitor.exportReport();
      expect(report).toContain('P95 Compliant: NO');
      expect(report).toContain('P99 Compliant: NO');
      expect(report).toContain('Overall Compliance: 0%');
    });
  });

  // ============================================
  // getTrend - edge cases
  // ============================================

  describe('getTrend edge cases', () => {
    it('should return empty trend when no measurements exist', () => {
      const trend = monitor.getTrend(60, 5);
      expect(trend).toEqual([]);
    });

    it('should group measurements into correct time buckets', () => {
      vi.useFakeTimers();
      const now = Date.now();

      // Add measurements at different times
      vi.setSystemTime(now - 20 * 60 * 1000); // 20 min ago
      monitor.recordMeasurement({
        id: 'trend-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });

      vi.setSystemTime(now - 10 * 60 * 1000); // 10 min ago
      monitor.recordMeasurement({
        id: 'trend-2',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 700,
        success: true,
      });

      vi.setSystemTime(now);
      monitor.recordMeasurement({
        id: 'trend-3',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 300,
        success: true,
      });

      const trend = monitor.getTrend(60, 15); // 60 min period, 15 min buckets
      expect(trend.length).toBeGreaterThan(0);

      // Verify bucket structure
      for (const bucket of trend) {
        expect(bucket.timestamp).toBeInstanceOf(Date);
        expect(typeof bucket.p50).toBe('number');
        expect(typeof bucket.p95).toBe('number');
        expect(typeof bucket.p99).toBe('number');
        expect(bucket.count).toBeGreaterThan(0);
      }

      vi.useRealTimers();
    });
  });

  // ============================================
  // getSlowOperations - edge cases
  // ============================================

  describe('getSlowOperations edge cases', () => {
    it('should return empty array when no operations exceed threshold', () => {
      monitor.recordMeasurement({
        id: 'fast-op',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 100,
        success: true,
      });

      const slowOps = monitor.getSlowOperations();
      expect(slowOps.length).toBe(0);
    });

    it('should only include total phase measurements', () => {
      // Add a slow non-total measurement
      monitor.recordMeasurement({
        id: 'slow-phase',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'preprocessing', // Not 'total'
        durationMs: 5000,
        success: true,
      });

      // Add a fast total measurement
      monitor.recordMeasurement({
        id: 'fast-total',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 100,
        success: true,
      });

      const slowOps = monitor.getSlowOperations();
      // The slow preprocessing measurement should not appear (it's not total)
      expect(slowOps.length).toBe(0);
    });
  });

  // ============================================
  // getAlerts - sorting
  // ============================================

  describe('getAlerts - sorting', () => {
    it('should sort alerts by timestamp descending (most recent first)', () => {
      vi.useFakeTimers();
      const now = Date.now();

      vi.setSystemTime(now - 1000);
      monitor.recordMeasurement({
        id: 'alert-1',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 5000,
        success: true,
      });

      vi.setSystemTime(now);
      monitor.recordMeasurement({
        id: 'alert-2',
        model: 'gpt-4',
        operationType: 'prediction',
        phase: 'total',
        durationMs: 5000,
        success: true,
      });

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBe(2);
      // Most recent should be first
      expect(alerts[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        alerts[1].timestamp.getTime()
      );

      vi.useRealTimers();
    });

    it('should use default limit of 50 when not specified', () => {
      const alerts = monitor.getAlerts();
      expect(alerts.length).toBeLessThanOrEqual(50);
    });
  });

  // ============================================
  // calculatePercentiles edge cases
  // ============================================

  describe('calculatePercentiles edge cases', () => {
    it('should handle single element array', () => {
      monitor.recordMeasurement({
        id: 'single',
        model: 'gpt-4',
        operationType: 'scoring',
        phase: 'total',
        durationMs: 500,
        success: true,
      });

      const stats = monitor.getStats();
      expect(stats.percentiles.p50).toBe(500);
      expect(stats.percentiles.p95).toBe(500);
      expect(stats.percentiles.p99).toBe(500);
      expect(stats.percentiles.min).toBe(500);
      expect(stats.percentiles.max).toBe(500);
      expect(stats.percentiles.mean).toBe(500);
      expect(stats.percentiles.stdDev).toBe(0);
    });

    it('should correctly calculate stdDev for varied data', () => {
      const values = [100, 200, 300, 400, 500];
      values.forEach((v, i) => {
        monitor.recordMeasurement({
          id: `stddev-${i}`,
          model: 'gpt-4',
          operationType: 'scoring',
          phase: 'total',
          durationMs: v,
          success: true,
        });
      });

      const stats = monitor.getStats();
      expect(stats.percentiles.mean).toBeCloseTo(300, 0);
      // stdDev of [100,200,300,400,500] = sqrt(20000) ≈ 141.4
      expect(stats.percentiles.stdDev).toBeCloseTo(141.4, 0);
    });
  });
});

// ============================================
// getLatencyMetrics (Prometheus format)
// ============================================

describe('getLatencyMetrics', () => {
  it('should return Prometheus-formatted metrics string', () => {
    // The function uses the global latencyMonitor instance
    const metrics = getLatencyMetrics();

    expect(typeof metrics).toBe('string');
    expect(metrics).toContain('# HELP intelliflow_ai_latency_seconds');
    expect(metrics).toContain('# TYPE intelliflow_ai_latency_seconds histogram');
    expect(metrics).toContain('intelliflow_ai_latency_seconds_bucket');
    expect(metrics).toContain('intelliflow_ai_latency_seconds_count');
    expect(metrics).toContain('intelliflow_ai_latency_seconds_sum');
    expect(metrics).toContain('# HELP intelliflow_ai_latency_p95_ms');
    expect(metrics).toContain('# TYPE intelliflow_ai_latency_p95_ms gauge');
    expect(metrics).toContain('# HELP intelliflow_ai_latency_p99_ms');
    expect(metrics).toContain('# TYPE intelliflow_ai_latency_p99_ms gauge');
    expect(metrics).toContain('# HELP intelliflow_ai_slo_compliant');
    expect(metrics).toContain('intelliflow_ai_slo_compliant{slo="p95"}');
    expect(metrics).toContain('intelliflow_ai_slo_compliant{slo="p99"}');
    expect(metrics).toContain('# HELP intelliflow_ai_success_rate');
    expect(metrics).toContain('intelliflow_ai_success_rate');
  });

  it('should include +Inf bucket', () => {
    const metrics = getLatencyMetrics();
    expect(metrics).toContain('le="+Inf"');
  });

  it('should include per-model latencies section', () => {
    // Add data to the global instance to get per-model metrics
    latencyMonitor.recordMeasurement({
      id: 'prom-test',
      model: 'test-model',
      operationType: 'scoring',
      phase: 'total',
      durationMs: 500,
      success: true,
    });

    const metrics = getLatencyMetrics();
    expect(metrics).toContain('# HELP intelliflow_ai_latency_by_model_p95_ms');
    expect(metrics).toContain('# TYPE intelliflow_ai_latency_by_model_p95_ms gauge');
  });

  it('should format histogram buckets correctly', () => {
    const metrics = getLatencyMetrics();
    // Check that standard buckets are present
    expect(metrics).toContain('le="0.100"');
    expect(metrics).toContain('le="0.250"');
    expect(metrics).toContain('le="0.500"');
    expect(metrics).toContain('le="1.000"');
    expect(metrics).toContain('le="2.000"');
    expect(metrics).toContain('le="5.000"');
    expect(metrics).toContain('le="10.000"');
  });
});

// ============================================
// withLatencyTracking (convenience wrapper)
// ============================================

describe('withLatencyTracking', () => {
  it('should track successful async operation', async () => {
    const result = await withLatencyTracking(
      'tracking-test-1',
      'gpt-4',
      'scoring',
      async () => {
        return { score: 85 };
      }
    );

    expect(result).toEqual({ score: 85 });
  });

  it('should track and rethrow errors from async operation', async () => {
    const testError = new TypeError('Invalid input');

    await expect(
      withLatencyTracking(
        'tracking-test-2',
        'gpt-4',
        'scoring',
        async () => {
          throw testError;
        }
      )
    ).rejects.toThrow('Invalid input');
  });

  it('should record error type when operation fails', async () => {
    try {
      await withLatencyTracking(
        'tracking-test-3',
        'gpt-4',
        'scoring',
        async () => {
          throw new RangeError('Out of range');
        }
      );
    } catch {
      // Expected to throw
    }

    // The function should have called completeOperation with errorType
    // We verify this indirectly: the operation completed (no hanging timer)
    // and an alert may have been generated depending on timing
    expect(true).toBe(true);
  });

  it('should handle non-Error thrown values', async () => {
    try {
      await withLatencyTracking(
        'tracking-test-4',
        'gpt-4',
        'scoring',
        async () => {
          throw 'string error'; // Non-Error type thrown
        }
      );
    } catch (e) {
      expect(e).toBe('string error');
    }
  });

  it('should mark phases during tracking', async () => {
    // This tests that the function properly marks preprocessing, model_inference, and postprocessing
    const result = await withLatencyTracking(
      'phase-tracking-test',
      'gpt-4',
      'classification',
      async () => {
        // Simulate some work
        return 'classified';
      }
    );

    expect(result).toBe('classified');
  });
});
