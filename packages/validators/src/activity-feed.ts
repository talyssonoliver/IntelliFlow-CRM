/**
 * Activity Feed Validation Schemas
 * IFC-069: Unified Activity Feed Service
 *
 * Derives Zod schemas from domain constants (DRY principle).
 * Prefixed with "unified" to avoid conflicts with home.ts feed schemas.
 */

import { z } from 'zod';
import {
  ACTIVITY_FEED_SOURCES,
  ACTIVITY_FEED_TYPES,
  ACTIVITY_FEED_ENTITY_TYPES,
  ACTIVITY_FEED_DEFAULT_LIMIT,
  ACTIVITY_FEED_MAX_LIMIT,
  ACTIVITY_FEED_TIME_WINDOWS,
} from '@intelliflow/domain';
import type { ActivityFeedTimeWindow } from '@intelliflow/domain';

// =============================================================================
// Enum Schemas (derived from domain constants)
// =============================================================================

export const unifiedFeedSourceSchema = z.enum(ACTIVITY_FEED_SOURCES);
export const unifiedFeedTypeSchema = z.enum(ACTIVITY_FEED_TYPES);
export const unifiedFeedEntityTypeSchema = z.enum(ACTIVITY_FEED_ENTITY_TYPES);

// =============================================================================
// Query Input Schemas
// =============================================================================

/** Input schema for getUnifiedFeed */
export const unifiedFeedQuerySchema = z.object({
  limit: z.number().int().min(1).max(ACTIVITY_FEED_MAX_LIMIT).default(ACTIVITY_FEED_DEFAULT_LIMIT),
  cursor: z.string().nullish(),
  types: z.array(unifiedFeedTypeSchema).optional(),
  sources: z.array(unifiedFeedSourceSchema).optional(),
  entityType: unifiedFeedEntityTypeSchema.optional(),
  entityId: z.string().optional(),
  after: z.date().optional(),
  before: z.date().optional(),
});

export type UnifiedFeedQueryInput = z.infer<typeof unifiedFeedQuerySchema>;

/** Input schema for getEntityFeed (single entity's activities) */
export const entityFeedQuerySchema = z.object({
  entityType: unifiedFeedEntityTypeSchema,
  entityId: z.string(),
  limit: z.number().int().min(1).max(ACTIVITY_FEED_MAX_LIMIT).default(ACTIVITY_FEED_DEFAULT_LIMIT),
  cursor: z.string().nullish(),
  types: z.array(unifiedFeedTypeSchema).optional(),
});

export type EntityFeedQueryInput = z.infer<typeof entityFeedQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const activityActorSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

export const activityEntitySchema = z.object({
  id: z.string(),
  type: unifiedFeedEntityTypeSchema,
  name: z.string(),
});

export const unifiedActivityItemSchema = z.object({
  id: z.string(),
  source: unifiedFeedSourceSchema,
  type: unifiedFeedTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  timestamp: z.date(),
  actor: activityActorSchema.nullable(),
  entity: activityEntitySchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

export type UnifiedActivityItemOutput = z.infer<typeof unifiedActivityItemSchema>;

export const unifiedFeedPageSchema = z.object({
  items: z.array(unifiedActivityItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type UnifiedFeedPageOutput = z.infer<typeof unifiedFeedPageSchema>;

// =============================================================================
// Reaction Schemas
// =============================================================================

// =============================================================================
// Comment Schemas
// =============================================================================

/** Input for adding a comment (reply) to an activity */
export const addActivityCommentSchema = z.object({
  activityId: z.string().min(1),
  activitySource: z.string().min(1),
  text: z.string().min(1).max(5000),
});
export type AddActivityCommentInput = z.infer<typeof addActivityCommentSchema>;

/** Input for fetching comments on activities */
export const getActivityCommentsSchema = z.object({
  activityIds: z.array(z.string().min(1)).min(1).max(100),
  activitySource: z.string().optional(),
});
export type GetActivityCommentsInput = z.infer<typeof getActivityCommentsSchema>;

// =============================================================================
// Reaction Schemas
// =============================================================================

/** Input for toggling a reaction on an activity */
export const toggleReactionSchema = z.object({
  activityId: z.string().min(1),
  activitySource: z.string().min(1),
  emoji: z.string().min(1).max(10),
});
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;

/** Input for batch-fetching reactions for multiple activities */
export const getReactionsSchema = z.object({
  activityIds: z.array(z.string().min(1)).min(1).max(100),
  activitySource: z.string().optional(),
});
export type GetReactionsInput = z.infer<typeof getReactionsSchema>;

// =============================================================================
// Stats Schemas (IFC-202)
// =============================================================================

/** Input schema for getStats — activity feed statistics aggregation */
export const activityFeedStatsQuerySchema = z.object({
  timeWindow: z.enum(ACTIVITY_FEED_TIME_WINDOWS).default('7d'),
  sources: z.array(unifiedFeedSourceSchema).optional(),
  entityType: unifiedFeedEntityTypeSchema.optional(),
});

export type ActivityFeedStatsQueryInput = z.infer<typeof activityFeedStatsQuerySchema>;

/** Response schema for getStats */
export const activityFeedStatsResponseSchema = z.object({
  timeWindow: z.enum(ACTIVITY_FEED_TIME_WINDOWS),
  windowStart: z.date().nullable(),
  windowEnd: z.date(),
  total: z.number().int().min(0),
  byType: z.array(
    z.object({
      type: unifiedFeedTypeSchema,
      count: z.number().int().min(0),
    })
  ),
  bySource: z.array(
    z.object({
      source: unifiedFeedSourceSchema,
      count: z.number().int().min(0),
    })
  ),
  byEntityType: z.array(
    z.object({
      entityType: unifiedFeedEntityTypeSchema,
      count: z.number().int().min(0),
    })
  ),
});

export type ActivityFeedStatsResponseOutput = z.infer<typeof activityFeedStatsResponseSchema>;

// =============================================================================
// Search Schemas (IFC-203)
// =============================================================================

/** Input schema for search — full-text search across activity feed */
export const activityFeedSearchQuerySchema = z.object({
  query: z.string().min(1).max(500).trim(),
  limit: z.number().int().min(1).max(ACTIVITY_FEED_MAX_LIMIT).default(ACTIVITY_FEED_DEFAULT_LIMIT),
  cursor: z.string().nullish(),
  types: z.array(unifiedFeedTypeSchema).optional(),
  sources: z.array(unifiedFeedSourceSchema).optional(),
  entityType: unifiedFeedEntityTypeSchema.optional(),
});

export type ActivityFeedSearchQueryInput = z.infer<typeof activityFeedSearchQuerySchema>;
