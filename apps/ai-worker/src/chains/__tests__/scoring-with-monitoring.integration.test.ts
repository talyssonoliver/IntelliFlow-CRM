/**
 * Scoring Chain with Monitoring Integration Tests (IFC-117)
 *
 * Validates that the LeadScoringChain integrates correctly with
 * the AI monitoring system:
 * - Latency is recorded for chain execution
 * - Drift samples are recorded for score outputs
 * - ROI values are tracked
 * - Metrics endpoint returns data after chain execution
 * - Error monitoring captures failures
 *
 * @module scoring-with-monitoring-integration
 * @implements IFC-117
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createChainMonitor,
  withMonitoring,
  type ChainMonitorConfig,
} from '../../monitoring/chain-monitor';
import { DriftDetector, defaultDriftConfig } from '../../monitoring/drift-detector';
import {
  HallucinationChecker,
  defaultHallucinationConfig,
} from '../../monitoring/hallucination-checker';
import { ROITracker, defaultROIConfig } from '../../monitoring/roi-tracker';
import { LatencyMonitor, defaultLatencyConfig } from '../../monitoring/latency-monitor';
import { getAllMetrics, getMonitoringStatus } from '../../monitoring';

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

/**
 * Simulates a scoring chain execution
 */
async function simulateScoringChain(
  input: { email: string; source: string },
  options?: { shouldFail?: boolean; latencyMs?: number }
): Promise<{ score: number; confidence: number; reasoning: string }> {
  // Simulate processing time
  const delay = options?.latencyMs ?? 50;
  await new Promise((r) => setTimeout(r, delay));

  if (options?.shouldFail) {
    throw new Error('LLM provider unavailable');
  }

  return {
    score: 72,
    confidence: 0.85,
    reasoning: 'Strong engagement signals from website lead source.',
  };
}

describe('Scoring Chain with Monitoring Integration (IFC-117)', () => {
  let driftDetector: DriftDetector;
  let hallucinationChecker: HallucinationChecker;
  let roiTracker: ROITracker;
  let latencyMon: LatencyMonitor;
  let config: ChainMonitorConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    driftDetector = new DriftDetector(defaultDriftConfig);
    hallucinationChecker = new HallucinationChecker(defaultHallucinationConfig);
    roiTracker = new ROITracker(defaultROIConfig);
    latencyMon = new LatencyMonitor(defaultLatencyConfig);

    config = {
      driftDetector,
      hallucinationChecker,
      roiTracker,
      latencyMonitor: latencyMon,
      latencyThresholdMs: 2000,
    };
  });

  // ======================================================================
  // Latency Tracking
  // ======================================================================
  describe('latency tracking', () => {
    it('should record latency for successful chain execution', async () => {
      const monitored = await withMonitoring(
        () => simulateScoringChain({ email: 'test@example.com', source: 'website' }),
        config
      );

      expect(monitored.metrics.latencyMs).toBeGreaterThanOrEqual(0);
      expect(monitored.metrics.operationId).toBeTruthy();

      const stats = latencyMon.getStats(new Date(Date.now() - 60000));
      expect(stats.sampleCount).toBeGreaterThanOrEqual(1);
      expect(stats.successRate).toBe(1);
    });

    it('should record latency for failed chain execution', async () => {
      await expect(
        withMonitoring(
          () =>
            simulateScoringChain(
              { email: 'test@example.com', source: 'website' },
              { shouldFail: true }
            ),
          config
        )
      ).rejects.toThrow('LLM provider unavailable');

      const stats = latencyMon.getStats(new Date(Date.now() - 60000));
      expect(stats.sampleCount).toBeGreaterThanOrEqual(1);
      expect(stats.successRate).toBeLessThan(1);
    });
  });

  // ======================================================================
  // Drift Detection
  // ======================================================================
  describe('drift detection', () => {
    it('should record drift sample from score output', async () => {
      const spy = vi.spyOn(driftDetector, 'recordSample');

      await withMonitoring(
        () => simulateScoringChain({ email: 'test@example.com', source: 'website' }),
        config
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          value: expect.any(Number),
          model: 'default',
          metric: 'score_distribution',
        })
      );
    });

    it('should normalize score to 0-1 range for drift tracking', async () => {
      const spy = vi.spyOn(driftDetector, 'recordSample');

      await withMonitoring(
        () => simulateScoringChain({ email: 'test@example.com', source: 'website' }),
        config
      );

      // Score is 72, should be normalized to 0.72
      const call = spy.mock.calls[0][0];
      expect(call.value).toBeGreaterThanOrEqual(0);
      expect(call.value).toBeLessThanOrEqual(1);
    });

    it('should include drift score in monitored result metrics', async () => {
      const result = await withMonitoring(
        () => simulateScoringChain({ email: 'test@example.com', source: 'website' }),
        config
      );

      expect(result.metrics.driftScore).toBe(0.72);
    });
  });

  // ======================================================================
  // ROI Tracking
  // ======================================================================
  describe('ROI tracking', () => {
    it('should record ROI value for scored lead', async () => {
      const spy = vi.spyOn(roiTracker, 'recordValueByType');

      await withMonitoring(
        () => simulateScoringChain({ email: 'test@example.com', source: 'website' }),
        config
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          valueType: 'lead_scored',
        })
      );
    });
  });

  // ======================================================================
  // Confidence Score
  // ======================================================================
  describe('confidence tracking', () => {
    it('should extract confidence from result', async () => {
      const result = await withMonitoring(
        () => simulateScoringChain({ email: 'test@example.com', source: 'website' }),
        config
      );

      expect(result.metrics.confidenceScore).toBe(0.85);
    });
  });

  // ======================================================================
  // ChainMonitor Wrapper
  // ======================================================================
  describe('ChainMonitor wrapper', () => {
    it('should wrap scoring function with monitoring', async () => {
      const monitor = createChainMonitor(config);
      const wrappedScoring = monitor.wrap(simulateScoringChain);

      const result = await wrappedScoring({
        email: 'user@company.com',
        source: 'referral',
      });

      expect(result.result.score).toBe(72);
      expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.operationId).toBeTruthy();
    });
  });

  // ======================================================================
  // Metrics Output
  // ======================================================================
  describe('metrics output after execution', () => {
    it('should produce non-empty getAllMetrics output', () => {
      const metrics = getAllMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should produce valid monitoring status', () => {
      const status = getMonitoringStatus();
      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('issues');
      expect(status).toHaveProperty('drift');
      expect(status).toHaveProperty('hallucination');
      expect(status).toHaveProperty('roi');
      expect(status).toHaveProperty('latency');
    });
  });

  // ======================================================================
  // Multiple Operations
  // ======================================================================
  describe('multiple chain executions', () => {
    it('should accumulate metrics across multiple executions', async () => {
      for (let i = 0; i < 5; i++) {
        await withMonitoring(
          () =>
            simulateScoringChain({
              email: `user${i}@example.com`,
              source: 'website',
            }),
          config
        );
      }

      const stats = latencyMon.getStats(new Date(Date.now() - 60000));
      expect(stats.sampleCount).toBe(5);
      expect(stats.successRate).toBe(1);
    });
  });
});
