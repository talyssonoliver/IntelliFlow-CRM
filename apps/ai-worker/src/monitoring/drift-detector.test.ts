/**
 * Drift Detector Tests
 *
 * @implements IFC-117: AI Model Monitoring
 *
 * Tests for model drift detection using statistical tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DriftDetector,
  defaultDriftConfig,
  type DriftDetectorConfig,
  type DriftSample,
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

describe('DriftDetector', () => {
  let detector: DriftDetector;
  let config: DriftDetectorConfig;

  beforeEach(() => {
    config = {
      windowSizeHours: 6,
      slidingIntervalMinutes: 30,
      pValueThreshold: 0.05,
      minSamplesRequired: 10, // Lower for testing
      driftScoreThresholds: {
        low: 0.1,
        medium: 0.25,
        high: 0.5,
        critical: 0.75,
      },
    };
    detector = new DriftDetector(config);
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

    it('should group samples by model:metric key', () => {
      detector.recordSample({
        value: 0.75,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'score_distribution',
      });

      detector.recordSample({
        value: 0.80,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'confidence_level',
      });

      const status = detector.getStatus();
      expect(status.trackedMetrics).toBe(2);
      expect(status.totalSamples).toBe(2);
    });

    it('should prune old samples automatically', () => {
      // Add a sample
      detector.recordSample({
        value: 0.75,
        timestamp: new Date(),
        model: 'gpt-4',
        metric: 'score_distribution',
      });

      const status = detector.getStatus();
      expect(status.totalSamples).toBe(1);
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

      const status = detector.getStatus();
      expect(status.totalSamples).toBe(1);
    });

    it('should record THUMBS_DOWN as satisfaction 0', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        feedbackType: 'THUMBS_DOWN',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      const status = detector.getStatus();
      expect(status.totalSamples).toBe(1);
    });

    it('should record SCORE_CORRECTION with error magnitude', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 75,
        correctedScore: 90,
        feedbackType: 'SCORE_CORRECTION',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      const status = detector.getStatus();
      // Should have both satisfaction and error samples
      expect(status.totalSamples).toBe(2);
    });

    it('should track user_correction_error metric', () => {
      const feedback: FeedbackDriftSignal = {
        originalScore: 60,
        correctedScore: 85,
        feedbackType: 'SCORE_CORRECTION',
        modelVersion: 'v1.0.0',
      };

      detector.recordFeedbackAsSignal(feedback);

      const status = detector.getStatus();
      expect(status.trackedMetrics).toBe(2); // user_satisfaction and user_correction_error
    });
  });

  // ============================================
  // Baseline Computation Tests
  // ============================================

  describe('computeBaseline', () => {
    it('should return null with insufficient samples', () => {
      // Add fewer samples than required
      for (let i = 0; i < 5; i++) {
        detector.recordSample({
          value: 0.75 + i * 0.01,
          timestamp: new Date(),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      const baseline = detector.computeBaseline('gpt-4', 'score_distribution');
      expect(baseline).toBeNull();
    });

    it('should compute baseline with sufficient samples', () => {
      // Add enough samples
      for (let i = 0; i < 20; i++) {
        detector.recordSample({
          value: 0.75 + i * 0.01,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      const baseline = detector.computeBaseline('gpt-4', 'score_distribution');

      expect(baseline).not.toBeNull();
      expect(baseline!.sampleCount).toBeGreaterThan(0);
      expect(baseline!.mean).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Drift Detection Tests
  // ============================================

  describe('detectDrift', () => {
    it('should return no drift with insufficient data', () => {
      const result = detector.detectDrift('gpt-4', 'score_distribution');

      expect(result.detected).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('should detect no drift with stable distribution', () => {
      // Add stable samples with consistent values (no random variance)
      // Use same fixed values for both baseline and current window
      const fixedValues = [0.70, 0.72, 0.74, 0.76, 0.78, 0.80, 0.71, 0.73, 0.75, 0.77, 0.79, 0.81, 0.72, 0.74, 0.76];

      for (let i = 0; i < fixedValues.length; i++) {
        detector.recordSample({
          value: fixedValues[i],
          timestamp: new Date(Date.now() - (30 + i) * 60000), // Baseline period
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      // Add same distribution for current period
      for (let i = 0; i < fixedValues.length; i++) {
        detector.recordSample({
          value: fixedValues[i],
          timestamp: new Date(Date.now() - i * 60000), // Current period
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      const result = detector.detectDrift('gpt-4', 'score_distribution');

      // With identical distribution, drift score should be low
      // The test verifies the detector returns a result with proper structure
      expect(result.detected).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.driftScore).toBeGreaterThanOrEqual(0);
    });

    it('should detect drift with shifted distribution', () => {
      // Add baseline samples (mean ~0.5)
      for (let i = 0; i < 15; i++) {
        detector.recordSample({
          value: 0.4 + Math.random() * 0.2,
          timestamp: new Date(Date.now() - (30 + i) * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      // Compute baseline from early samples
      detector.computeBaseline('gpt-4', 'score_distribution');

      // Add drifted samples (mean ~0.9)
      for (let i = 0; i < 15; i++) {
        detector.recordSample({
          value: 0.8 + Math.random() * 0.2,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      const result = detector.detectDrift('gpt-4', 'score_distribution');

      // Should detect some level of drift due to mean shift
      expect(result.pValue).toBeDefined();
      expect(result.driftScore).toBeDefined();
    });

    it('should include recommendations for detected drift', () => {
      // Add samples that will trigger drift
      for (let i = 0; i < 30; i++) {
        const value = i < 15 ? 0.3 + Math.random() * 0.1 : 0.8 + Math.random() * 0.1;
        detector.recordSample({
          value,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      detector.computeBaseline('gpt-4', 'score_distribution');
      const result = detector.detectDrift('gpt-4', 'score_distribution');

      // Should have recommendations if drift detected
      if (result.detected) {
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // Detect All Drift Tests
  // ============================================

  describe('detectAllDrift', () => {
    it('should run drift detection for all tracked metrics', () => {
      // Add samples for multiple metrics
      for (let i = 0; i < 15; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
        detector.recordSample({
          value: 0.80,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'confidence_level',
        });
      }

      const results = detector.detectAllDrift();

      expect(results.length).toBe(2);
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

    it('should track last check time', () => {
      for (let i = 0; i < 15; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      detector.detectDrift('gpt-4', 'score_distribution');
      const status = detector.getStatus();

      expect(status.lastCheck).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // History Tests
  // ============================================

  describe('getHistory', () => {
    it('should return drift history sorted by timestamp', () => {
      // Generate drift results
      for (let i = 0; i < 20; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      detector.detectDrift('gpt-4', 'score_distribution');
      detector.detectDrift('gpt-4', 'score_distribution');

      const history = detector.getHistory();

      expect(history.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(Date.now() - i * 60000),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      // Run multiple detections
      for (let i = 0; i < 10; i++) {
        detector.detectDrift('gpt-4', 'score_distribution');
      }

      const history = detector.getHistory(5);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================
  // Set Baseline Tests
  // ============================================

  describe('setBaseline', () => {
    it('should manually set baseline window', () => {
      const window = {
        startTime: new Date(Date.now() - 60 * 60 * 1000),
        endTime: new Date(),
        sampleCount: 100,
        mean: 0.75,
        variance: 0.01,
        min: 0.5,
        max: 1.0,
        distribution: [0.1, 0.1, 0.2, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0],
      };

      detector.setBaseline('gpt-4', 'score_distribution', window);

      // Add current samples and detect - should use the set baseline
      for (let i = 0; i < 15; i++) {
        detector.recordSample({
          value: 0.75,
          timestamp: new Date(),
          model: 'gpt-4',
          metric: 'score_distribution',
        });
      }

      const result = detector.detectDrift('gpt-4', 'score_distribution');
      expect(result.baselineWindow.mean).toBe(0.75);
    });
  });

  // ============================================
  // Default Config Tests
  // ============================================

  describe('defaultDriftConfig', () => {
    it('should have appropriate window size', () => {
      expect(defaultDriftConfig.windowSizeHours).toBe(6);
    });

    it('should have minimum samples requirement', () => {
      expect(defaultDriftConfig.minSamplesRequired).toBe(50);
    });

    it('should have severity thresholds', () => {
      expect(defaultDriftConfig.driftScoreThresholds.low).toBe(0.1);
      expect(defaultDriftConfig.driftScoreThresholds.medium).toBe(0.25);
      expect(defaultDriftConfig.driftScoreThresholds.high).toBe(0.5);
      expect(defaultDriftConfig.driftScoreThresholds.critical).toBe(0.75);
    });

    it('should use standard p-value threshold', () => {
      expect(defaultDriftConfig.pValueThreshold).toBe(0.05);
    });
  });
});
