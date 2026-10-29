/**
 * Drift Detector Tests
 *
 * @implements IFC-117: AI Model Monitoring
 *
 * Tests for model drift detection using statistical tests. Deterministic: fixed values and a
 * pinned clock (the IFC-117 rewrite replaced the old Math.random cases, which asserted only
 * toBeDefined). The statistics themselves are covered in __tests__/drift-detector.shift.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DriftDetector,
  defaultDriftConfig,
  type DriftDetectorConfig,
  type DriftSample,
  type FeedbackDriftSignal,
} from './drift-detector';

// Mock pino logger (one shared instance, so tests can read what was logged)
const pinoLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock('pino', () => ({
  default: () => pinoLogger,
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

/** A spread of n values around `center`, deterministic. */
function spread(n: number, center: number, width = 0.1): number[] {
  return Array.from({ length: n }, (_, i) => center - width / 2 + (width * i) / Math.max(1, n - 1));
}

describe('DriftDetector', () => {
  let detector: DriftDetector;
  let config: DriftDetectorConfig;

  function add(values: number[], start: number, end: number, metric = 'score_distribution'): void {
    const step = (end - start) / values.length;
    values.forEach((value, i) =>
      detector.recordSample({
        value,
        timestamp: new Date(start + i * step),
        model: 'gpt-4',
        metric,
      })
    );
  }

  /** Reference: the same 6h slice on each of the previous 7 days. */
  function addReference(perDay: number, center: number, metric = 'score_distribution'): void {
    for (let day = 1; day <= 7; day++) {
      const end = NOW - day * DAY;
      add(spread(perDay, center), end - 6 * HOUR, end, metric);
    }
  }

  function addCurrent(n: number, center: number, metric = 'score_distribution'): void {
    add(spread(n, center), NOW - 6 * HOUR + 1, NOW, metric);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    config = {
      ...defaultDriftConfig,
      minSamplesRequired: 10, // Lower for testing
    };
    detector = new DriftDetector(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // Sample Recording Tests
  // ============================================

  describe('recordSample', () => {
    it('should record a sample', () => {
      const sample: DriftSample = {
        value: 0.75,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'score_distribution',
      };

      detector.recordSample(sample);

      const status = detector.getStatus();
      expect(status.trackedMetrics).toBe(1);
      expect(status.totalSamples).toBe(1);
    });

    it('should group samples by model and metric', () => {
      detector.recordSample({
        value: 0.75,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'score_distribution',
      });
      detector.recordSample({
        value: 0.8,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'confidence_level',
      });

      const status = detector.getStatus();
      expect(status.trackedMetrics).toBe(2);
      expect(status.totalSamples).toBe(2);
    });

    it('should prune samples beyond retention on the scheduled tick', () => {
      detector.recordSample({
        value: 0.75,
        timestamp: new Date(NOW - 9 * DAY),
        model: 'gpt-4',
        metric: 'score_distribution',
      });
      detector.recordSample({
        value: 0.75,
        timestamp: new Date(NOW),
        model: 'gpt-4',
        metric: 'score_distribution',
      });
      expect(detector.getStatus().totalSamples).toBe(2);

      detector.pruneOnTick(NOW);
      expect(detector.getStatus().totalSamples).toBe(1);
    });

    it('should include metadata', () => {
      detector.recordSample({
        value: 0.75,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'score_distribution',
        metadata: { source: 'test' },
      });

      const status = detector.getStatus();
      expect(status.totalSamples).toBe(1);
    });
  });

  // ============================================
  // Feedback as Drift Signal Tests (IFC-024)
  // ============================================

  describe('recordFeedbackAsSignal', () => {
    it('should record THUMBS_UP as satisfaction 1.0', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        feedbackType: 'THUMBS_UP',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      expect(detector.getStatus().totalSamples).toBe(1);
    });

    it('should record THUMBS_DOWN as satisfaction 0', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        feedbackType: 'THUMBS_DOWN',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      expect(detector.getStatus().totalSamples).toBe(1);
    });

    it('should record SCORE_CORRECTION with error magnitude', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        correctedScore: 90,
        feedbackType: 'SCORE_CORRECTION',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      // Should have both satisfaction and error samples
      expect(detector.getStatus().totalSamples).toBe(2);
    });

    it('should track user_correction_error metric', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 60,
        correctedScore: 85,
        feedbackType: 'SCORE_CORRECTION',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      expect(detector.getStatus().trackedMetrics).toBe(2); // user_satisfaction and user_correction_error
    });
  });

  // ============================================
  // Baseline Computation Tests
  // ============================================

  describe('computeBaseline', () => {
    it('should return null with insufficient reference samples', () => {
      addReference(1, 0.75); // 7 < 10 required
      expect(detector.computeBaseline('gpt-4', 'score_distribution', NOW)).toBeNull();
    });

    it('should compute the time-of-day reference window with sufficient samples', () => {
      addReference(3, 0.75); // 21 reference samples

      const baseline = detector.computeBaseline('gpt-4', 'score_distribution', NOW);

      expect(baseline).not.toBeNull();
      expect(baseline!.sampleCount).toBe(21);
      expect(baseline!.mean).toBeCloseTo(0.75, 6);
      expect(baseline!.endTime.getTime()).toBeLessThanOrEqual(NOW - DAY);
    });
  });

  // ============================================
  // Drift Detection Tests
  // ============================================

  describe('detectDrift', () => {
    it('should report insufficient data, never healthy, when there is no data', () => {
      const result = detector.detectDrift('gpt-4', 'score_distribution');

      expect(result.status).toBe('insufficient_data');
      expect(result.detected).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('should detect no drift with a stable distribution', () => {
      addReference(10, 0.75);
      addCurrent(30, 0.75);

      const result = detector.detectDrift('gpt-4', 'score_distribution', NOW);

      expect(result.status).toBe('evaluated');
      expect(result.detected).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('should detect drift with a shifted distribution', () => {
      addReference(10, 0.5);
      addCurrent(30, 0.9);

      const result = detector.detectDrift('gpt-4', 'score_distribution', NOW);

      expect(result.detected).toBe(true);
      expect(result.pValue).toBeLessThan(0.01);
      expect(result.severity).not.toBe('none');
    });

    // Loki reads a top-level `severity` field as the line's level, so a warn
    // line carrying `severity: 'critical'` would be indexed at that level and
    // trip the error-log alert (the latency monitor did, 2026-10-28).
    it('logs detected drift at warn without a top-level severity field that Loki would read as the level', () => {
      addReference(10, 0.3);
      addCurrent(30, 0.85);
      pinoLogger.warn.mockClear();

      const result = detector.detectDrift('gpt-4', 'score_distribution', NOW);

      expect(result.detected).toBe(true);
      const call = pinoLogger.warn.mock.calls.find(
        (c) => c[1] === 'Output distribution shift detected on this tick'
      );
      expect(call).toBeDefined();
      expect(call?.[0]).not.toHaveProperty('severity');
      expect(call?.[0]).toMatchObject({ driftSeverity: result.severity });
    });

    it('should include recommendations for detected drift', () => {
      addReference(10, 0.3);
      addCurrent(30, 0.85);

      const result = detector.detectDrift('gpt-4', 'score_distribution', NOW);

      expect(result.detected).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Detect All Drift Tests
  // ============================================

  describe('detectAllDrift', () => {
    it('should run drift detection for all tracked metrics', () => {
      addReference(10, 0.75, 'score_distribution');
      addReference(10, 0.8, 'confidence_level');
      addCurrent(15, 0.75, 'score_distribution');
      addCurrent(15, 0.8, 'confidence_level');

      const results = detector.detectAllDrift({ now: NOW });

      expect(results.map((r) => r.metric).sort()).toEqual([
        'confidence_level',
        'score_distribution',
      ]);
    });
  });

  // ============================================
  // Status Tests
  // ============================================

  describe('getStatus', () => {
    it('should return correct counts', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      const status = detector.getStatus();

      expect(status.trackedMetrics).toBe(1);
      expect(status.totalSamples).toBe(10);
      expect(status.driftDetected).toBe(false);
      expect(status.highSeverityCount).toBe(0);
    });

    it('should track the last scheduled check time', () => {
      expect(detector.getStatus().lastCheck).toBeNull();

      detector.detectAllDrift({ now: NOW });

      expect(detector.getStatus().lastCheck).toEqual(new Date(NOW));
    });
  });

  // ============================================
  // History Tests
  // ============================================

  describe('getHistory', () => {
    it('should return evaluated results newest first', () => {
      addReference(10, 0.75);
      addCurrent(15, 0.75);

      detector.detectDrift('gpt-4', 'score_distribution', NOW - HOUR);
      detector.detectDrift('gpt-4', 'score_distribution', NOW);

      const history = detector.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].timestamp.getTime()).toBeGreaterThan(history[1].timestamp.getTime());
    });

    it('should respect limit parameter', () => {
      addReference(10, 0.75);
      addCurrent(15, 0.75);

      for (let i = 0; i < 10; i++) {
        detector.detectDrift('gpt-4', 'score_distribution', NOW);
      }

      expect(detector.getHistory(5)).toHaveLength(5);
    });

    it('should not record insufficient-data results', () => {
      detector.detectDrift('gpt-4', 'score_distribution', NOW);
      expect(detector.getHistory()).toHaveLength(0);
    });
  });

  // ============================================
  // Set Baseline Tests
  // ============================================

  describe('setBaseline', () => {
    it('should use a manually pinned baseline window', () => {
      const window = {
        startTime: new Date(NOW - HOUR),
        endTime: new Date(NOW),
        sampleCount: 100,
        mean: 0.75,
        variance: 0.01,
        min: 0.5,
        max: 1.0,
        distribution: [0.1, 0.1, 0.2, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0],
      };

      detector.setBaseline('gpt-4', 'score_distribution', window);
      addCurrent(15, 0.75);

      const result = detector.detectDrift('gpt-4', 'score_distribution', NOW);
      expect(result.status).toBe('evaluated');
      expect(result.baselineWindow.mean).toBe(0.75);
    });
  });

  // ============================================
  // Default Config Tests
  // ============================================

  describe('defaultDriftConfig', () => {
    it('should have appropriate window size and interval', () => {
      expect(defaultDriftConfig.windowSizeHours).toBe(6);
      expect(defaultDriftConfig.slidingIntervalMinutes).toBe(30);
    });

    it('should have minimum samples requirement', () => {
      expect(defaultDriftConfig.minSamplesRequired).toBe(50);
    });

    it('should use a strict p-value threshold (48 ticks a day)', () => {
      expect(defaultDriftConfig.pValueThreshold).toBe(0.01);
    });

    it('should keep 8 days of samples for a 7-day time-of-day reference', () => {
      expect(defaultDriftConfig.referenceDays).toBe(7);
      expect(defaultDriftConfig.retentionDays).toBe(8);
      expect(defaultDriftConfig.maxSamplesPerKey).toBe(50_000);
    });
  });
});
