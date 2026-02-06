/**
 * Home Page Router
 *
 * Provides type-safe tRPC endpoints for the authenticated home page:
 * - Welcome summary with daily stats
 * - AI insights
 * - Activity feed (paginated)
 * - Daily goal progress
 * - Pinned items management
 *
 * Task: IFC-182 - Home Page tRPC Router
 * KPIs: All endpoints <200ms; test coverage >=90%
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { type Context } from '../../context';
import {
  activityFeedQuerySchema,
  pinItemInputSchema,
  unpinItemInputSchema,
  reorderPinnedItemsInputSchema,
  type WelcomeSummary,
  type AIInsightsResponse,
  type ActivityFeedResponse,
  type DailyGoalResponse,
  type PinnedItemsResponse,
} from '@intelliflow/validators';

// =============================================================================
// Helper Functions
// =============================================================================

function getTenantId(ctx: Context): string {
  if (!ctx.user?.tenantId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Tenant ID not found in user context',
    });
  }
  return ctx.user.tenantId;
}

function getUserId(ctx: Context): string {
  if (!ctx.user?.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'User ID not found in context',
    });
  }
  return ctx.user.userId;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const lastPart = parts.at(-1);
  return (parts[0][0] + (lastPart?.[0] ?? '')).toUpperCase();
}

// =============================================================================
// Router Implementation
// =============================================================================

export const homeRouter = createTRPCRouter({
  /**
   * Get welcome summary for authenticated home page
   * Uses progressive time fallbacks for meaningful data display
   */
  getWelcomeSummary: protectedProcedure.query(async ({ ctx }): Promise<WelcomeSummary> => {
    const startTime = performance.now();
    const tenantId = getTenantId(ctx);
    const userId = getUserId(ctx);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Fetch user name
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // Parallel fetch all stats with multiple time periods for fallbacks
    const [
      highPriorityTasks,
      overdueTasks,
      newLeadsSinceYesterday,
      newLeadsThisWeek,
      newLeadsThisMonth,
      totalLeads,
      appointmentsToday,
      dealsClosedThisWeek,
      dealsClosedLastWeek,
      dealsClosedThisMonth,
      dealsClosedLastMonth,
    ] = await Promise.all([
      // High priority tasks not completed
      ctx.prisma.task.count({
        where: {
          ownerId: userId,
          priority: 'HIGH',
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      // Overdue tasks
      ctx.prisma.task.count({
        where: {
          ownerId: userId,
          dueDate: { lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      // New leads since yesterday
      ctx.prisma.lead.count({
        where: {
          tenantId,
          ownerId: userId,
          createdAt: { gte: yesterdayStart },
        },
      }),
      // New leads this week
      ctx.prisma.lead.count({
        where: {
          tenantId,
          ownerId: userId,
          createdAt: { gte: weekAgo },
        },
      }),
      // New leads this month
      ctx.prisma.lead.count({
        where: {
          tenantId,
          ownerId: userId,
          createdAt: { gte: monthAgo },
        },
      }),
      // Total leads (all time)
      ctx.prisma.lead.count({
        where: {
          tenantId,
          ownerId: userId,
        },
      }),
      // Appointments today
      ctx.prisma.appointment.count({
        where: {
          OR: [{ organizerId: userId }, { attendees: { some: { userId } } }],
          startTime: { gte: todayStart },
          endTime: { lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      }),
      // Deals closed this week
      ctx.prisma.opportunity.count({
        where: {
          tenantId,
          ownerId: userId,
          stage: 'CLOSED_WON',
          closedAt: { gte: weekAgo },
        },
      }),
      // Deals closed last week (for comparison)
      ctx.prisma.opportunity.count({
        where: {
          tenantId,
          ownerId: userId,
          stage: 'CLOSED_WON',
          closedAt: { gte: twoWeeksAgo, lt: weekAgo },
        },
      }),
      // Deals closed this month
      ctx.prisma.opportunity.count({
        where: {
          tenantId,
          ownerId: userId,
          stage: 'CLOSED_WON',
          closedAt: { gte: monthAgo },
        },
      }),
      // Deals closed last month (for comparison)
      ctx.prisma.opportunity.count({
        where: {
          tenantId,
          ownerId: userId,
          stage: 'CLOSED_WON',
          closedAt: { gte: twoMonthsAgo, lt: monthAgo },
        },
      }),
    ]);

    // Progressive fallback for leads: yesterday -> this week -> this month -> all time
    let newLeadsCount = 0;
    let newLeadsPeriod: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' = 'yesterday';

    if (newLeadsSinceYesterday > 0) {
      newLeadsCount = newLeadsSinceYesterday;
      newLeadsPeriod = 'yesterday';
    } else if (newLeadsThisWeek > 0) {
      newLeadsCount = newLeadsThisWeek;
      newLeadsPeriod = 'this_week';
    } else if (newLeadsThisMonth > 0) {
      newLeadsCount = newLeadsThisMonth;
      newLeadsPeriod = 'this_month';
    } else if (totalLeads > 0) {
      newLeadsCount = totalLeads;
      newLeadsPeriod = 'all_time';
    }

    // Progressive fallback for deal trends: weekly -> monthly
    let dealClosingRateTrend = 0;
    let dealsTrendPeriod: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' = 'this_week';

    // Try weekly comparison first
    if (dealsClosedLastWeek > 0) {
      dealClosingRateTrend = Math.round(
        ((dealsClosedThisWeek - dealsClosedLastWeek) / dealsClosedLastWeek) * 100
      );
      dealsTrendPeriod = 'this_week';
    } else if (dealsClosedThisWeek > 0) {
      dealClosingRateTrend = 100; // Infinite improvement from 0
      dealsTrendPeriod = 'this_week';
    } else if (dealsClosedLastMonth > 0) {
      // Fall back to monthly comparison
      dealClosingRateTrend = Math.round(
        ((dealsClosedThisMonth - dealsClosedLastMonth) / dealsClosedLastMonth) * 100
      );
      dealsTrendPeriod = 'this_month';
    } else if (dealsClosedThisMonth > 0) {
      dealClosingRateTrend = 100;
      dealsTrendPeriod = 'this_month';
    }

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[home.getWelcomeSummary] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      userName: user?.name || user?.email?.split('@')[0] || 'User',
      greeting: getGreeting(),
      todayDate: now,
      stats: {
        highPriorityTasksCount: highPriorityTasks,
        newLeadsCount,
        newLeadsPeriod,
        dealClosingRateTrend,
        dealsTrendPeriod,
        appointmentsToday,
        overdueTasksCount: overdueTasks,
      },
    };
  }),

  /**
   * Get AI insights for home page
   */
  getAIInsights: protectedProcedure.query(async ({ ctx }): Promise<AIInsightsResponse> => {
    const startTime = performance.now();
    const tenantId = getTenantId(ctx);
    const userId = getUserId(ctx);
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const insights: AIInsightsResponse['insights'] = [];

    // Check for deals at risk (no interaction in 14+ days)
    const dealsAtRisk = await ctx.prisma.opportunity.findMany({
      where: {
        tenantId,
        ownerId: userId,
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        updatedAt: { lt: twoWeeksAgo },
      },
      take: 3,
      select: { id: true, name: true, updatedAt: true },
    });

    dealsAtRisk.forEach((deal) => {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - deal.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
      );
      insights.push({
        id: `deal-risk-${deal.id}`,
        type: 'warning',
        title: `Deal at Risk: ${deal.name}`,
        description: `Last interaction was ${daysSinceUpdate} days ago. Consider scheduling a follow-up.`,
        suggestedAction: 'Schedule a check-in call',
        entityType: 'opportunity',
        entityId: deal.id,
        actionUrl: `/deals/${deal.id}`,
        priority: 'high',
        createdAt: now,
      });
    });

    // Check for hot leads (high score, not converted)
    const hotLeads = await ctx.prisma.lead.findMany({
      where: {
        tenantId,
        ownerId: userId,
        score: { gte: 80 },
        status: { notIn: ['CONVERTED', 'LOST'] },
      },
      take: 2,
      select: { id: true, firstName: true, lastName: true, company: true, score: true },
    });

    hotLeads.forEach((lead) => {
      const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.company || 'Lead';
      insights.push({
        id: `hot-lead-${lead.id}`,
        type: 'opportunity',
        title: 'Hot Lead Detected',
        description: `${name} has a high score of ${lead.score}. This lead shows strong buying signals.`,
        suggestedAction: 'Send personalized follow-up',
        entityType: 'lead',
        entityId: lead.id,
        actionUrl: `/leads/${lead.id}`,
        priority: 'high',
        createdAt: now,
      });
    });

    // Check for overdue tasks
    const overdueTasksCount = await ctx.prisma.task.count({
      where: {
        ownerId: userId,
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    });

    if (overdueTasksCount > 0) {
      insights.push({
        id: `overdue-tasks`,
        type: 'reminder',
        title: `${overdueTasksCount} Overdue Task${overdueTasksCount > 1 ? 's' : ''}`,
        description: `You have tasks past their due date. Review and update your task list.`,
        suggestedAction: 'Review overdue tasks',
        entityType: null,
        entityId: null,
        actionUrl: '/tasks?filter=overdue',
        priority: 'medium',
        createdAt: now,
      });
    }

    // Add achievement if no urgent items
    if (insights.length === 0) {
      insights.push({
        id: 'all-good',
        type: 'achievement',
        title: "You're on track!",
        description: 'No urgent items need your attention. Keep up the great work!',
        suggestedAction: null,
        entityType: null,
        entityId: null,
        actionUrl: null,
        priority: 'low',
        createdAt: now,
      });
    }

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[home.getAIInsights] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      insights: insights.slice(0, 5), // Max 5 insights
      lastRefreshed: now,
    };
  }),

  /**
   * Get activity feed for home page
   */
  getActivityFeed: protectedProcedure
    .input(activityFeedQuerySchema)
    .query(async ({ ctx, input }): Promise<ActivityFeedResponse> => {
      const startTime = performance.now();
      const tenantId = getTenantId(ctx);
      const userId = getUserId(ctx);
      const { limit, cursor } = input;

      // Build where clause for audit log entries (consolidated table per ADR-008)
      // Filter by tenant (required for multi-tenancy) and optionally by user
      const where: any = {
        tenantId, // Required: tenant isolation
        OR: [
          { actorId: userId }, // User's own actions
          // Future: add mentionedUserIds via metadata JSON field
        ],
      };

      if (cursor) {
        where.id = { lt: cursor };
      }

      // Fetch from audit log entries (comprehensive table)
      const auditLogs = await ctx.prisma.auditLogEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      });

      const hasMore = auditLogs.length > limit;
      const items = auditLogs.slice(0, limit);

      // Map to activity feed items
      const feedItems = items.map((log) => {
        // Determine activity type from eventType or action
        type FeedType = 'mention' | 'call' | 'email' | 'task' | 'deal' | 'lead' | 'system' | 'ai';
        let type: FeedType = 'system';
        const eventType = log.eventType.toLowerCase();

        if (eventType.includes('mention')) type = 'mention';
        else if (eventType.includes('call')) type = 'call';
        else if (eventType.includes('email')) type = 'email';
        else if (eventType.includes('task')) type = 'task';
        else if (eventType.includes('deal') || eventType.includes('opportunity')) type = 'deal';
        else if (eventType.includes('lead')) type = 'lead';
        else if (eventType.includes('ai') || eventType.includes('agent') || log.actorType === 'AI_AGENT') type = 'ai';

        return {
          id: log.id,
          type,
          title: log.eventType,
          description: `${log.resourceType} ${log.resourceId}`,
          timestamp: log.timestamp,
          relativeTime: getRelativeTime(log.timestamp),
          actor: (log.actorId || (log as any).user)
            ? {
                id: log.actorId ?? (log as any).user?.id ?? '',
                name: (log as any).user?.name ?? log.actorEmail ?? log.actorId ?? '',
                avatarUrl: (log as any).user?.avatarUrl ?? null,
                initials: getInitials((log as any).user?.name ?? log.actorEmail),
              }
            : null,
          attachment: null,
          badges: [],
          actionUrl: log.resourceId ? `/${log.resourceType?.toLowerCase()}s/${log.resourceId}` : null,
          isActionable: false,
        };
      });

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[home.getActivityFeed] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        items: feedItems,
        nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
        hasMore,
      };
    }),

  /**
   * Get daily goal progress
   */
  getDailyGoal: protectedProcedure.query(async ({ ctx }): Promise<DailyGoalResponse> => {
    const startTime = performance.now();
    const tenantId = getTenantId(ctx);
    const userId = getUserId(ctx);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Get deals closed today (revenue goal)
    const todayRevenue = await ctx.prisma.opportunity.aggregate({
      where: {
        tenantId,
        ownerId: userId,
        stage: 'CLOSED_WON',
        closedAt: { gte: todayStart, lt: todayEnd },
      },
      _sum: { value: true },
    });

    const currentValue = Number(todayRevenue._sum.value) || 0;
    const targetValue = 5000; // Default daily target, could be fetched from user settings
    const progress = Math.min(100, Math.round((currentValue / targetValue) * 100));
    const remainingToTarget = Math.max(0, targetValue - currentValue);

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[home.getDailyGoal] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      goal: {
        id: 'daily-revenue',
        type: 'revenue',
        label: 'Sales',
        targetValue,
        currentValue,
        unit: '$',
        progress,
        remainingToTarget,
        remainingFormatted: `$${remainingToTarget.toLocaleString()}`,
      },
      lastUpdated: now,
    };
  }),

  /**
   * Get pinned items
   */
  getPinnedItems: protectedProcedure.query(async ({ ctx }): Promise<PinnedItemsResponse> => {
    const userId = getUserId(ctx);

    // Get pinned items from user preferences
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const pinnedItems = prefs.pinnedItems || [];

    return {
      items: pinnedItems.map((item: any, index: number) => ({
        id: item.id || `pin-${index}`,
        entityType: item.entityType,
        entityId: item.entityId,
        title: item.title,
        subtitle: item.subtitle || null,
        icon: item.icon || null,
        url: item.url,
        pinnedAt: item.pinnedAt ? new Date(item.pinnedAt) : new Date(),
        position: index,
      })),
      maxItems: 10,
    };
  }),

  /**
   * Pin an item
   */
  pinItem: protectedProcedure.input(pinItemInputSchema).mutation(async ({ ctx, input }) => {
    const userId = getUserId(ctx);
    const { entityType, entityId, title, subtitle, icon, url } = input;

    // Get current preferences
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const pinnedItems = prefs.pinnedItems || [];

    // Check if already pinned
    if (pinnedItems.some((p: any) => p.entityType === entityType && p.entityId === entityId)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Item is already pinned',
      });
    }

    // Check max items
    if (pinnedItems.length >= 10) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Maximum of 10 pinned items allowed',
      });
    }

    // Add new pinned item
    pinnedItems.push({
      id: `pin-${Date.now()}`,
      entityType,
      entityId,
      title,
      subtitle,
      icon,
      url,
      pinnedAt: new Date().toISOString(),
    });

    // Update user preferences
    await ctx.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: { ...prefs, pinnedItems },
      },
    });

    return { success: true, message: 'Item pinned successfully' };
  }),

  /**
   * Unpin an item
   */
  unpinItem: protectedProcedure.input(unpinItemInputSchema).mutation(async ({ ctx, input }) => {
    const userId = getUserId(ctx);
    const { entityType, entityId } = input;

    // Get current preferences
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const pinnedItems = prefs.pinnedItems || [];

    // Remove item
    const newPinnedItems = pinnedItems.filter(
      (p: any) => !(p.entityType === entityType && p.entityId === entityId)
    );

    if (newPinnedItems.length === pinnedItems.length) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Pinned item not found',
      });
    }

    // Update user preferences
    await ctx.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: { ...prefs, pinnedItems: newPinnedItems },
      },
    });

    return { success: true, message: 'Item unpinned successfully' };
  }),

  /**
   * Reorder pinned items
   */
  reorderPinnedItems: protectedProcedure
    .input(reorderPinnedItemsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const { items: newOrder } = input;

      // Get current preferences
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      const prefs = (user?.preferences as any) || {};
      const pinnedItems = prefs.pinnedItems || [];

      // Reorder items
      const reorderedItems = newOrder
        .map((orderItem) => {
          const existing = pinnedItems.find(
            (p: any) =>
              p.entityType === orderItem.entityType && p.entityId === orderItem.entityId
          );
          return existing ? { ...existing, position: orderItem.position } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.position - b.position);

      // Update user preferences
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          preferences: { ...prefs, pinnedItems: reorderedItems },
        },
      });

      return { success: true, message: 'Pinned items reordered successfully' };
    }),
});

export type HomeRouter = typeof homeRouter;
