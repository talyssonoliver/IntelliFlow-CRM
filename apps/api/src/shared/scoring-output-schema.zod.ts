/**
 * Scoring Output Schema
 * Re-exports the AI scoring schema from validators for API use
 *
 * This module provides type-safe structured output schemas for AI scoring responses.
 * Used by the scoring chain and API endpoints to ensure consistent output format.
 */

import { z } from 'zod';

// Re-export from validators package
export { leadScoreSchema, type LeadScoreInput } from '@intelliflow/validators';

/**
 * Extended scoring response schema with metadata
 * Used for API responses that include additional context
 */
export const scoringResponseSchema = z.object({
  /** Lead ID that was scored */
  leadId: z.string().uuid(),
  /** The scoring result */
  scoring: z.object({
    score: z.number().int().min(0).max(100),
    confidence: z.number().min(0).max(1),
    factors: z.array(
      z.object({
        name: z.string(),
        impact: z.number(),
        reasoning: z.string(),
      })
    ),
    modelVersion: z.string(),
  }),
  /** Tier classification based on score */
  tier: z.enum(['HOT', 'WARM', 'COLD']),
  /** ISO timestamp when scoring was performed */
  scoredAt: z.string().datetime(),
  /** Processing time in milliseconds */
  latencyMs: z.number().int().nonnegative(),
});

export type ScoringResponse = z.infer<typeof scoringResponseSchema>;

/**
 * Batch scoring request schema
 */
export const batchScoringRequestSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(100),
  options: z
    .object({
      skipCached: z.boolean().default(false),
      priority: z.enum(['low', 'normal', 'high']).default('normal'),
    })
    .optional(),
});

export type BatchScoringRequest = z.infer<typeof batchScoringRequestSchema>;

/**
 * Batch scoring response schema
 */
export const batchScoringResponseSchema = z.object({
  results: z.array(scoringResponseSchema),
  summary: z.object({
    totalProcessed: z.number().int().nonnegative(),
    averageScore: z.number().min(0).max(100),
    averageConfidence: z.number().min(0).max(1),
    averageLatencyMs: z.number().int().nonnegative(),
    tierDistribution: z.object({
      hot: z.number().int().nonnegative(),
      warm: z.number().int().nonnegative(),
      cold: z.number().int().nonnegative(),
    }),
  }),
});

export type BatchScoringResponse = z.infer<typeof batchScoringResponseSchema>;

/**
 * Human override schema for correcting AI scores
 */
export const scoreOverrideSchema = z.object({
  leadId: z.string().uuid(),
  overrideScore: z.number().int().min(0).max(100),
  reason: z.string().min(10).max(500),
  overriddenBy: z.string().uuid(),
});

export type ScoreOverride = z.infer<typeof scoreOverrideSchema>;
