/**
 * Home Page Validation Schemas
 *
 * Zod schemas for authenticated home page API endpoints:
 * - Welcome summary with daily stats
 * - AI insights
 * - Activity feed
 * - Daily goals
 * - Pinned items
 *
 * Task: IFC-182 - Home Page tRPC Router
 */

import { z } from 'zod';

// =============================================================================
// Welcome Summary Schemas
// =============================================================================

export const STATS_PERIOD = ['today', 'yesterday', 'this_week', 'this_month', 'all_time'] as const;

export type StatsPeriod = (typeof STATS_PERIOD)[number];

export const statsPeriodSchema = z.enum(STATS_PERIOD);

export const welcomeSummarySchema = z.object({
  userName: z.string(),
  greeting: z.string(),
  todayDate: z.date(),
  stats: z.object({
    highPriorityTasksCount: z.number(),
    newLeadsCount: z.number(),
    newLeadsPeriod: statsPeriodSchema, // which time period the leads count is from
    dealClosingRateTrend: z.number(), // percentage change (e.g., 5 for +5%)
    dealsTrendPeriod: statsPeriodSchema, // which time period the trend is comparing
    appointmentsToday: z.number(),
    overdueTasksCount: z.number(),
  }),
});

export type WelcomeSummary = z.infer<typeof welcomeSummarySchema>;

// =============================================================================
// AI Insights Schemas
// =============================================================================

export const AI_INSIGHT_TYPES = ['warning', 'opportunity', 'reminder', 'achievement'] as const;

export type AIInsightType = (typeof AI_INSIGHT_TYPES)[number];

export const aiInsightTypeSchema = z.enum(AI_INSIGHT_TYPES);

export const aiInsightSchema = z.object({
  id: z.string(),
  type: aiInsightTypeSchema,
  title: z.string(),
  description: z.string(),
  suggestedAction: z.string().optional().nullable(),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  actionUrl: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  createdAt: z.date(),
});

export type AIInsight = z.infer<typeof aiInsightSchema>;

export const aiInsightsResponseSchema = z.object({
  insights: z.array(aiInsightSchema),
  lastRefreshed: z.date(),
});

export type AIInsightsResponse = z.infer<typeof aiInsightsResponseSchema>;

// =============================================================================
// Activity Feed Schemas
// =============================================================================

export const ACTIVITY_FEED_TYPES = [
  'mention',
  'call',
  'email',
  'task',
  'deal',
  'lead',
  'system',
  'ai',
] as const;

export type ActivityFeedType = (typeof ACTIVITY_FEED_TYPES)[number];

export const activityFeedTypeSchema = z.enum(ACTIVITY_FEED_TYPES);

export const activityFeedItemSchema = z.object({
  id: z.string(),
  type: activityFeedTypeSchema,
  title: z.string(),
  description: z.string(),
  timestamp: z.date(),
  relativeTime: z.string(), // e.g., "10m ago"
  actor: z
    .object({
      id: z.string(),
      name: z.string(),
      avatarUrl: z.string().optional().nullable(),
      initials: z.string(),
    })
    .optional()
    .nullable(),
  attachment: z
    .object({
      name: z.string(),
      type: z.string(),
      url: z.string().optional(),
    })
    .optional()
    .nullable(),
  badges: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        variant: z.enum(['success', 'warning', 'info', 'default']),
      })
    )
    .optional(),
  actionUrl: z.string().optional().nullable(),
  isActionable: z.boolean().default(false),
});

export type ActivityFeedItem = z.infer<typeof activityFeedItemSchema>;

export const activityFeedQuerySchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  cursor: z.string().optional(),
  types: z.array(activityFeedTypeSchema).optional(),
});

export type ActivityFeedQuery = z.infer<typeof activityFeedQuerySchema>;

export const activityFeedResponseSchema = z.object({
  items: z.array(activityFeedItemSchema),
  nextCursor: z.string().optional().nullable(),
  hasMore: z.boolean(),
});

export type ActivityFeedResponse = z.infer<typeof activityFeedResponseSchema>;

// =============================================================================
// Daily Goal Schemas
// =============================================================================

export const dailyGoalSchema = z.object({
  id: z.string(),
  type: z.enum(['revenue', 'calls', 'meetings', 'tasks', 'custom']),
  label: z.string(),
  targetValue: z.number(),
  currentValue: z.number(),
  unit: z.string(), // e.g., "$", "calls", "tasks"
  progress: z.number().min(0).max(100), // percentage
  remainingToTarget: z.number(),
  remainingFormatted: z.string(), // e.g., "$1,200"
});

export type DailyGoal = z.infer<typeof dailyGoalSchema>;

export const dailyGoalResponseSchema = z.object({
  goal: dailyGoalSchema,
  lastUpdated: z.date(),
});

export type DailyGoalResponse = z.infer<typeof dailyGoalResponseSchema>;

// =============================================================================
// Pinned Items Schemas
// =============================================================================

export const PINNABLE_ENTITY_TYPES = [
  'lead',
  'contact',
  'account',
  'opportunity',
  'document',
  'report',
  'list',
] as const;

export type PinnableEntityType = (typeof PINNABLE_ENTITY_TYPES)[number];

export const pinnableEntityTypeSchema = z.enum(PINNABLE_ENTITY_TYPES);

export const pinnedItemSchema = z.object({
  id: z.string(),
  entityType: pinnableEntityTypeSchema,
  entityId: z.string(),
  title: z.string(),
  subtitle: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  url: z.string(),
  pinnedAt: z.date(),
  position: z.number(),
});

export type PinnedItem = z.infer<typeof pinnedItemSchema>;

export const pinnedItemsResponseSchema = z.object({
  items: z.array(pinnedItemSchema),
  maxItems: z.number().default(10),
});

export type PinnedItemsResponse = z.infer<typeof pinnedItemsResponseSchema>;

export const pinItemInputSchema = z.object({
  entityType: pinnableEntityTypeSchema,
  entityId: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  icon: z.string().optional(),
  url: z.string(),
});

export type PinItemInput = z.infer<typeof pinItemInputSchema>;

export const unpinItemInputSchema = z.object({
  entityType: pinnableEntityTypeSchema,
  entityId: z.string(),
});

export type UnpinItemInput = z.infer<typeof unpinItemInputSchema>;

export const reorderPinnedItemsInputSchema = z.object({
  items: z.array(
    z.object({
      entityType: pinnableEntityTypeSchema,
      entityId: z.string(),
      position: z.number(),
    })
  ),
});

export type ReorderPinnedItemsInput = z.infer<typeof reorderPinnedItemsInputSchema>;
