/**
 * Drift Detector - Additional Coverage Tests
 *
 * Supplements drift-detector.test.ts with edge cases: pinned baselines, insufficient current
 * windows, metric-specific and per-severity recommendations, status and history.
 *
 * IFC-117: rewritten deterministic. The previous version used Math.random and wrapped its
 * assertions in `if (result.detected)` / `if (result.severity === ...)`, so most cases could
 * never fail; the Prometheus text-builder cases left with getDriftMetrics() (the exporter it fed
 * was deleted — metrics now go out through otel-ai-metrics.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DriftDetector,
  defaultDriftConfig,
  type DriftDetectorConfig,
  type DriftWindow,
  type FeedbackDriftSignal,
} from './drift-detector';

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

function pinned(overrides: Partial<DriftWindow>): DriftWindow {
  return {
    startTime: new Date(NOW - 48 * HOUR),
    endTime: new Date(NOW - 24 * HOUR),
    sampleCount: 100,
    mean: 0.5,
    variance: 0.01,
    min: 0,
    max: 1,
    distribution: [0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0],
    ...overrides,
  };
}

describe('DriftDetector - Additional Coverage', () => {
  let detector: DriftDetector;
  let config: DriftDetectorConfig;

  function current(metric: string, values: number[], model = 'gpt-4'): void {
    values.forEach((value, i) =>
      detector.recordSample({ value, timestamp: new Date(NOW - i * 60_000), model, metric })
    );
  }

  /** n evenly spaced values in [lo, hi]. */
  function range(n: number, lo: number, hi: number): number[] {
    return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / Math.max(1, n - 1));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    config = { ...defaultDriftConfig, minSamplesRequired: 10 };
    detector = new DriftDetector(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // recordFeedbackAsSignal - edge cases
  // ============================================

  describe('recordFeedbackAsSignal edge cases', () => {
    it('should record SCORE_CORRECTION without correctedScore (undefined)', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        feedbackType: 'SCORE_CORRECTION',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      const status = detector.getStatus();
      // Only user_satisfaction: no user_correction_error without a correctedScore
      expect(status.totalSamples).toBe(1);
      expect(status.trackedMetrics).toBe(1);
    });

    it('should record SCORE_CORRECTION with correctedScore of 0', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        correctedScore: 0,
        feedbackType: 'SCORE_CORRECTION',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      const status = detector.getStatus();
      expect(status.totalSamples).toBe(2);
      expect(status.trackedMetrics).toBe(2);
    });

    it('keeps a model version containing ":" as one series', () => {
      detector.recordFeedbackAsSignal({
        originalScore: 50,
        feedbackType: 'THUMBS_UP',
        modelVersion: 'mock:scoring-free:v1',
      });
      detector.recordFeedbackAsSignal({
        originalScore: 50,
        feedbackType: 'THUMBS_DOWN',
        modelVersion: 'mock:scoring-free:v1',
      });
      expect(detector.getStatus().trackedMetrics).toBe(1);
    });
  });

  // ============================================
  // computeBaseline - edge cases
  // ============================================

  describe('computeBaseline - edge cases', () => {
    it('should return null when no samples exist at all', () => {
      expect(detector.computeBaseline('gpt-4', 'nonexistent')).toBeNull();
    });

    it('ignores samples outside the time-of-day reference slices', () => {
      // 20 samples in the last hour: none of them are in yesterday's (or older) slice.
      current('score_distribution', range(20, 0.4, 0.6));
      expect(detector.computeBaseline('gpt-4', 'score_distribution')).toBeNull();
    });
  });

  // ============================================
  // detectDrift - edge cases
  // ============================================

  describe('detectDrift - edge cases', () => {
    it('should return the insufficient-data default result', () => {
      current('score_distribution', range(5, 0.4, 0.6));

      const result = detector.detectDrift('gpt-4', 'score_distribution');
      expect(result.status).toBe('insufficient_data');
      expect(result.detected).toBe(false);
      expect(result.severity).toBe('none');
      expect(result.pValue).toBe(1);
      expect(result.driftScore).toBe(0);
    });

    it('should report insufficient data when the current window is too small', () => {
      detector.setBaseline('gpt-4', 'score_distribution', pinned({ mean: 0.75 }));
      // 20 samples outside the 6h window, only 2 inside (< minSamplesRequired / 2 = 5)
      for (let i = 0; i < 20; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(NOW - 12 * HOUR),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }
      current('score_distribution', [0.75, 0.75]);

      const result = detector.detectDrift('gpt-4', 'score_distribution');
      expect(result.status).toBe('insufficient_data');
      expect(result.detected).toBe(false);
      expect(result.baselineWindow.mean).toBe(0.75);
    });

    it('should report insufficient data for a pinned baseline with too few samples', () => {
      detector.setBaseline('gpt-4', 'score_distribution', pinned({ sampleCount: 5 }));
      current('score_distribution', range(20, 0.4, 0.6));
      expect(detector.detectDrift('gpt-4', 'score_distribution').status).toBe('insufficient_data');
    });

    it('should use the pinned baseline when available', () => {
      detector.setBaseline(
        'gpt-4',
        'score_distribution',
        pinned({ mean: 0.5, min: 0.3, max: 0.7 })
      );
      current('score_distribution', range(20, 0.9, 1.0));

      const result = detector.detectDrift('gpt-4', 'score_distribution');
      expect(result.baselineWindow.mean).toBe(0.5);
      expect(result.currentWindow.mean).toBeGreaterThan(0.85);
      expect(result.detected).toBe(true);
      expect(result.driftScore).toBeGreaterThan(0);
    });

    it('should add evaluated results to drift history', () => {
      detector.setBaseline(
        'gpt-4',
        'latency',
        pinned({
          mean: 100,
          min: 80,
          max: 120,
          distribution: [0, 0, 0, 0.1, 0.3, 0.3, 0.2, 0.1, 0, 0],
        })
      );
      current('latency', range(20, 500, 600));

      detector.detectDrift('gpt-4', 'latency');

      expect(detector.getHistory()).toHaveLength(1);
    });
  });

  // ============================================
  // generateRecommendations - metric-specific
  // ============================================

  describe('generateRecommendations', () => {
    it('adds the infrastructure recommendation for latency drift', () => {
      detector.setBaseline(
        'gpt-4',
        'latency',
        pinned({
          mean: 100,
          min: 80,
          max: 120,
          distribution: [0, 0, 0, 0.1, 0.3, 0.3, 0.2, 0.1, 0, 0],
        })
      );
      current('latency', range(20, 800, 990));

      const result = detector.detectDrift('gpt-4', 'latency');

      expect(result.detected).toBe(true);
      expect(result.recommendations.some((r) => r.includes('infrastructure metrics'))).toBe(true);
    });

    it('adds the error-log and provider-status recommendations for error_rate drift', () => {
      detector.setBaseline(
        'gpt-4',
        'error_rate',
        pinned({
          mean: 0.01,
          min: 0,
          max: 0.05,
          distribution: [0.9, 0.05, 0.03, 0.01, 0.01, 0, 0, 0, 0, 0],
        })
      );
      current('error_rate', range(20, 0.5, 0.8));

      const result = detector.detectDrift('gpt-4', 'error_rate');

      expect(result.detected).toBe(true);
      expect(result.recommendations.some((r) => r.includes('error logs'))).toBe(true);
      expect(result.recommendations.some((r) => r.includes('API provider status'))).toBe(true);
    });

    it('gives critical recommendations for a complete shift', () => {
      detector.setBaseline(
        'gpt-4',
        'score_distribution',
        pinned({ distribution: [0, 0.9, 0.1, 0, 0, 0, 0, 0, 0, 0] })
      );
      current('score_distribution', range(20, 0.95, 1.0));

      const result = detector.detectDrift('gpt-4', 'score_distribution');

      expect(result.severity).toBe('critical');
      expect(result.recommendations).toContain('URGENT: Immediately investigate model performance');
      expect(result.recommendations).toContain('Consider rolling back to previous model version');
      expect(result.recommendations).toContain('Alert on-call team');
    });

    it('gives no recommendations when nothing is detected', () => {
      detector.setBaseline(
        'gpt-4',
        'score_distribution',
        pinned({ distribution: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] })
      );
      current('score_distribution', range(20, 0.0, 0.95));

      const result = detector.detectDrift('gpt-4', 'score_distribution');

      expect(result.detected).toBe(false);
      expect(result.severity).toBe('none');
      expect(result.recommendations).toEqual([]);
    });
  });

  // ============================================
  // detectAllDrift
  // ============================================

  describe('detectAllDrift - with mixed metrics', () => {
    it('should return results for all tracked model and metric combinations', () => {
      current('score_distribution', range(20, 0.4, 0.6));
      current('latency', range(20, 90, 110));
      current('confidence_level', range(20, 0.7, 0.9), 'gpt-3.5-turbo');

      const results = detector.detectAllDrift();
      expect(results).toHaveLength(3);
      expect(new Set(results.map((r) => `${r.model}/${r.metric}`)).size).toBe(3);
    });

    it('should return empty array when no samples tracked', () => {
      expect(detector.detectAllDrift()).toEqual([]);
    });
  });

  // ============================================
  // getStatus - edge cases
  // ============================================

  describe('getStatus edge cases', () => {
    it('should return null lastCheck when no drift detection has run', () => {
      expect(detector.getStatus().lastCheck).toBeNull();
    });

    it('should report drift detected after a detection that found drift', () => {
      detector.setBaseline(
        'gpt-4',
        'score_distribution',
        pinned({ distribution: [0, 0.9, 0.1, 0, 0, 0, 0, 0, 0, 0] })
      );
      current('score_distribution', range(20, 0.9, 1.0));

      detector.detectDrift('gpt-4', 'score_distribution');
      const status = detector.getStatus();

      expect(status.lastCheck).toBeInstanceOf(Date);
      expect(status.driftDetected).toBe(true);
    });

    it('should count high and critical detections in the last 24h', () => {
      for (const metric of ['score_distribution', 'confidence_level']) {
        detector.setBaseline(
          'gpt-4',
          metric,
          pinned({ distribution: [0, 0.9, 0.1, 0, 0, 0, 0, 0, 0, 0] })
        );
        current(metric, range(20, 0.9, 1.0));
        detector.detectDrift('gpt-4', metric);
      }

      expect(detector.getStatus().highSeverityCount).toBe(2);
    });
  });

  // ============================================
  // computeWindow - edge cases
  // ============================================

  describe('computeWindow - edge cases via detectDrift', () => {
    it('should handle uniform values where max equals min', () => {
      detector.setBaseline('gpt-4', 'score_distribution', pinned({}));
      current('score_distribution', new Array(20).fill(0.5));

      const result = detector.detectDrift('gpt-4', 'score_distribution');
      expect(result.currentWindow.mean).toBeCloseTo(0.5, 6);
      expect(result.currentWindow.variance).toBeCloseTo(0, 6);
      expect(result.currentWindow.min).toBe(0.5);
      expect(result.currentWindow.max).toBe(0.5);
    });

    it('should bin the current window on the shared ten edges', () => {
      detector.setBaseline('gpt-4', 'score_distribution', pinned({}));
      current('score_distribution', range(20, 0, 0.95));

      const result = detector.detectDrift('gpt-4', 'score_distribution');
      expect(result.currentWindow.distribution).toHaveLength(10);
      const sum = result.currentWindow.distribution.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    });
  });
});
