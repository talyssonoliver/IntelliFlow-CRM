/**
 * Home Page Router
 *
 * Provides type-safe tRPC endpoints for the authenticated home page:
 * - Welcome summary with daily stats
 * - AI insights
 * - Daily goal progress
 * - Pinned items management
 *
 * Note: Activity feed is served by activityFeed.getUnifiedFeed (IFC-069).
 *
 * Task: IFC-182 - Home Page tRPC Router
 * KPIs: All endpoints <200ms; test coverage >=90%
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { type Context } from '../../context';
import {
  pinItemInputSchema,
  unpinItemInputSchema,
  reorderPinnedItemsInputSchema,
  type WelcomeSummary,
  type AIInsightsResponse,
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


// =============================================================================
// Constants
// =============================================================================

/** Days since last interaction before a deal is considered at risk */
const DEAL_RISK_DAYS = 14;

/** Minimum lead score to be considered a "hot" lead */
const HOT_LEAD_SCORE = 80;

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
    let newLeadsPeriod: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' =
      'yesterday';

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
    let dealsTrendPeriod: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' =
      'this_week';

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
    const riskCutoff = new Date(now.getTime() - DEAL_RISK_DAYS * 24 * 60 * 60 * 1000);

    const insights: AIInsightsResponse['insights'] = [];

    // Check for deals at risk (no interaction in DEAL_RISK_DAYS+ days)
    const dealsAtRisk = await ctx.prisma.opportunity.findMany({
      where: {
        tenantId,
        ownerId: userId,
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        updatedAt: { lt: riskCutoff },
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
        score: { gte: HOT_LEAD_SCORE },
        status: { notIn: ['CONVERTED', 'LOST'] },
      },
      take: 2,
      select: { id: true, firstName: true, lastName: true, company: true, score: true },
    });

    hotLeads.forEach((lead) => {
      const name =
        `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.company || 'Lead';
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
   * Get daily goal progress
   *
   * @remarks Currently only supports the 'revenue' goal type with a hardcoded
   * $5,000 daily target. Other goal types (calls, meetings, tasks, custom)
   * are not yet implemented and will require user settings infrastructure.
   * See IFC-195 for the customizable goals feature.
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
            (p: any) => p.entityType === orderItem.entityType && p.entityId === orderItem.entityId
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
