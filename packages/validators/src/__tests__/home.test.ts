/**
 * Home Page Validators Tests
 *
 * Comprehensive tests for home page Zod schemas:
 * - Welcome summary, AI insights, Activity feed
 * - Daily goals, Pinned items (CRUD)
 *
 * Task: IFC-182 - Home Page tRPC Router
 * Target: ≥95% coverage
 */

import { describe, it, expect } from 'vitest';
import {
  welcomeSummarySchema,
  aiInsightTypeSchema,
  aiInsightSchema,
  aiInsightsResponseSchema,
  activityFeedTypeSchema,
  activityFeedItemSchema,
  activityFeedQuerySchema,
  activityFeedResponseSchema,
  dailyGoalSchema,
  dailyGoalResponseSchema,
  pinnableEntityTypeSchema,
  pinnedItemSchema,
  pinnedItemsResponseSchema,
  pinItemInputSchema,
  unpinItemInputSchema,
  reorderPinnedItemsInputSchema,
  AI_INSIGHT_TYPES,
  ACTIVITY_FEED_TYPES,
  PINNABLE_ENTITY_TYPES,
} from '../home';

describe('Home Page Validators', () => {
  // =============================================================================
  // Welcome Summary Schema
  // =============================================================================
  describe('welcomeSummarySchema', () => {
    it('validates complete welcome summary', () => {
      const result = welcomeSummarySchema.safeParse({
        userName: 'John Doe',
        greeting: 'Good morning',
        todayDate: new Date(),
        stats: {
          highPriorityTasksCount: 5,
          newLeadsCount: 10,
          newLeadsPeriod: 'yesterday',
          dealClosingRateTrend: 15,
          dealsTrendPeriod: 'this_week',
          appointmentsToday: 3,
          overdueTasksCount: 2,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing userName', () => {
      const result = welcomeSummarySchema.safeParse({
        greeting: 'Good morning',
        todayDate: new Date(),
        stats: {
          highPriorityTasksCount: 0,
          newLeadsCount: 0,
          newLeadsPeriod: 'yesterday',
          dealClosingRateTrend: 0,
          dealsTrendPeriod: 'this_week',
          appointmentsToday: 0,
          overdueTasksCount: 0,
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid stats structure', () => {
      const result = welcomeSummarySchema.safeParse({
        userName: 'John',
        greeting: 'Hi',
        todayDate: new Date(),
        stats: {
          // Missing required fields
          highPriorityTasksCount: 5,
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts negative dealClosingRateTrend', () => {
      const result = welcomeSummarySchema.safeParse({
        userName: 'John',
        greeting: 'Hello',
        todayDate: new Date(),
        stats: {
          highPriorityTasksCount: 0,
          newLeadsCount: 0,
          newLeadsPeriod: 'this_week',
          dealClosingRateTrend: -25, // Negative trend
          dealsTrendPeriod: 'this_month',
          appointmentsToday: 0,
          overdueTasksCount: 0,
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates all stats period values', () => {
      const periods = ['today', 'yesterday', 'this_week', 'this_month', 'all_time'] as const;
      for (const period of periods) {
        const result = welcomeSummarySchema.safeParse({
          userName: 'John',
          greeting: 'Hello',
          todayDate: new Date(),
          stats: {
            highPriorityTasksCount: 0,
            newLeadsCount: 5,
            newLeadsPeriod: period,
            dealClosingRateTrend: 10,
            dealsTrendPeriod: period,
            appointmentsToday: 0,
            overdueTasksCount: 0,
          },
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid period values', () => {
      const result = welcomeSummarySchema.safeParse({
        userName: 'John',
        greeting: 'Hello',
        todayDate: new Date(),
        stats: {
          highPriorityTasksCount: 0,
          newLeadsCount: 5,
          newLeadsPeriod: 'invalid_period',
          dealClosingRateTrend: 10,
          dealsTrendPeriod: 'this_week',
          appointmentsToday: 0,
          overdueTasksCount: 0,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // AI Insight Schemas
  // =============================================================================
  describe('AI_INSIGHT_TYPES', () => {
    it('contains all expected insight types', () => {
      expect(AI_INSIGHT_TYPES).toEqual(['warning', 'opportunity', 'reminder', 'achievement']);
    });
  });

  describe('aiInsightTypeSchema', () => {
    it('validates all AI insight types', () => {
      expect(aiInsightTypeSchema.safeParse('warning').success).toBe(true);
      expect(aiInsightTypeSchema.safeParse('opportunity').success).toBe(true);
      expect(aiInsightTypeSchema.safeParse('reminder').success).toBe(true);
      expect(aiInsightTypeSchema.safeParse('achievement').success).toBe(true);
    });

    it('rejects invalid insight types', () => {
      expect(aiInsightTypeSchema.safeParse('invalid').success).toBe(false);
      expect(aiInsightTypeSchema.safeParse('').success).toBe(false);
      expect(aiInsightTypeSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('aiInsightSchema', () => {
    it('validates complete AI insight', () => {
      const result = aiInsightSchema.safeParse({
        id: 'insight-1',
        type: 'warning',
        title: 'Deal at Risk',
        description: 'No activity in 14 days',
        suggestedAction: 'Schedule a follow-up call',
        entityType: 'opportunity',
        entityId: '123',
        actionUrl: '/deals/123',
        priority: 'high',
        createdAt: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it('validates insight with minimal fields', () => {
      const result = aiInsightSchema.safeParse({
        id: 'insight-1',
        type: 'achievement',
        title: 'Great job!',
        description: 'All tasks completed',
        priority: 'low',
        createdAt: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts null for optional fields', () => {
      const result = aiInsightSchema.safeParse({
        id: 'insight-1',
        type: 'reminder',
        title: 'Reminder',
        description: 'Check your tasks',
        suggestedAction: null,
        entityType: null,
        entityId: null,
        actionUrl: null,
        priority: 'medium',
        createdAt: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it('defaults priority to medium', () => {
      const result = aiInsightSchema.parse({
        id: 'insight-1',
        type: 'opportunity',
        title: 'Hot Lead',
        description: 'High score lead',
        createdAt: new Date(),
      });
      expect(result.priority).toBe('medium');
    });

    it('rejects invalid priority', () => {
      const result = aiInsightSchema.safeParse({
        id: 'insight-1',
        type: 'warning',
        title: 'Test',
        description: 'Test',
        priority: 'urgent', // Invalid
        createdAt: new Date(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('aiInsightsResponseSchema', () => {
    it('validates insights response', () => {
      const result = aiInsightsResponseSchema.safeParse({
        insights: [
          {
            id: '1',
            type: 'warning',
            title: 'Test',
            description: 'Test',
            priority: 'high',
            createdAt: new Date(),
          },
        ],
        lastRefreshed: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it('validates empty insights array', () => {
      const result = aiInsightsResponseSchema.safeParse({
        insights: [],
        lastRefreshed: new Date(),
      });
      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // Activity Feed Schemas
  // =============================================================================
  describe('ACTIVITY_FEED_TYPES', () => {
    it('contains all expected feed types', () => {
      expect(ACTIVITY_FEED_TYPES).toEqual([
        'mention',
        'call',
        'email',
        'task',
        'deal',
        'lead',
        'system',
        'ai',
      ]);
    });
  });

  describe('activityFeedTypeSchema', () => {
    it('validates all activity feed types', () => {
      for (const type of ACTIVITY_FEED_TYPES) {
        expect(activityFeedTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('rejects invalid feed types', () => {
      expect(activityFeedTypeSchema.safeParse('invalid').success).toBe(false);
      expect(activityFeedTypeSchema.safeParse('notification').success).toBe(false);
    });
  });

  describe('activityFeedItemSchema', () => {
    it('validates complete feed item', () => {
      const result = activityFeedItemSchema.safeParse({
        id: 'feed-1',
        type: 'mention',
        title: 'New mention',
        description: 'John mentioned you',
        timestamp: new Date(),
        relativeTime: '5m ago',
        actor: {
          id: 'user-1',
          name: 'John Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
          initials: 'JD',
        },
        attachment: {
          name: 'document.pdf',
          type: 'application/pdf',
          url: 'https://example.com/doc.pdf',
        },
        badges: [{ id: 'badge-1', label: 'Important', variant: 'warning' }],
        actionUrl: '/messages/123',
        isActionable: true,
      });
      expect(result.success).toBe(true);
    });

    it('validates minimal feed item', () => {
      const result = activityFeedItemSchema.safeParse({
        id: 'feed-1',
        type: 'system',
        title: 'System notification',
        description: 'Database maintenance',
        timestamp: new Date(),
        relativeTime: '1h ago',
      });
      expect(result.success).toBe(true);
    });

    it('accepts null actor', () => {
      const result = activityFeedItemSchema.safeParse({
        id: 'feed-1',
        type: 'ai',
        title: 'AI generated',
        description: 'Score updated',
        timestamp: new Date(),
        relativeTime: 'Just now',
        actor: null,
      });
      expect(result.success).toBe(true);
    });

    it('validates badge variants', () => {
      const variants = ['success', 'warning', 'info', 'default'];
      for (const variant of variants) {
        const result = activityFeedItemSchema.safeParse({
          id: 'feed-1',
          type: 'task',
          title: 'Task',
          description: 'Test',
          timestamp: new Date(),
          relativeTime: 'Now',
          badges: [{ id: '1', label: 'Test', variant }],
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid badge variant', () => {
      const result = activityFeedItemSchema.safeParse({
        id: 'feed-1',
        type: 'task',
        title: 'Task',
        description: 'Test',
        timestamp: new Date(),
        relativeTime: 'Now',
        badges: [{ id: '1', label: 'Test', variant: 'invalid' }],
      });
      expect(result.success).toBe(false);
    });

    it('defaults isActionable to false', () => {
      const result = activityFeedItemSchema.parse({
        id: 'feed-1',
        type: 'system',
        title: 'Test',
        description: 'Test',
        timestamp: new Date(),
        relativeTime: 'Now',
      });
      expect(result.isActionable).toBe(false);
    });
  });

  describe('activityFeedQuerySchema', () => {
    it('validates query with defaults', () => {
      const result = activityFeedQuerySchema.parse({});
      expect(result.limit).toBe(10);
      expect(result.cursor).toBeUndefined();
    });

    it('validates query with custom limit', () => {
      const result = activityFeedQuerySchema.parse({ limit: 25 });
      expect(result.limit).toBe(25);
    });

    it('validates query with cursor', () => {
      const result = activityFeedQuerySchema.parse({
        limit: 10,
        cursor: 'cursor-123',
      });
      expect(result.cursor).toBe('cursor-123');
    });

    it('validates query with type filter', () => {
      const result = activityFeedQuerySchema.parse({
        types: ['mention', 'email', 'call'],
      });
      expect(result.types).toEqual(['mention', 'email', 'call']);
    });

    it('rejects limit below minimum', () => {
      const result = activityFeedQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects limit above maximum', () => {
      const result = activityFeedQuerySchema.safeParse({ limit: 100 });
      expect(result.success).toBe(false);
    });

    it('rejects invalid type in types array', () => {
      const result = activityFeedQuerySchema.safeParse({
        types: ['mention', 'invalid'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('activityFeedResponseSchema', () => {
    it('validates response with items', () => {
      const result = activityFeedResponseSchema.safeParse({
        items: [
          {
            id: '1',
            type: 'lead',
            title: 'New lead',
            description: 'Created',
            timestamp: new Date(),
            relativeTime: '5m ago',
          },
        ],
        nextCursor: 'cursor-1',
        hasMore: true,
      });
      expect(result.success).toBe(true);
    });

    it('validates empty response', () => {
      const result = activityFeedResponseSchema.safeParse({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // Daily Goal Schemas
  // =============================================================================
  describe('dailyGoalSchema', () => {
    it('validates complete daily goal', () => {
      const result = dailyGoalSchema.safeParse({
        id: 'goal-1',
        type: 'revenue',
        label: 'Daily Sales',
        targetValue: 5000,
        currentValue: 2500,
        unit: '$',
        progress: 50,
        remainingToTarget: 2500,
        remainingFormatted: '$2,500',
      });
      expect(result.success).toBe(true);
    });

    it('validates all goal types', () => {
      const types = ['revenue', 'calls', 'meetings', 'tasks', 'custom'];
      for (const type of types) {
        const result = dailyGoalSchema.safeParse({
          id: 'goal-1',
          type,
          label: 'Test',
          targetValue: 100,
          currentValue: 50,
          unit: 'units',
          progress: 50,
          remainingToTarget: 50,
          remainingFormatted: '50 units',
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects progress below 0', () => {
      const result = dailyGoalSchema.safeParse({
        id: 'goal-1',
        type: 'revenue',
        label: 'Test',
        targetValue: 100,
        currentValue: -10,
        unit: '$',
        progress: -10,
        remainingToTarget: 110,
        remainingFormatted: '$110',
      });
      expect(result.success).toBe(false);
    });

    it('rejects progress above 100', () => {
      const result = dailyGoalSchema.safeParse({
        id: 'goal-1',
        type: 'revenue',
        label: 'Test',
        targetValue: 100,
        currentValue: 150,
        unit: '$',
        progress: 150, // Should be capped at 100
        remainingToTarget: 0,
        remainingFormatted: '$0',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid goal type', () => {
      const result = dailyGoalSchema.safeParse({
        id: 'goal-1',
        type: 'invalid',
        label: 'Test',
        targetValue: 100,
        currentValue: 50,
        unit: 'units',
        progress: 50,
        remainingToTarget: 50,
        remainingFormatted: '50',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dailyGoalResponseSchema', () => {
    it('validates goal response', () => {
      const result = dailyGoalResponseSchema.safeParse({
        goal: {
          id: 'goal-1',
          type: 'revenue',
          label: 'Sales',
          targetValue: 5000,
          currentValue: 0,
          unit: '$',
          progress: 0,
          remainingToTarget: 5000,
          remainingFormatted: '$5,000',
        },
        lastUpdated: new Date(),
      });
      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // Pinned Items Schemas
  // =============================================================================
  describe('PINNABLE_ENTITY_TYPES', () => {
    it('contains all expected entity types', () => {
      expect(PINNABLE_ENTITY_TYPES).toEqual([
        'lead',
        'contact',
        'account',
        'opportunity',
        'ticket',
        'document',
        'report',
        'list',
      ]);
    });
  });

  describe('pinnableEntityTypeSchema', () => {
    it('validates all pinnable entity types', () => {
      for (const type of PINNABLE_ENTITY_TYPES) {
        expect(pinnableEntityTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('rejects invalid entity types', () => {
      expect(pinnableEntityTypeSchema.safeParse('task').success).toBe(false);
      expect(pinnableEntityTypeSchema.safeParse('user').success).toBe(false);
    });
  });

  describe('pinnedItemSchema', () => {
    it('validates complete pinned item', () => {
      const result = pinnedItemSchema.safeParse({
        id: 'pin-1',
        entityType: 'lead',
        entityId: '123',
        title: 'Important Lead',
        subtitle: 'ACME Corp',
        icon: 'person',
        url: '/leads/123',
        pinnedAt: new Date(),
        position: 0,
      });
      expect(result.success).toBe(true);
    });

    it('validates pinned item with minimal fields', () => {
      const result = pinnedItemSchema.safeParse({
        id: 'pin-1',
        entityType: 'document',
        entityId: 'doc-1',
        title: 'Contract',
        url: '/documents/doc-1',
        pinnedAt: new Date(),
        position: 5,
      });
      expect(result.success).toBe(true);
    });

    it('accepts null for optional fields', () => {
      const result = pinnedItemSchema.safeParse({
        id: 'pin-1',
        entityType: 'report',
        entityId: 'report-1',
        title: 'Sales Report',
        subtitle: null,
        icon: null,
        url: '/reports/report-1',
        pinnedAt: new Date(),
        position: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('pinnedItemsResponseSchema', () => {
    it('validates response with items', () => {
      const result = pinnedItemsResponseSchema.safeParse({
        items: [
          {
            id: 'pin-1',
            entityType: 'lead',
            entityId: '1',
            title: 'Lead 1',
            url: '/leads/1',
            pinnedAt: new Date(),
            position: 0,
          },
        ],
        maxItems: 10,
      });
      expect(result.success).toBe(true);
    });

    it('defaults maxItems to 10', () => {
      const result = pinnedItemsResponseSchema.parse({
        items: [],
      });
      expect(result.maxItems).toBe(10);
    });
  });

  describe('pinItemInputSchema', () => {
    it('validates complete pin input', () => {
      const result = pinItemInputSchema.safeParse({
        entityType: 'opportunity',
        entityId: 'opp-123',
        title: 'Big Deal',
        subtitle: '$50,000',
        icon: 'attach_money',
        url: '/deals/opp-123',
      });
      expect(result.success).toBe(true);
    });

    it('validates pin input with required fields only', () => {
      const result = pinItemInputSchema.safeParse({
        entityType: 'contact',
        entityId: 'contact-1',
        title: 'Jane Smith',
        url: '/contacts/contact-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing entityType', () => {
      const result = pinItemInputSchema.safeParse({
        entityId: '123',
        title: 'Test',
        url: '/test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing entityId', () => {
      const result = pinItemInputSchema.safeParse({
        entityType: 'lead',
        title: 'Test',
        url: '/test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
      const result = pinItemInputSchema.safeParse({
        entityType: 'lead',
        entityId: '123',
        url: '/leads/123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing url', () => {
      const result = pinItemInputSchema.safeParse({
        entityType: 'lead',
        entityId: '123',
        title: 'Test Lead',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('unpinItemInputSchema', () => {
    it('validates unpin input', () => {
      const result = unpinItemInputSchema.safeParse({
        entityType: 'lead',
        entityId: '123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing entityType', () => {
      const result = unpinItemInputSchema.safeParse({
        entityId: '123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing entityId', () => {
      const result = unpinItemInputSchema.safeParse({
        entityType: 'lead',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('reorderPinnedItemsInputSchema', () => {
    it('validates reorder input', () => {
      const result = reorderPinnedItemsInputSchema.safeParse({
        items: [
          { entityType: 'lead', entityId: '1', position: 0 },
          { entityType: 'contact', entityId: '2', position: 1 },
          { entityType: 'report', entityId: '3', position: 2 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('validates empty items array', () => {
      const result = reorderPinnedItemsInputSchema.safeParse({
        items: [],
      });
      expect(result.success).toBe(true);
    });

    it('validates single item', () => {
      const result = reorderPinnedItemsInputSchema.safeParse({
        items: [{ entityType: 'lead', entityId: '1', position: 0 }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects item with invalid entityType', () => {
      const result = reorderPinnedItemsInputSchema.safeParse({
        items: [{ entityType: 'invalid', entityId: '1', position: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects item with missing position', () => {
      const result = reorderPinnedItemsInputSchema.safeParse({
        items: [{ entityType: 'lead', entityId: '1' }],
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Type Inference Tests (compile-time verification)
  // =============================================================================
  describe('Type Inference', () => {
    it('exports types correctly', () => {
      // These imports should exist and compile without errors
      type WelcomeSummaryType = import('../home').WelcomeSummary;
      type AIInsightType = import('../home').AIInsight;
      type AIInsightsResponseType = import('../home').AIInsightsResponse;
      type ActivityFeedItemType = import('../home').ActivityFeedItem;
      type ActivityFeedQueryType = import('../home').ActivityFeedQuery;
      type ActivityFeedResponseType = import('../home').ActivityFeedResponse;
      type DailyGoalType = import('../home').DailyGoal;
      type DailyGoalResponseType = import('../home').DailyGoalResponse;
      type PinnedItemType = import('../home').PinnedItem;
      type PinnedItemsResponseType = import('../home').PinnedItemsResponse;
      type PinItemInputType = import('../home').PinItemInput;
      type UnpinItemInputType = import('../home').UnpinItemInput;
      type ReorderPinnedItemsInputType = import('../home').ReorderPinnedItemsInput;

      // If this compiles, types are exported correctly
      expect(true).toBe(true);
    });
  });
});
