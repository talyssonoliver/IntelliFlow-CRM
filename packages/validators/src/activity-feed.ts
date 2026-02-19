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
} from '@intelliflow/domain';

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
