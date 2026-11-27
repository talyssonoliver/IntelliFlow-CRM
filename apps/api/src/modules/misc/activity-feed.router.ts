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
import { visibleMail } from '../email/email-access';
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
import { ACTIVITY_FEED_DEFAULT_LIMIT, type ActivityFeedViewer } from '@intelliflow/domain';

/**
 * Mail feed items have ids like `email_<record id>` (register #64): a reaction or comment on one
 * is only for someone who may read that mail. Returns the ids among `ids` that are mail the
 * caller cannot read.
 */
async function unreadableMailItems(
  ctx: { prismaWithTenant: never; tenant: { tenantId: string; userId: string } },
  source: string | undefined,
  ids: string[]
): Promise<Set<string>> {
  const isMail = (id: string) => source?.toUpperCase() === 'EMAIL' || id.startsWith('email_');
  const mail = ids.filter(isMail);
  if (mail.length === 0) return new Set();
  const records = mail.map((id) => id.replace(/^email_/, ''));
  const readable = (await (ctx.prismaWithTenant as any).emailRecord.findMany({
    where: {
      id: { in: records },
      tenantId: ctx.tenant.tenantId,
      AND: [await visibleMail(ctx, records)],
    },
    select: { id: true },
  })) as { id: string }[];
  const ok = new Set(readable.map((r) => r.id));
  return new Set(mail.filter((id) => !ok.has(id.replace(/^email_/, ''))));
}

/** Who is reading the feed: its email rows follow the mail visibility policy (register #64). */
function feedViewerOf(tenant: {
  userId: string;
  role?: string | null;
  teamMemberIds?: string[];
}): ActivityFeedViewer {
  return { userId: tenant.userId, role: tenant.role ?? null, teamMemberIds: tenant.teamMemberIds };
}

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
      viewer: feedViewerOf(ctx.tenant),
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
      input.types,
      feedViewerOf(ctx.tenant)
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
      viewer: feedViewerOf(ctx.tenant),
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
        viewer: feedViewerOf(ctx.tenant),
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

    if (
      (await unreadableMailItems(ctx as never, input.activitySource, [input.activityId])).size > 0
    ) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
    }
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

    const hidden = await unreadableMailItems(ctx as never, input.activitySource, input.activityIds);
    where.activityId = { in: input.activityIds.filter((id) => !hidden.has(id)) };
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

    if (
      (await unreadableMailItems(ctx as never, input.activitySource, [input.activityId])).size > 0
    ) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
    }
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

    const hidden = await unreadableMailItems(ctx as never, input.activitySource, input.activityIds);
    where.activityId = { in: input.activityIds.filter((id) => !hidden.has(id)) };
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
