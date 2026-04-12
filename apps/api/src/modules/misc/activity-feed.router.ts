/**
 * Activity Feed Router
 * IFC-069: Unified Activity Feed Service
 *
 * Provides unified activity feed across all CRM entities:
 * - Lead activities, contact activities, opportunity events
 * - Ticket activities, emails, calls, chat messages
 *
 * Uses cursor-based pagination with virtual scrolling support.
 * KPIs: Response <500ms for 100+ items, <250ms for cached first page.
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  unifiedFeedQuerySchema,
  entityFeedQuerySchema,
  toggleReactionSchema,
  getReactionsSchema,
  addActivityCommentSchema,
  getActivityCommentsSchema,
  activityFeedStatsQuerySchema,
  activityFeedSearchQuerySchema,
} from '@intelliflow/validators';
import { ACTIVITY_FEED_DEFAULT_LIMIT } from '@intelliflow/domain';

export const activityFeedRouter = createTRPCRouter({
  /**
   * Get unified activity feed across all CRM entity types.
   * Supports cursor-based infinite scrolling with optional type/source filters.
   */
  getUnifiedFeed: tenantProcedure.input(unifiedFeedQuerySchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();
    const tenantId = ctx.tenant.tenantId;

    const activityFeedService = ctx.container?.activityFeedService;
    if (!activityFeedService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ActivityFeedService not available in container',
      });
    }

    const result = await activityFeedService.getUnifiedFeed(tenantId, input.limit, input.cursor, {
      types: input.types,
      sources: input.sources,
      entityType: input.entityType,
      entityId: input.entityId,
      after: input.after,
      before: input.before,
    });

    const duration = performance.now() - startTime;
    if (duration > 500) {
      console.warn(`[activityFeed.getUnifiedFeed] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
    }

    return result;
  }),

  /**
   * Get activity feed for a specific entity (lead, contact, opportunity, ticket).
   * Queries only the relevant source tables for that entity type.
   */
  getEntityFeed: tenantProcedure.input(entityFeedQuerySchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();
    const tenantId = ctx.tenant.tenantId;

    const activityFeedService = ctx.container?.activityFeedService;
    if (!activityFeedService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ActivityFeedService not available in container',
      });
    }

    const result = await activityFeedService.getEntityFeed(
      tenantId,
      input.entityType,
      input.entityId,
      input.limit,
      input.cursor,
      input.types
    );

    const duration = performance.now() - startTime;
    if (duration > 500) {
      console.warn(`[activityFeed.getEntityFeed] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
    }

    return result;
  }),

  /**
   * Get aggregate stats from the activity feed.
   * IFC-202: Counts by type, source, and entity type over configurable time windows.
   */
  getStats: tenantProcedure.input(activityFeedStatsQuerySchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const activityFeedService = ctx.container?.activityFeedService;
    if (!activityFeedService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ActivityFeedService not available in container',
      });
    }

    const startTime = performance.now();
    const result = await activityFeedService.getStats(tenantId, input.timeWindow, {
      sources: input.sources,
      entityType: input.entityType,
    });
    const duration = performance.now() - startTime;

    if (duration > 200) {
      console.warn(`[activityFeed.getStats] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return result;
  }),

  /**
   * Search activities across all sources using text matching.
   * IFC-203: Full-text search with ILIKE across titles, descriptions, and actor names.
   */
  search: tenantProcedure.input(activityFeedSearchQuerySchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const activityFeedService = ctx.container?.activityFeedService;
    if (!activityFeedService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ActivityFeedService not available in container',
      });
    }

    const startTime = performance.now();
    const result = await activityFeedService.search(
      tenantId,
      input.query.trim(),
      input.limit ?? ACTIVITY_FEED_DEFAULT_LIMIT,
      input.cursor,
      {
        types: input.types,
        sources: input.sources,
        entityType: input.entityType,
      }
    );
    const duration = performance.now() - startTime;

    if (duration > 500) {
      console.warn(`[activityFeed.search] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
    }

    return result;
  }),

  /**
   * Toggle a reaction (emoji) on an activity item.
   * If the reaction exists for (activityId, source, userId, emoji), removes it.
   * Otherwise, creates it.
   */
  toggleReaction: tenantProcedure.input(toggleReactionSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;
    const userName = ctx.user?.email ?? 'Unknown';

    const existing = await ctx.prismaWithTenant.activityReaction.findUnique({
      where: {
        activityId_activitySource_userId_emoji: {
          activityId: input.activityId,
          activitySource: input.activitySource,
          userId,
          emoji: input.emoji,
        },
      },
    });

    if (existing) {
      await ctx.prismaWithTenant.activityReaction.delete({
        where: { id: existing.id },
      });
    } else {
      await ctx.prismaWithTenant.activityReaction.create({
        data: {
          activityId: input.activityId,
          activitySource: input.activitySource,
          emoji: input.emoji,
          userId,
          userName,
          tenantId,
        },
      });
    }

    // Return updated reactions for this activity
    const reactions = await ctx.prismaWithTenant.activityReaction.findMany({
      where: {
        activityId: input.activityId,
        activitySource: input.activitySource,
        tenantId,
      },
    });

    // Group by emoji
    const grouped: Record<string, { emoji: string; count: number; users: string[] }> = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.userName);
    }

    return {
      activityId: input.activityId,
      reactions: Object.values(grouped),
    };
  }),

  /**
   * Batch-fetch reactions for multiple activity items.
   * Returns a map of activityId -> reaction groups.
   */
  getReactions: tenantProcedure.input(getReactionsSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const where: { activityId: { in: string[] }; tenantId: string; activitySource?: string } = {
      activityId: { in: input.activityIds },
      tenantId,
    };
    if (input.activitySource) {
      where.activitySource = input.activitySource;
    }

    const reactions = await ctx.prismaWithTenant.activityReaction.findMany({ where });

    // Group by activityId, then by emoji
    const result: Record<string, { emoji: string; count: number; users: string[] }[]> = {};
    for (const r of reactions) {
      if (!result[r.activityId]) {
        result[r.activityId] = [];
      }
      let group = result[r.activityId].find((g) => g.emoji === r.emoji);
      if (!group) {
        group = { emoji: r.emoji, count: 0, users: [] };
        result[r.activityId].push(group);
      }
      group.count++;
      group.users.push(r.userName);
    }

    return result;
  }),

  /**
   * Add a comment (reply) to an activity item.
   * Comments appear threaded under the activity in the timeline.
   */
  addComment: tenantProcedure.input(addActivityCommentSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;
    const userName = ctx.user?.email ?? 'Unknown';

    const comment = await ctx.prismaWithTenant.activityComment.create({
      data: {
        activityId: input.activityId,
        activitySource: input.activitySource,
        text: input.text,
        userId,
        userName,
        tenantId,
      },
    });

    return comment;
  }),

  /**
   * Batch-fetch comments for multiple activity items.
   * Returns a map of activityId -> comments[].
   */
  getComments: tenantProcedure.input(getActivityCommentsSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const where: { activityId: { in: string[] }; tenantId: string; activitySource?: string } = {
      activityId: { in: input.activityIds },
      tenantId,
    };
    if (input.activitySource) {
      where.activitySource = input.activitySource;
    }

    const comments = await ctx.prismaWithTenant.activityComment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const result: Record<string, { id: string; text: string; user: string; timestamp: string }[]> =
      {};
    for (const c of comments) {
      if (!result[c.activityId]) {
        result[c.activityId] = [];
      }
      result[c.activityId].push({
        id: c.id,
        text: c.text,
        user: c.userName,
        timestamp: c.createdAt.toISOString(),
      });
    }

    return result;
  }),
});
