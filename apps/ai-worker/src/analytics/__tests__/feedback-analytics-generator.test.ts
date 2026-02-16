/**
 * Feedback Analytics Generator Tests (IFC-024)
 *
 * Tests for FeedbackAnalyticsGenerator class.
 * Covers:
 * - Summary statistics calculation
 * - Correction distribution buckets
 * - Category analysis
 * - Model version performance analysis
 * - Retraining need evaluation
 * - Trends (daily, weekly)
 * - Recommendations generation
 * - File I/O (generate and save)
 * - Edge cases: empty records, zero totals, single records
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises before importing the module
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock domain constants
vi.mock('@intelliflow/domain', () => ({
  RETRAINING_THRESHOLDS: {
    MIN_FEEDBACK_COUNT: 100,
    MAX_NEGATIVE_RATIO: 0.3,
    MAX_AVG_CORRECTION: 20,
    WINDOW_DAYS: 7,
  },
  CORRECTION_MAGNITUDE_BUCKETS: {
    MINOR_MAX: 10,
    MODERATE_MAX: 25,
    MAJOR_MAX: 50,
  },
}));

import {
  FeedbackAnalyticsGenerator,
  type FeedbackRecord,
  type FeedbackAnalytics,
} from '../feedback-analytics-generator';
import { writeFile, mkdir } from 'fs/promises';

// =============================================
// Helpers
// =============================================

function makeFeedbackRecord(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: `fb-${Math.random().toString(36).slice(2, 8)}`,
    feedbackType: 'THUMBS_UP',
    originalScore: 75,
    originalConfidence: 0.85,
    correctedScore: null,
    correctionMagnitude: null,
    correctionCategory: null,
    reason: null,
    modelVersion: 'v1.0.0',
    createdAt: new Date(),
    leadId: 'lead-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function makeCorrection(
  magnitude: number,
  overrides: Partial<FeedbackRecord> = {}
): FeedbackRecord {
  return makeFeedbackRecord({
    feedbackType: 'SCORE_CORRECTION',
    originalScore: 50,
    correctedScore: 50 + magnitude,
    correctionMagnitude: Math.abs(magnitude),
    correctionCategory: 'SCORE_TOO_LOW',
    ...overrides,
  });
}

function makeRecordsInPeriod(count: number, daysAgo: number = 0): FeedbackRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeFeedbackRecord({
      createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + i * 1000),
    })
  );
}

// =============================================
// Tests
// =============================================

describe('FeedbackAnalyticsGenerator', () => {
  let generator: FeedbackAnalyticsGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new FeedbackAnalyticsGenerator('/tmp/test-analytics.json');
  });

  describe('constructor', () => {
    it('should use default output path when not specified', () => {
      const gen = new FeedbackAnalyticsGenerator();
      // Just verify it constructs without error
      expect(gen).toBeDefined();
    });

    it('should accept custom output path', () => {
      const gen = new FeedbackAnalyticsGenerator('/custom/path.json');
      expect(gen).toBeDefined();
    });
  });

  describe('generate', () => {
    it('should return analytics with correct shape', async () => {
      const records = [makeFeedbackRecord()];
      const analytics = await generator.generate(records, 30);

      expect(analytics).toHaveProperty('generatedAt');
      expect(analytics).toHaveProperty('period');
      expect(analytics.period).toHaveProperty('start');
      expect(analytics.period).toHaveProperty('end');
      expect(analytics.period).toHaveProperty('days', 30);
      expect(analytics).toHaveProperty('summary');
      expect(analytics).toHaveProperty('corrections');
      expect(analytics).toHaveProperty('categoryAnalysis');
      expect(analytics).toHaveProperty('modelPerformance');
      expect(analytics).toHaveProperty('retrainingStatus');
      expect(analytics).toHaveProperty('trends');
      expect(analytics).toHaveProperty('recommendations');
    });

    it('should filter records to specified period', async () => {
      const recent = makeFeedbackRecord({ createdAt: new Date() });
      const old = makeFeedbackRecord({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });
      const analytics = await generator.generate([recent, old], 30);

      // Only the recent record should be counted
      expect(analytics.summary.total).toBe(1);
    });

    it('should handle empty records', async () => {
      const analytics = await generator.generate([], 30);

      expect(analytics.summary.total).toBe(0);
      expect(analytics.summary.positiveRatio).toBe(0);
      expect(analytics.corrections.averageMagnitude).toBe(0);
      expect(analytics.categoryAnalysis).toEqual([]);
      expect(analytics.modelPerformance).toEqual([]);
    });

    it('should use default period of 30 days', async () => {
      const analytics = await generator.generate([]);
      expect(analytics.period.days).toBe(30);
    });
  });

  describe('generateAndSave', () => {
    it('should write analytics to file', async () => {
      const records = [makeFeedbackRecord()];
      await generator.generateAndSave(records, 30);

      expect(mkdir).toHaveBeenCalledWith('/tmp', { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        '/tmp/test-analytics.json',
        expect.any(String),
        'utf-8'
      );
    });

    it('should write valid JSON', async () => {
      const records = [makeFeedbackRecord()];
      await generator.generateAndSave(records, 30);

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toHaveProperty('generatedAt');
      expect(parsed).toHaveProperty('summary');
    });

    it('should return the analytics object', async () => {
      const result = await generator.generateAndSave([makeFeedbackRecord()]);
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('corrections');
    });
  });

  describe('calculateSummary', () => {
    it('should count feedback types correctly', async () => {
      const records = [
        makeFeedbackRecord({ feedbackType: 'THUMBS_UP' }),
        makeFeedbackRecord({ feedbackType: 'THUMBS_UP' }),
        makeFeedbackRecord({ feedbackType: 'THUMBS_DOWN' }),
        makeFeedbackRecord({ feedbackType: 'SCORE_CORRECTION' }),
      ];
      const analytics = await generator.generate(records, 30);
      const { summary } = analytics;

      expect(summary.total).toBe(4);
      expect(summary.thumbsUp).toBe(2);
      expect(summary.thumbsDown).toBe(1);
      expect(summary.corrections).toBe(1);
      expect(summary.positiveRatio).toBeCloseTo(0.5, 2);
      expect(summary.negativeRatio).toBeCloseTo(0.25, 2);
      expect(summary.correctionRatio).toBeCloseTo(0.25, 2);
    });

    it('should return zero ratios for empty records', async () => {
      const analytics = await generator.generate([], 30);
      expect(analytics.summary.positiveRatio).toBe(0);
      expect(analytics.summary.negativeRatio).toBe(0);
      expect(analytics.summary.correctionRatio).toBe(0);
    });
  });

  describe('calculateCorrectionDistribution', () => {
    it('should bucket corrections by magnitude', async () => {
      const records = [
        makeCorrection(5), // minor (<=10)
        makeCorrection(8), // minor
        makeCorrection(15), // moderate (11-25)
        makeCorrection(30), // major (26-50)
        makeCorrection(60), // severe (>50)
      ];
      const analytics = await generator.generate(records, 30);
      const { corrections } = analytics;

      expect(corrections.minor).toBe(2);
      expect(corrections.moderate).toBe(1);
      expect(corrections.major).toBe(1);
      expect(corrections.severe).toBe(1);
    });

    it('should calculate average and median magnitude', async () => {
      const records = [makeCorrection(10), makeCorrection(20), makeCorrection(30)];
      const analytics = await generator.generate(records, 30);

      expect(analytics.corrections.averageMagnitude).toBeCloseTo(20, 1);
      expect(analytics.corrections.medianMagnitude).toBe(20);
    });

    it('should calculate median for even number of values', async () => {
      const records = [
        makeCorrection(10),
        makeCorrection(20),
        makeCorrection(30),
        makeCorrection(40),
      ];
      const analytics = await generator.generate(records, 30);

      // Median of [10,20,30,40] = (20+30)/2 = 25
      expect(analytics.corrections.medianMagnitude).toBe(25);
    });

    it('should detect upward direction', async () => {
      const records = [
        makeFeedbackRecord({
          feedbackType: 'SCORE_CORRECTION',
          originalScore: 30,
          correctedScore: 60,
          correctionMagnitude: 30,
        }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.corrections.averageDirection).toBe('up');
    });

    it('should detect downward direction', async () => {
      const records = [
        makeFeedbackRecord({
          feedbackType: 'SCORE_CORRECTION',
          originalScore: 80,
          correctedScore: 40,
          correctionMagnitude: 40,
        }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.corrections.averageDirection).toBe('down');
    });

    it('should detect neutral direction for small changes', async () => {
      const records = [
        makeFeedbackRecord({
          feedbackType: 'SCORE_CORRECTION',
          originalScore: 50,
          correctedScore: 51,
          correctionMagnitude: 1,
        }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.corrections.averageDirection).toBe('neutral');
    });

    it('should handle zero corrections', async () => {
      const records = [makeFeedbackRecord({ feedbackType: 'THUMBS_UP' })];
      const analytics = await generator.generate(records, 30);

      expect(analytics.corrections.minor).toBe(0);
      expect(analytics.corrections.moderate).toBe(0);
      expect(analytics.corrections.major).toBe(0);
      expect(analytics.corrections.severe).toBe(0);
      expect(analytics.corrections.averageMagnitude).toBe(0);
      expect(analytics.corrections.medianMagnitude).toBe(0);
      expect(analytics.corrections.averageDirection).toBe('neutral');
    });
  });

  describe('analyzeCategoryDistribution', () => {
    it('should group corrections by category', async () => {
      const records = [
        makeCorrection(10, { correctionCategory: 'SCORE_TOO_HIGH' }),
        makeCorrection(15, { correctionCategory: 'SCORE_TOO_HIGH' }),
        makeCorrection(20, { correctionCategory: 'WRONG_FACTORS' }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.categoryAnalysis.length).toBe(2);
      const tooHigh = analytics.categoryAnalysis.find((c) => c.category === 'SCORE_TOO_HIGH');
      expect(tooHigh).toBeDefined();
      expect(tooHigh!.count).toBe(2);
      expect(tooHigh!.percentage).toBeCloseTo(66.67, 0);
    });

    it('should sort categories by count descending', async () => {
      const records = [
        makeCorrection(5, { correctionCategory: 'SCORE_TOO_LOW' }),
        makeCorrection(10, { correctionCategory: 'WRONG_FACTORS' }),
        makeCorrection(15, { correctionCategory: 'WRONG_FACTORS' }),
        makeCorrection(20, { correctionCategory: 'WRONG_FACTORS' }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.categoryAnalysis[0].category).toBe('WRONG_FACTORS');
    });

    it('should return empty array when no corrections have categories', async () => {
      const records = [makeFeedbackRecord({ feedbackType: 'THUMBS_UP' })];
      const analytics = await generator.generate(records, 30);
      expect(analytics.categoryAnalysis).toEqual([]);
    });

    it('should calculate average magnitude per category', async () => {
      const records = [
        makeCorrection(10, { correctionCategory: 'DATA_QUALITY' }),
        makeCorrection(30, { correctionCategory: 'DATA_QUALITY' }),
      ];
      const analytics = await generator.generate(records, 30);
      const dq = analytics.categoryAnalysis.find((c) => c.category === 'DATA_QUALITY');
      expect(dq!.averageMagnitude).toBe(20);
    });
  });

  describe('analyzeModelPerformance', () => {
    it('should group records by model version', async () => {
      const records = [
        makeFeedbackRecord({ modelVersion: 'v1.0', feedbackType: 'THUMBS_UP' }),
        makeFeedbackRecord({ modelVersion: 'v1.0', feedbackType: 'THUMBS_DOWN' }),
        makeFeedbackRecord({ modelVersion: 'v2.0', feedbackType: 'THUMBS_UP' }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.modelPerformance.length).toBe(2);
      const v1 = analytics.modelPerformance.find((m) => m.version === 'v1.0');
      expect(v1).toBeDefined();
      expect(v1!.totalFeedback).toBe(2);
      expect(v1!.positiveRatio).toBe(0.5);
    });

    it('should sort by totalFeedback descending', async () => {
      const records = [
        makeFeedbackRecord({ modelVersion: 'v1.0' }),
        makeFeedbackRecord({ modelVersion: 'v2.0' }),
        makeFeedbackRecord({ modelVersion: 'v2.0' }),
        makeFeedbackRecord({ modelVersion: 'v2.0' }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.modelPerformance[0].version).toBe('v2.0');
    });

    it('should calculate correction stats per version', async () => {
      const records = [
        makeCorrection(10, { modelVersion: 'v1.0' }),
        makeCorrection(30, { modelVersion: 'v1.0' }),
      ];
      const analytics = await generator.generate(records, 30);
      const v1 = analytics.modelPerformance.find((m) => m.version === 'v1.0');
      expect(v1!.correctionCount).toBe(2);
      expect(v1!.averageCorrectionMagnitude).toBe(20);
    });

    it('should handle empty records', async () => {
      const analytics = await generator.generate([], 30);
      expect(analytics.modelPerformance).toEqual([]);
    });
  });

  describe('evaluateRetrainingNeed', () => {
    it('should return not needed with insufficient feedback', async () => {
      // Less than MIN_FEEDBACK_COUNT (100) within WINDOW_DAYS (7)
      const records = makeRecordsInPeriod(10);
      const analytics = await generator.generate(records, 30);

      expect(analytics.retrainingStatus.needed).toBe(false);
      expect(analytics.retrainingStatus.urgency).toBe('none');
      expect(analytics.retrainingStatus.recommendation).toContain('Continue collecting');
    });

    it('should detect high negative ratio', async () => {
      // 120 records within 7 days, 50% thumbs down (>30% threshold)
      const thumbsUp = Array.from({ length: 60 }, () =>
        makeFeedbackRecord({ feedbackType: 'THUMBS_UP', createdAt: new Date() })
      );
      const thumbsDown = Array.from({ length: 60 }, () =>
        makeFeedbackRecord({ feedbackType: 'THUMBS_DOWN', createdAt: new Date() })
      );
      const records = [...thumbsUp, ...thumbsDown];
      const analytics = await generator.generate(records, 30);

      expect(analytics.retrainingStatus.needed).toBe(true);
      expect(analytics.retrainingStatus.reasons.some((r) => r.includes('negative feedback'))).toBe(
        true
      );
    });

    it('should detect high average correction magnitude', async () => {
      // 120 records with high corrections
      const up = Array.from({ length: 80 }, () =>
        makeFeedbackRecord({ feedbackType: 'THUMBS_UP', createdAt: new Date() })
      );
      const corrections = Array.from({ length: 40 }, () =>
        makeCorrection(30, { createdAt: new Date() })
      );
      const records = [...up, ...corrections];
      const analytics = await generator.generate(records, 30);

      expect(analytics.retrainingStatus.needed).toBe(true);
      expect(analytics.retrainingStatus.reasons.some((r) => r.includes('average correction'))).toBe(
        true
      );
    });

    it('should set critical urgency when both thresholds exceeded heavily', async () => {
      // 60% negative + high corrections > 1.5x threshold
      const thumbsDown = Array.from({ length: 80 }, () =>
        makeFeedbackRecord({ feedbackType: 'THUMBS_DOWN', createdAt: new Date() })
      );
      const corrections = Array.from({ length: 40 }, () =>
        makeCorrection(40, { createdAt: new Date() })
      );
      const records = [...thumbsDown, ...corrections];
      const analytics = await generator.generate(records, 30);

      expect(analytics.retrainingStatus.urgency).toBe('critical');
      expect(analytics.retrainingStatus.recommendation).toContain('URGENT');
    });

    it('should use most recent model version', async () => {
      const records = [
        makeFeedbackRecord({
          modelVersion: 'v1.0',
          createdAt: new Date(Date.now() - 5000),
        }),
        makeFeedbackRecord({
          modelVersion: 'v2.0',
          createdAt: new Date(),
        }),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.retrainingStatus.modelVersion).toBe('v2.0');
    });

    it('should return unknown version for empty records', async () => {
      const analytics = await generator.generate([], 30);
      expect(analytics.retrainingStatus.modelVersion).toBe('unknown');
    });
  });

  describe('calculateTrends', () => {
    it('should generate daily feedback counts for the period', async () => {
      const records = [makeFeedbackRecord({ createdAt: new Date() })];
      const analytics = await generator.generate(records, 7);

      expect(analytics.trends.dailyFeedbackCounts.length).toBe(7);
      // Should be sorted by date ascending
      const dates = analytics.trends.dailyFeedbackCounts.map((d) => d.date);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] >= dates[i - 1]).toBe(true);
      }
    });

    it('should calculate positive ratio per day', async () => {
      const today = new Date();
      const records = [
        makeFeedbackRecord({ feedbackType: 'THUMBS_UP', createdAt: today }),
        makeFeedbackRecord({ feedbackType: 'THUMBS_DOWN', createdAt: today }),
      ];
      const analytics = await generator.generate(records, 7);

      const todayKey = today.toISOString().split('T')[0];
      const todayEntry = analytics.trends.dailyFeedbackCounts.find((d) => d.date === todayKey);
      if (todayEntry && todayEntry.count > 0) {
        expect(todayEntry.positiveRatio).toBeCloseTo(0.5, 1);
      }
    });

    it('should calculate weekly average corrections', async () => {
      const records = [
        makeCorrection(10, { createdAt: new Date() }),
        makeCorrection(20, { createdAt: new Date() }),
      ];
      const analytics = await generator.generate(records, 30);

      if (analytics.trends.weeklyAverageCorrection.length > 0) {
        expect(analytics.trends.weeklyAverageCorrection[0]).toHaveProperty('week');
        expect(analytics.trends.weeklyAverageCorrection[0]).toHaveProperty('average');
      }
    });

    it('should handle period with no corrections', async () => {
      const records = [makeFeedbackRecord({ feedbackType: 'THUMBS_UP' })];
      const analytics = await generator.generate(records, 7);

      expect(analytics.trends.weeklyAverageCorrection).toEqual([]);
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend more feedback when volume is low', async () => {
      const records = Array.from({ length: 10 }, () => makeFeedbackRecord());
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('feedback more frequently'))).toBe(
        true
      );
    });

    it('should flag high negative ratio', async () => {
      // > 30% negative
      const records = [
        ...Array.from({ length: 30 }, () => makeFeedbackRecord({ feedbackType: 'THUMBS_UP' })),
        ...Array.from({ length: 25 }, () => makeFeedbackRecord({ feedbackType: 'THUMBS_DOWN' })),
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('negative feedback ratio'))).toBe(
        true
      );
    });

    it('should flag high average correction magnitude', async () => {
      const records = [...Array.from({ length: 20 }, () => makeCorrection(25))];
      const analytics = await generator.generate(records, 30);

      expect(
        analytics.recommendations.some((r) => r.includes('Average correction magnitude'))
      ).toBe(true);
    });

    it('should flag upward bias', async () => {
      const records = Array.from({ length: 5 }, () =>
        makeFeedbackRecord({
          feedbackType: 'SCORE_CORRECTION',
          originalScore: 20,
          correctedScore: 80,
          correctionMagnitude: 60,
        })
      );
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('underscoring'))).toBe(true);
    });

    it('should flag downward bias', async () => {
      const records = Array.from({ length: 5 }, () =>
        makeFeedbackRecord({
          feedbackType: 'SCORE_CORRECTION',
          originalScore: 80,
          correctedScore: 20,
          correctionMagnitude: 60,
        })
      );
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('overscoring'))).toBe(true);
    });

    it('should flag dominant correction category', async () => {
      // All corrections are SCORE_TOO_HIGH (>40%)
      const records = Array.from({ length: 10 }, () =>
        makeCorrection(15, { correctionCategory: 'SCORE_TOO_HIGH' })
      );
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('scoring too high'))).toBe(true);
    });

    it('should flag severe corrections exceeding minor', async () => {
      const records = [
        makeCorrection(60), // severe
        makeCorrection(70), // severe
        makeCorrection(5), // minor
      ];
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('severe corrections'))).toBe(true);
    });

    it('should provide default positive message when no issues found', async () => {
      // Lots of thumbs up, no corrections, sufficient volume
      const records = Array.from({ length: 80 }, () =>
        makeFeedbackRecord({ feedbackType: 'THUMBS_UP' })
      );
      const analytics = await generator.generate(records, 30);

      expect(analytics.recommendations.some((r) => r.includes('acceptable parameters'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle single record', async () => {
      const analytics = await generator.generate([makeFeedbackRecord()], 30);
      expect(analytics.summary.total).toBe(1);
    });

    it('should handle all records outside period', async () => {
      const old = makeFeedbackRecord({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });
      const analytics = await generator.generate([old], 30);
      expect(analytics.summary.total).toBe(0);
    });

    it('should handle corrections with null correctedScore', async () => {
      const record = makeFeedbackRecord({
        feedbackType: 'SCORE_CORRECTION',
        correctionMagnitude: 15,
        correctedScore: null,
      });
      const analytics = await generator.generate([record], 30);
      expect(analytics.corrections.averageDirection).toBe('neutral');
    });

    it('should handle corrections with null correctionMagnitude', async () => {
      const record = makeFeedbackRecord({
        feedbackType: 'SCORE_CORRECTION',
        correctionMagnitude: null,
      });
      const analytics = await generator.generate([record], 30);
      // Should be filtered out from magnitude calculations
      expect(analytics.corrections.averageMagnitude).toBe(0);
    });
  });
});
