/**
 * Feedback Validators - IFC-024: Human-in-the-Loop Feedback
 *
 * Zod schemas for AI score feedback and corrections.
 * Enables users to provide feedback on AI-generated scores
 * and corrections that feed into model improvement pipelines.
 *
 * @module @intelliflow/validators/feedback
 */

import { z } from 'zod';
import {
  FEEDBACK_TYPES,
  FEEDBACK_CATEGORIES,
  CORRECTION_MAGNITUDE_BUCKETS,
} from '@intelliflow/domain';

// =============================================================================
// Base Schemas (derived from domain constants)
// =============================================================================

/**
 * Feedback type schema - thumbs up, thumbs down, or score correction
 */
export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;

/**
 * Feedback category schema - why the score was incorrect
 */
export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

/**
 * Score value schema - 0 to 100
 */
export const scoreValueSchema = z.number().int().min(0).max(100);

/**
 * Confidence value schema - 0 to 1
 */
export const confidenceValueSchema = z.number().min(0).max(1);

/**
 * Model version schema
 */
export const modelVersionSchema = z.string().min(1).max(100);

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Submit simple feedback (thumbs up/down)
 */
export const submitSimpleFeedbackSchema = z.object({
  leadId: z.string().min(1),
  aiScoreId: z.string().min(1).optional(),
  feedbackType: z.enum(['THUMBS_UP', 'THUMBS_DOWN']),
  originalScore: scoreValueSchema,
  originalConfidence: confidenceValueSchema,
  modelVersion: modelVersionSchema,
});

export type SubmitSimpleFeedbackInput = z.infer<typeof submitSimpleFeedbackSchema>;

/**
 * Submit score correction with reason
 */
export const submitScoreCorrectionSchema = z.object({
  leadId: z.string().min(1),
  aiScoreId: z.string().min(1).optional(),
  originalScore: scoreValueSchema,
  originalConfidence: confidenceValueSchema,
  correctedScore: scoreValueSchema,
  reason: z.string().min(10).max(1000).optional(),
  correctionCategory: feedbackCategorySchema,
  modelVersion: modelVersionSchema,
}).refine(
  (data) => data.correctedScore !== data.originalScore,
  { message: 'Corrected score must be different from original score' }
);

export type SubmitScoreCorrectionInput = z.infer<typeof submitScoreCorrectionSchema>;

/**
 * Feedback analytics query parameters
 */
export const feedbackAnalyticsQuerySchema = z.object({
  modelVersion: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  tenantId: z.string().optional(),
});

export type FeedbackAnalyticsQuery = z.infer<typeof feedbackAnalyticsQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Individual feedback record response
 */
export const feedbackRecordSchema = z.object({
  id: z.string(),
  feedbackType: feedbackTypeSchema,
  originalScore: scoreValueSchema,
  originalConfidence: confidenceValueSchema,
  correctedScore: scoreValueSchema.nullable(),
  correctionMagnitude: z.number().int().min(0).nullable(),
  reason: z.string().nullable(),
  correctionCategory: feedbackCategorySchema.nullable(),
  modelVersion: modelVersionSchema,
  createdAt: z.coerce.date(),
  leadId: z.string(),
  userId: z.string(),
});

export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

/**
 * Correction magnitude distribution
 */
export const correctionDistributionSchema = z.object({
  /** Minor corrections: 1-10 points */
  minor: z.number().int().min(0),
  /** Moderate corrections: 11-25 points */
  moderate: z.number().int().min(0),
  /** Major corrections: 26-50 points */
  major: z.number().int().min(0),
  /** Severe corrections: 50+ points */
  severe: z.number().int().min(0),
});

export type CorrectionDistribution = z.infer<typeof correctionDistributionSchema>;

/**
 * Model version statistics
 */
export const modelVersionStatsSchema = z.object({
  modelVersion: z.string(),
  feedbackCount: z.number().int().min(0),
  positiveRatio: z.number().min(0).max(1),
  avgCorrectionMagnitude: z.number().min(0),
});

export type ModelVersionStats = z.infer<typeof modelVersionStatsSchema>;

/**
 * Trend data point
 */
export const trendDataPointSchema = z.object({
  date: z.string(),
  positive: z.number().int().min(0),
  negative: z.number().int().min(0),
  corrections: z.number().int().min(0),
  avgMagnitude: z.number().min(0),
});

export type TrendDataPoint = z.infer<typeof trendDataPointSchema>;

/**
 * Complete feedback analytics response
 */
export const feedbackAnalyticsSchema = z.object({
  // Summary counts
  totalFeedback: z.number().int().min(0),
  positiveCount: z.number().int().min(0),
  negativeCount: z.number().int().min(0),
  correctionCount: z.number().int().min(0),

  // Ratios
  positiveRatio: z.number().min(0).max(1),
  negativeRatio: z.number().min(0).max(1),

  // Correction analytics
  averageCorrectionMagnitude: z.number().min(0),
  correctionDistribution: correctionDistributionSchema,
  categoryBreakdown: z.record(z.string(), z.number().int().min(0)),

  // Model performance
  modelVersionStats: z.array(modelVersionStatsSchema),

  // Trends
  trendData: z.array(trendDataPointSchema),

  // Recommendations
  improvementRecommendations: z.array(z.string()),
  retrainingRecommended: z.boolean(),
  retrainingReason: z.string().optional(),
});

export type FeedbackAnalytics = z.infer<typeof feedbackAnalyticsSchema>;

/**
 * Retraining check response
 */
export const retrainingCheckSchema = z.object({
  needed: z.boolean(),
  reason: z.string().optional(),
  feedbackCount: z.number().int().min(0).optional(),
  negativeRatio: z.number().min(0).max(1).optional(),
  avgCorrectionMagnitude: z.number().min(0).optional(),
});

export type RetrainingCheck = z.infer<typeof retrainingCheckSchema>;

/**
 * Training data export item
 */
export const trainingDataItemSchema = z.object({
  leadId: z.string(),
  originalScore: scoreValueSchema,
  correctedScore: scoreValueSchema,
  category: z.string(),
  leadData: z.record(z.string(), z.unknown()),
});

export type TrainingDataItem = z.infer<typeof trainingDataItemSchema>;

/**
 * Training data export response
 */
export const trainingDataExportSchema = z.object({
  corrections: z.array(trainingDataItemSchema),
  exportedAt: z.coerce.date(),
  modelVersion: z.string(),
  recordCount: z.number().int().min(0),
});

export type TrainingDataExport = z.infer<typeof trainingDataExportSchema>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate correction magnitude bucket
 */
export function getCorrectionBucket(magnitude: number): keyof CorrectionDistribution {
  if (magnitude <= CORRECTION_MAGNITUDE_BUCKETS.MINOR_MAX) return 'minor';
  if (magnitude <= CORRECTION_MAGNITUDE_BUCKETS.MODERATE_MAX) return 'moderate';
  if (magnitude <= CORRECTION_MAGNITUDE_BUCKETS.MAJOR_MAX) return 'major';
  return 'severe';
}

/**
 * Calculate correction magnitude from original and corrected scores
 */
export function calculateCorrectionMagnitude(
  originalScore: number,
  correctedScore: number
): number {
  return Math.abs(correctedScore - originalScore);
}
