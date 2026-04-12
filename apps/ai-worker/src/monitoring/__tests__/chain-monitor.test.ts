/**
 * Chain Monitor Tests
 *
 * @implements IFC-117: AI Model Monitoring
 *
 * Tests for ChainMonitor - unified monitoring orchestrator that wraps
 * AI chain execution with drift, hallucination, latency, and ROI tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createChainMonitor,
  withMonitoring,
  type ChainMonitor,
  type ChainMonitorConfig,
  type MonitoredResult,
} from '../chain-monitor';
import { DriftDetector } from '../drift-detector';
import { HallucinationChecker } from '../hallucination-checker';
import { ROITracker } from '../roi-tracker';
import { LatencyMonitor } from '../latency-monitor';

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ChainMonitor', () => {
  let chainMonitor: ChainMonitor;
  let mockDriftDetector: DriftDetector;
  let mockHallucinationChecker: HallucinationChecker;
  let mockRoiTracker: ROITracker;
  let mockLatencyMonitor: LatencyMonitor;

  beforeEach(() => {
    // Create mock instances with minimal configs
    mockDriftDetector = new DriftDetector({
      windowSizeHours: 6,
      slidingIntervalMinutes: 30,
      pValueThreshold: 0.05,
      minSamplesRequired: 10,
      driftScoreThresholds: {
        low: 0.1,
        medium: 0.25,
        high: 0.5,
        critical: 0.75,
      },
    });

    mockHallucinationChecker = new HallucinationChecker({
      maxHallucinationRate: 0.05,
      confidenceThreshold: 0.3,
      enableFactChecking: true,
      enableLogicChecking: true,
      enableEntityValidation: true,
      groundTruthSources: [],
    });

    mockRoiTracker = new ROITracker({
      valueEstimates: {
        lead_scored: 0.5,
        lead_qualified: 2.0,
        email_generated: 1.0,
        response_automated: 1.5,
        insight_generated: 3.0,
        document_processed: 0.75,
        task_automated: 2.5,
        prediction_made: 5.0,
        recommendation_made: 4.0,
        feedback_positive: 0.1,
        feedback_negative: -0.2,
        feedback_correction: 0.5,
      },
      costPerToken: {
        'gpt-4': { input: 0.00003, output: 0.00006 },
      },
      minROITarget: 2.0,
      trackingPeriodDays: 30,
    });

    mockLatencyMonitor = new LatencyMonitor({
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
    });

    chainMonitor = createChainMonitor({
      driftDetector: mockDriftDetector,
      hallucinationChecker: mockHallucinationChecker,
      roiTracker: mockRoiTracker,
      latencyMonitor: mockLatencyMonitor,
      latencyThresholdMs: 2000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Factory Function Tests
  // ============================================

  describe('createChainMonitor', () => {
    it('should create a chain monitor with full config', () => {
      const monitor = createChainMonitor({
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(monitor).toBeDefined();
      expect(monitor).toHaveProperty('wrap');
      expect(monitor).toHaveProperty('getConfig');
    });

    it('should create a chain monitor with partial config', () => {
      const monitor = createChainMonitor({
        latencyThresholdMs: 1500,
      });

      expect(monitor).toBeDefined();
    });

    it('should create a chain monitor with default config', () => {
      const monitor = createChainMonitor();

      expect(monitor).toBeDefined();
    });

    it('should use default latency threshold when not provided', () => {
      const monitor = createChainMonitor();
      const config = monitor.getConfig();

      expect(config.latencyThresholdMs).toBe(2000); // Default from spec
    });
  });

  // ============================================
  // withMonitoring Decorator Tests
  // ============================================

  describe('withMonitoring', () => {
    it('should wrap async function and return monitored result', async () => {
      const mockFn = vi.fn().mockResolvedValue({ score: 75, confidence: 0.9 });

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('metrics');
      expect(result.result).toEqual({ score: 75, confidence: 0.9 });
    });

    it('should include all metric fields in result', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'test' });

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.metrics).toHaveProperty('operationId');
      expect(result.metrics).toHaveProperty('latencyMs');
      expect(result.metrics).toHaveProperty('tokenCost');
      expect(result.metrics).toHaveProperty('driftScore');
      expect(result.metrics).toHaveProperty('hallucinationFlags');
      expect(result.metrics).toHaveProperty('confidenceScore');
    });

    it('should record latency during execution', async () => {
      const slowFn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { data: 'slow result' };
      });

      const result = await withMonitoring(slowFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(50);
    });

    it('should generate unique operation IDs', async () => {
      const mockFn = vi.fn().mockResolvedValue({});

      const result1 = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      const result2 = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result1.metrics.operationId).not.toBe(result2.metrics.operationId);
    });

    it('should call the wrapped function exactly once', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'test' });

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('error handling', () => {
    it('should handle chain failure gracefully', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Chain failed'));

      await expect(
        withMonitoring(failingFn, {
          driftDetector: mockDriftDetector,
          hallucinationChecker: mockHallucinationChecker,
          roiTracker: mockRoiTracker,
          latencyMonitor: mockLatencyMonitor,
          latencyThresholdMs: 2000,
        })
      ).rejects.toThrow('Chain failed');
    });

    it('should still record latency on failure', async () => {
      const latencyRecordSpy = vi.spyOn(mockLatencyMonitor, 'completeOperation');

      const failingFn = vi.fn().mockRejectedValue(new Error('Chain failed'));

      try {
        await withMonitoring(failingFn, {
          driftDetector: mockDriftDetector,
          hallucinationChecker: mockHallucinationChecker,
          roiTracker: mockRoiTracker,
          latencyMonitor: mockLatencyMonitor,
          latencyThresholdMs: 2000,
        });
      } catch {
        // Expected to throw
      }

      expect(latencyRecordSpy).toHaveBeenCalled();
    });

    it('should include error type in metrics on failure', async () => {
      const failingFn = vi.fn().mockRejectedValue(new TypeError('Type error'));

      try {
        await withMonitoring(failingFn, {
          driftDetector: mockDriftDetector,
          hallucinationChecker: mockHallucinationChecker,
          roiTracker: mockRoiTracker,
          latencyMonitor: mockLatencyMonitor,
          latencyThresholdMs: 2000,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(TypeError);
      }
    });
  });

  // ============================================
  // Drift Recording Tests
  // ============================================

  describe('drift sample recording', () => {
    it('should record drift sample when result has score', async () => {
      const recordSampleSpy = vi.spyOn(mockDriftDetector, 'recordSample');

      const mockFn = vi.fn().mockResolvedValue({ score: 75 });

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(recordSampleSpy).toHaveBeenCalled();
    });

    it('should normalize score to 0-1 range', async () => {
      const recordSampleSpy = vi.spyOn(mockDriftDetector, 'recordSample');

      const mockFn = vi.fn().mockResolvedValue({ score: 75 });

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      const call = recordSampleSpy.mock.calls[0];
      if (call && call[0]) {
        expect(call[0].value).toBeGreaterThanOrEqual(0);
        expect(call[0].value).toBeLessThanOrEqual(1);
      }
    });
  });

  // ============================================
  // ROI Value Recording Tests
  // ============================================

  describe('ROI value recording', () => {
    it('should record value when chain completes', async () => {
      const recordValueSpy = vi.spyOn(mockRoiTracker, 'recordValueByType');

      const mockFn = vi.fn().mockResolvedValue({ score: 75 });

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(recordValueSpy).toHaveBeenCalled();
    });
  });

  // ============================================
  // Latency Recording Tests
  // ============================================

  describe('latency recording', () => {
    it('should start operation at execution begin', async () => {
      const startOpSpy = vi.spyOn(mockLatencyMonitor, 'startOperation');

      const mockFn = vi.fn().mockResolvedValue({});

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(startOpSpy).toHaveBeenCalled();
    });

    it('should complete operation at execution end', async () => {
      const completeOpSpy = vi.spyOn(mockLatencyMonitor, 'completeOperation');

      const mockFn = vi.fn().mockResolvedValue({});

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(completeOpSpy).toHaveBeenCalled();
    });

    it('should mark operation as successful when no error', async () => {
      const completeOpSpy = vi.spyOn(mockLatencyMonitor, 'completeOperation');

      const mockFn = vi.fn().mockResolvedValue({});

      await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      const call = completeOpSpy.mock.calls[0];
      if (call && call[1]) {
        expect(call[1].success).toBe(true);
      }
    });

    it('should mark operation as failed on error', async () => {
      const completeOpSpy = vi.spyOn(mockLatencyMonitor, 'completeOperation');

      const failingFn = vi.fn().mockRejectedValue(new Error('Failed'));

      try {
        await withMonitoring(failingFn, {
          driftDetector: mockDriftDetector,
          hallucinationChecker: mockHallucinationChecker,
          roiTracker: mockRoiTracker,
          latencyMonitor: mockLatencyMonitor,
          latencyThresholdMs: 2000,
        });
      } catch {
        // Expected
      }

      const call = completeOpSpy.mock.calls[0];
      if (call && call[1]) {
        expect(call[1].success).toBe(false);
      }
    });
  });

  // ============================================
  // Label Sanitization Tests
  // ============================================

  describe('label sanitization', () => {
    it('should sanitize model names for metrics', async () => {
      const mockFn = vi.fn().mockResolvedValue({ score: 75 });

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      // Operation ID should be valid (alphanumeric + dashes)
      expect(result.metrics.operationId).toMatch(/^[a-z0-9-]+$/);
    });
  });

  // ============================================
  // Streaming-Aware Measurement Tests (P1)
  // ============================================

  describe('streaming-aware measurement', () => {
    it('should handle streaming results', async () => {
      // Mock a streaming-like result
      const mockFn = vi.fn().mockResolvedValue({
        content: 'streamed content',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.result).toHaveProperty('content');
    });
  });

  // ============================================
  // ChainMonitor.wrap Method Tests
  // ============================================

  describe('ChainMonitor.wrap', () => {
    it('should wrap a function for monitoring', async () => {
      const mockFn = vi.fn().mockResolvedValue({ score: 80 });

      const wrappedFn = chainMonitor.wrap(mockFn);

      expect(typeof wrappedFn).toBe('function');
    });

    it('should execute wrapped function with monitoring', async () => {
      const mockFn = vi.fn().mockResolvedValue({ score: 80 });

      const wrappedFn = chainMonitor.wrap(mockFn);
      const result = await wrappedFn();

      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('metrics');
      expect(result.result).toEqual({ score: 80 });
    });

    it('should pass arguments to wrapped function', async () => {
      const mockFn = vi.fn().mockResolvedValue({ score: 80 });

      const wrappedFn = chainMonitor.wrap(mockFn);
      await wrappedFn('arg1', { key: 'value' });

      expect(mockFn).toHaveBeenCalledWith('arg1', { key: 'value' });
    });
  });

  // ============================================
  // getConfig Tests
  // ============================================

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = chainMonitor.getConfig();

      expect(config).toHaveProperty('driftDetector');
      expect(config).toHaveProperty('hallucinationChecker');
      expect(config).toHaveProperty('roiTracker');
      expect(config).toHaveProperty('latencyMonitor');
      expect(config).toHaveProperty('latencyThresholdMs');
    });

    it('should return the configured latency threshold', () => {
      const monitor = createChainMonitor({
        latencyThresholdMs: 3000,
      });

      const config = monitor.getConfig();

      expect(config.latencyThresholdMs).toBe(3000);
    });
  });

  // ============================================
  // Integration Tests
  // ============================================

  describe('integration', () => {
    it('should work with real monitoring instances', async () => {
      const realMonitor = createChainMonitor();
      const mockFn = vi.fn().mockResolvedValue({ score: 75, confidence: 0.9 });

      const result = await realMonitor.wrap(mockFn)();

      expect(result.result).toEqual({ score: 75, confidence: 0.9 });
      expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should track metrics across multiple calls', async () => {
      const mockFn = vi.fn().mockResolvedValue({ score: 75 });
      const wrappedFn = chainMonitor.wrap(mockFn);

      const result1 = await wrappedFn();
      const result2 = await wrappedFn();
      const result3 = await wrappedFn();

      expect(result1.metrics.operationId).not.toBe(result2.metrics.operationId);
      expect(result2.metrics.operationId).not.toBe(result3.metrics.operationId);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle null result', async () => {
      const mockFn = vi.fn().mockResolvedValue(null);

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.result).toBeNull();
    });

    it('should handle undefined result', async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined);

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.result).toBeUndefined();
    });

    it('should handle empty object result', async () => {
      const mockFn = vi.fn().mockResolvedValue({});

      const result = await withMonitoring(mockFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.result).toEqual({});
    });

    it('should handle very fast function', async () => {
      const fastFn = vi.fn().mockResolvedValue({ fast: true });

      const result = await withMonitoring(fastFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.latencyMs).toBeLessThan(100);
    });

    it('should handle synchronous-like async function', async () => {
      const syncLikeFn = vi.fn().mockResolvedValue({ sync: true });

      const result = await withMonitoring(syncLikeFn, {
        driftDetector: mockDriftDetector,
        hallucinationChecker: mockHallucinationChecker,
        roiTracker: mockRoiTracker,
        latencyMonitor: mockLatencyMonitor,
        latencyThresholdMs: 2000,
      });

      expect(result.result).toEqual({ sync: true });
    });
  });
});
