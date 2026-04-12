/**
 * Feedback Validator Tests - IFC-024
 *
 * Tests for AI score feedback and correction validation schemas.
 * Ensures proper input validation for the human-in-the-loop feedback system.
 */

import { describe, it, expect } from 'vitest';
import {
  feedbackTypeSchema,
  feedbackCategorySchema,
  scoreValueSchema,
  confidenceValueSchema,
  modelVersionSchema,
  submitSimpleFeedbackSchema,
  submitScoreCorrectionSchema,
  feedbackAnalyticsQuerySchema,
  feedbackRecordSchema,
  correctionDistributionSchema,
  feedbackAnalyticsSchema,
  retrainingCheckSchema,
  trainingDataExportSchema,
  getCorrectionBucket,
  calculateCorrectionMagnitude,
} from '../src/feedback';

describe('Feedback Validators', () => {
  describe('feedbackTypeSchema', () => {
    it('should validate valid feedback types', () => {
      const validTypes = ['THUMBS_UP', 'THUMBS_DOWN', 'SCORE_CORRECTION'];

      validTypes.forEach((type) => {
        const result = feedbackTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid feedback types', () => {
      const result = feedbackTypeSchema.safeParse('INVALID_TYPE');
      expect(result.success).toBe(false);
    });
  });

  describe('feedbackCategorySchema', () => {
    it('should validate valid feedback categories', () => {
      const validCategories = [
        'SCORE_TOO_HIGH',
        'SCORE_TOO_LOW',
        'WRONG_FACTORS',
        'MISSING_CONTEXT',
        'DATA_QUALITY',
        'OTHER',
      ];

      validCategories.forEach((category) => {
        const result = feedbackCategorySchema.safeParse(category);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid feedback categories', () => {
      const result = feedbackCategorySchema.safeParse('INVALID_CATEGORY');
      expect(result.success).toBe(false);
    });
  });

  describe('scoreValueSchema', () => {
    it('should validate scores 0-100', () => {
      expect(scoreValueSchema.safeParse(0).success).toBe(true);
      expect(scoreValueSchema.safeParse(50).success).toBe(true);
      expect(scoreValueSchema.safeParse(100).success).toBe(true);
    });

    it('should reject negative scores', () => {
      const result = scoreValueSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('should reject scores above 100', () => {
      const result = scoreValueSchema.safeParse(101);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer scores', () => {
      const result = scoreValueSchema.safeParse(75.5);
      expect(result.success).toBe(false);
    });
  });

  describe('confidenceValueSchema', () => {
    it('should validate confidence 0-1', () => {
      expect(confidenceValueSchema.safeParse(0).success).toBe(true);
      expect(confidenceValueSchema.safeParse(0.5).success).toBe(true);
      expect(confidenceValueSchema.safeParse(1).success).toBe(true);
    });

    it('should reject negative confidence', () => {
      const result = confidenceValueSchema.safeParse(-0.1);
      expect(result.success).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const result = confidenceValueSchema.safeParse(1.1);
      expect(result.success).toBe(false);
    });
  });

  describe('modelVersionSchema', () => {
    it('should validate valid model versions', () => {
      expect(modelVersionSchema.safeParse('v1.0.0').success).toBe(true);
      expect(modelVersionSchema.safeParse('lead-scorer-v2.1').success).toBe(true);
    });

    it('should reject empty model version', () => {
      const result = modelVersionSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject model version exceeding max length', () => {
      const result = modelVersionSchema.safeParse('x'.repeat(101));
      expect(result.success).toBe(false);
    });
  });

  describe('submitSimpleFeedbackSchema', () => {
    it('should validate valid thumbs up feedback', () => {
      const validData = {
        leadId: 'lead-123',
        feedbackType: 'THUMBS_UP',
        originalScore: 75,
        originalConfidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = submitSimpleFeedbackSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate valid thumbs down feedback', () => {
      const validData = {
        leadId: 'lead-456',
        feedbackType: 'THUMBS_DOWN',
        originalScore: 50,
        originalConfidence: 0.6,
        modelVersion: 'v1.0.0',
      };

      const result = submitSimpleFeedbackSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow optional aiScoreId', () => {
      const dataWithAiScore = {
        leadId: 'lead-123',
        aiScoreId: 'score-789',
        feedbackType: 'THUMBS_UP',
        originalScore: 75,
        originalConfidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = submitSimpleFeedbackSchema.safeParse(dataWithAiScore);
      expect(result.success).toBe(true);
    });

    it('should reject SCORE_CORRECTION for simple feedback', () => {
      const invalidData = {
        leadId: 'lead-123',
        feedbackType: 'SCORE_CORRECTION',
        originalScore: 75,
        originalConfidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = submitSimpleFeedbackSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should require all mandatory fields', () => {
      const incompleteData = {
        leadId: 'lead-123',
        feedbackType: 'THUMBS_UP',
      };

      const result = submitSimpleFeedbackSchema.safeParse(incompleteData);
      expect(result.success).toBe(false);
    });
  });

  describe('submitScoreCorrectionSchema', () => {
    it('should validate valid score correction', () => {
      const validData = {
        leadId: 'lead-123',
        originalScore: 50,
        originalConfidence: 0.7,
        correctedScore: 75,
        correctionCategory: 'SCORE_TOO_LOW',
        modelVersion: 'v1.0.0',
      };

      const result = submitScoreCorrectionSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate correction with optional reason', () => {
      const dataWithReason = {
        leadId: 'lead-123',
        originalScore: 80,
        originalConfidence: 0.9,
        correctedScore: 60,
        reason: 'Lead is no longer with the company and budget was cut',
        correctionCategory: 'SCORE_TOO_HIGH',
        modelVersion: 'v1.0.0',
      };

      const result = submitScoreCorrectionSchema.safeParse(dataWithReason);
      expect(result.success).toBe(true);
    });

    it('should reject correction with same original and corrected score', () => {
      const invalidData = {
        leadId: 'lead-123',
        originalScore: 75,
        originalConfidence: 0.85,
        correctedScore: 75,
        correctionCategory: 'SCORE_TOO_LOW',
        modelVersion: 'v1.0.0',
      };

      const result = submitScoreCorrectionSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('different');
      }
    });

    it('should reject reason shorter than 10 characters', () => {
      const invalidData = {
        leadId: 'lead-123',
        originalScore: 50,
        originalConfidence: 0.7,
        correctedScore: 75,
        reason: 'Too short',
        correctionCategory: 'SCORE_TOO_LOW',
        modelVersion: 'v1.0.0',
      };

      const result = submitScoreCorrectionSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject reason longer than 1000 characters', () => {
      const invalidData = {
        leadId: 'lead-123',
        originalScore: 50,
        originalConfidence: 0.7,
        correctedScore: 75,
        reason: 'x'.repeat(1001),
        correctionCategory: 'SCORE_TOO_LOW',
        modelVersion: 'v1.0.0',
      };

      const result = submitScoreCorrectionSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should require correctionCategory', () => {
      const invalidData = {
        leadId: 'lead-123',
        originalScore: 50,
        originalConfidence: 0.7,
        correctedScore: 75,
        modelVersion: 'v1.0.0',
      };

      const result = submitScoreCorrectionSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('feedbackAnalyticsQuerySchema', () => {
    it('should validate empty query', () => {
      const result = feedbackAnalyticsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should validate query with all fields', () => {
      const validQuery = {
        modelVersion: 'v1.0.0',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        tenantId: 'tenant-123',
      };

      const result = feedbackAnalyticsQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dateFrom).toBeInstanceOf(Date);
        expect(result.data.dateTo).toBeInstanceOf(Date);
      }
    });

    it('should coerce date strings to Date objects', () => {
      const query = {
        dateFrom: '2024-06-15',
      };

      const result = feedbackAnalyticsQuerySchema.safeParse(query);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dateFrom).toBeInstanceOf(Date);
      }
    });
  });

  describe('feedbackRecordSchema', () => {
    it('should validate valid feedback record', () => {
      const validRecord = {
        id: 'feedback-123',
        feedbackType: 'THUMBS_UP',
        originalScore: 75,
        originalConfidence: 0.85,
        correctedScore: null,
        correctionMagnitude: null,
        reason: null,
        correctionCategory: null,
        modelVersion: 'v1.0.0',
        createdAt: '2024-01-01T00:00:00Z',
        leadId: 'lead-123',
        userId: 'user-456',
      };

      const result = feedbackRecordSchema.safeParse(validRecord);
      expect(result.success).toBe(true);
    });

    it('should validate correction feedback record', () => {
      const correctionRecord = {
        id: 'feedback-456',
        feedbackType: 'SCORE_CORRECTION',
        originalScore: 50,
        originalConfidence: 0.7,
        correctedScore: 75,
        correctionMagnitude: 25,
        reason: 'Lead upgraded to enterprise tier',
        correctionCategory: 'SCORE_TOO_LOW',
        modelVersion: 'v1.0.0',
        createdAt: '2024-01-01T00:00:00Z',
        leadId: 'lead-123',
        userId: 'user-456',
      };

      const result = feedbackRecordSchema.safeParse(correctionRecord);
      expect(result.success).toBe(true);
    });
  });

  describe('correctionDistributionSchema', () => {
    it('should validate valid distribution', () => {
      const validDist = {
        minor: 10,
        moderate: 5,
        major: 3,
        severe: 1,
      };

      const result = correctionDistributionSchema.safeParse(validDist);
      expect(result.success).toBe(true);
    });

    it('should reject negative counts', () => {
      const invalidDist = {
        minor: -1,
        moderate: 5,
        major: 3,
        severe: 1,
      };

      const result = correctionDistributionSchema.safeParse(invalidDist);
      expect(result.success).toBe(false);
    });

    it('should require all buckets', () => {
      const incompleteDist = {
        minor: 10,
        moderate: 5,
      };

      const result = correctionDistributionSchema.safeParse(incompleteDist);
      expect(result.success).toBe(false);
    });
  });

  describe('feedbackAnalyticsSchema', () => {
    it('should validate complete analytics response', () => {
      const validAnalytics = {
        totalFeedback: 100,
        positiveCount: 60,
        negativeCount: 20,
        correctionCount: 20,
        positiveRatio: 0.6,
        negativeRatio: 0.2,
        averageCorrectionMagnitude: 15.5,
        correctionDistribution: {
          minor: 8,
          moderate: 7,
          major: 4,
          severe: 1,
        },
        categoryBreakdown: {
          SCORE_TOO_HIGH: 8,
          SCORE_TOO_LOW: 6,
          WRONG_FACTORS: 4,
          OTHER: 2,
        },
        modelVersionStats: [
          {
            modelVersion: 'v1.0.0',
            feedbackCount: 100,
            positiveRatio: 0.6,
            avgCorrectionMagnitude: 15.5,
          },
        ],
        trendData: [
          {
            date: '2024-01-01',
            positive: 5,
            negative: 2,
            corrections: 3,
            avgMagnitude: 12.0,
          },
        ],
        improvementRecommendations: [
          'Consider adjusting factor weights',
          'Review data quality for low-score leads',
        ],
        retrainingRecommended: false,
      };

      const result = feedbackAnalyticsSchema.safeParse(validAnalytics);
      expect(result.success).toBe(true);
    });

    it('should validate analytics with retraining recommended', () => {
      const analyticsWithRetraining = {
        totalFeedback: 150,
        positiveCount: 40,
        negativeCount: 50,
        correctionCount: 60,
        positiveRatio: 0.27,
        negativeRatio: 0.33,
        averageCorrectionMagnitude: 25.0,
        correctionDistribution: {
          minor: 10,
          moderate: 20,
          major: 20,
          severe: 10,
        },
        categoryBreakdown: {},
        modelVersionStats: [],
        trendData: [],
        improvementRecommendations: ['Urgent: Model retraining required'],
        retrainingRecommended: true,
        retrainingReason: 'High negative feedback ratio exceeds threshold',
      };

      const result = feedbackAnalyticsSchema.safeParse(analyticsWithRetraining);
      expect(result.success).toBe(true);
    });
  });

  describe('retrainingCheckSchema', () => {
    it('should validate retraining not needed', () => {
      const result = retrainingCheckSchema.safeParse({
        needed: false,
      });
      expect(result.success).toBe(true);
    });

    it('should validate retraining needed with details', () => {
      const validCheck = {
        needed: true,
        reason: 'High average correction magnitude',
        feedbackCount: 150,
        negativeRatio: 0.35,
        avgCorrectionMagnitude: 22.5,
      };

      const result = retrainingCheckSchema.safeParse(validCheck);
      expect(result.success).toBe(true);
    });
  });

  describe('trainingDataExportSchema', () => {
    it('should validate valid export', () => {
      const validExport = {
        corrections: [
          {
            leadId: 'lead-123',
            originalScore: 50,
            correctedScore: 75,
            category: 'SCORE_TOO_LOW',
            leadData: {
              email: 'test@example.com',
              company: 'Acme Corp',
            },
          },
        ],
        exportedAt: '2024-01-01T00:00:00Z',
        modelVersion: 'v1.0.0',
        recordCount: 1,
      };

      const result = trainingDataExportSchema.safeParse(validExport);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.exportedAt).toBeInstanceOf(Date);
      }
    });

    it('should validate empty export', () => {
      const emptyExport = {
        corrections: [],
        exportedAt: '2024-01-01T00:00:00Z',
        modelVersion: 'v1.0.0',
        recordCount: 0,
      };

      const result = trainingDataExportSchema.safeParse(emptyExport);
      expect(result.success).toBe(true);
    });
  });

  describe('getCorrectionBucket', () => {
    it('should return minor for magnitudes 1-10', () => {
      expect(getCorrectionBucket(1)).toBe('minor');
      expect(getCorrectionBucket(5)).toBe('minor');
      expect(getCorrectionBucket(10)).toBe('minor');
    });

    it('should return moderate for magnitudes 11-25', () => {
      expect(getCorrectionBucket(11)).toBe('moderate');
      expect(getCorrectionBucket(20)).toBe('moderate');
      expect(getCorrectionBucket(25)).toBe('moderate');
    });

    it('should return major for magnitudes 26-50', () => {
      expect(getCorrectionBucket(26)).toBe('major');
      expect(getCorrectionBucket(40)).toBe('major');
      expect(getCorrectionBucket(50)).toBe('major');
    });

    it('should return severe for magnitudes > 50', () => {
      expect(getCorrectionBucket(51)).toBe('severe');
      expect(getCorrectionBucket(75)).toBe('severe');
      expect(getCorrectionBucket(100)).toBe('severe');
    });
  });

  describe('calculateCorrectionMagnitude', () => {
    it('should calculate positive difference', () => {
      expect(calculateCorrectionMagnitude(50, 75)).toBe(25);
    });

    it('should calculate negative difference as absolute', () => {
      expect(calculateCorrectionMagnitude(80, 60)).toBe(20);
    });

    it('should return 0 for same scores', () => {
      expect(calculateCorrectionMagnitude(50, 50)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(calculateCorrectionMagnitude(0, 100)).toBe(100);
      expect(calculateCorrectionMagnitude(100, 0)).toBe(100);
    });
  });
});
