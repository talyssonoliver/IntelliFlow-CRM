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
  updateDailyGoalInputSchema,
  GOAL_DEFAULTS,
  type WelcomeSummary,
  type AIInsightsResponse,
  type DailyGoalResponse,
  type PinnedItemsResponse,
  type GoalType,
} from '@intelliflow/validators';
import { z } from 'zod';

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

function getGreeting(timezone: string = 'UTC'): string {
  let hour: number;
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    }).format(new Date());
    hour = parseInt(formatted, 10);
  } catch {
    // Fallback to UTC if timezone is invalid
    const formatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'UTC',
    }).format(new Date());
    hour = parseInt(formatted, 10);
  }
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

/** IFC-192: Days threshold for stale contact warnings */
const STALE_CONTACT_DAYS = 30;

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

    // Fetch user name (timezone comes from ctx.user session)
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
      greeting: getGreeting(ctx.user?.timezone ?? 'UTC'),
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

    // IFC-192: Check for stale contacts with open opportunities
    const staleCutoff = new Date(now.getTime() - STALE_CONTACT_DAYS * 24 * 60 * 60 * 1000);
    const staleContacts = await ctx.prisma.contact.findMany({
      where: {
        tenantId,
        ownerId: userId,
        OR: [
          { lastContactedAt: { lt: staleCutoff } },
          { lastContactedAt: null },
        ],
        opportunities: {
          some: { stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
        },
      },
      take: 2,
      select: { id: true, firstName: true, lastName: true, lastContactedAt: true },
    });

    staleContacts.forEach((contact) => {
      const name = `${contact.firstName} ${contact.lastName}`.trim();
      const days = contact.lastContactedAt
        ? Math.floor(
            (now.getTime() - contact.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000)
          )
        : null;
      insights.push({
        id: `stale-contact-${contact.id}`,
        type: 'warning',
        title: `Stale Contact: ${name}`,
        description: days
          ? `No interaction in ${days} days. This contact has open opportunities.`
          : `Never contacted. This contact has open opportunities.`,
        suggestedAction: 'Schedule a follow-up',
        entityType: 'contact',
        entityId: contact.id,
        actionUrl: `/contacts/${contact.id}`,
        priority: 'medium',
        createdAt: now,
      });
    });

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
   * Supports 5 goal types: revenue, calls, meetings, tasks, custom.
   * Reads user preferences from User.preferences.dailyGoal; defaults to revenue/$5000.
   * Task: IFC-195 - Customizable Daily Goals
   */
  getDailyGoal: protectedProcedure.query(async ({ ctx }): Promise<DailyGoalResponse> => {
    const startTime = performance.now();
    const tenantId = getTenantId(ctx);
    const userId = getUserId(ctx);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Read user preferences for goal type
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const goalPrefSchema = z.object({
      type: z.enum(['revenue', 'calls', 'meetings', 'tasks', 'custom']),
      targetValue: z.number().int().positive(),
      label: z.string().optional(),
      customUnit: z.string().optional(),
    });
    const parsed = goalPrefSchema.safeParse(prefs.dailyGoal);

    const goalType: GoalType = parsed.success ? parsed.data.type : 'revenue';
    const defaults = GOAL_DEFAULTS[goalType];
    const targetValue = parsed.success ? parsed.data.targetValue : defaults.targetValue;
    const label = (parsed.success && parsed.data.label) || defaults.label;
    const unit = (parsed.success && goalType === 'custom' && parsed.data.customUnit) || defaults.unit;

    // Compute currentValue based on goal type
    let currentValue = 0;

    switch (goalType) {
      case 'revenue': {
        const todayRevenue = await ctx.prisma.opportunity.aggregate({
          where: {
            tenantId,
            ownerId: userId,
            stage: 'CLOSED_WON',
            closedAt: { gte: todayStart, lt: todayEnd },
          },
          _sum: { value: true },
        });
        currentValue = Number(todayRevenue._sum.value) || 0;
        break;
      }
      case 'calls': {
        currentValue = await ctx.prisma.callRecord.count({
          where: {
            tenantId,
            userId,
            startedAt: { gte: todayStart, lt: todayEnd },
            status: 'COMPLETED',
          },
        });
        break;
      }
      case 'meetings': {
        currentValue = await ctx.prisma.appointment.count({
          where: {
            tenantId,
            OR: [{ organizerId: userId }, { attendees: { some: { userId } } }],
            completedAt: { gte: todayStart, lt: todayEnd },
            status: 'COMPLETED',
          },
        });
        break;
      }
      case 'tasks': {
        currentValue = await ctx.prisma.task.count({
          where: {
            tenantId,
            ownerId: userId,
            completedAt: { gte: todayStart, lt: todayEnd },
            status: 'COMPLETED',
          },
        });
        break;
      }
      case 'custom': {
        currentValue = 0;
        break;
      }
    }

    const progress = Math.min(100, Math.round((currentValue / targetValue) * 100));
    const remainingToTarget = Math.max(0, targetValue - currentValue);

    // Format remaining based on goal type
    const remainingFormatted =
      goalType === 'revenue'
        ? `$${remainingToTarget.toLocaleString()}`
        : `${remainingToTarget} ${unit}`;

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[home.getDailyGoal] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      goal: {
        id: `daily-${goalType}`,
        type: goalType,
        label,
        targetValue,
        currentValue,
        unit,
        progress,
        remainingToTarget,
        remainingFormatted,
      },
      lastUpdated: now,
    };
  }),

  /**
   * Update daily goal preferences
   *
   * Saves goal type and target to User.preferences.dailyGoal using
   * read-merge-write pattern (same as pinItem).
   * Task: IFC-195 - Customizable Daily Goals
   */
  updateDailyGoal: protectedProcedure
    .input(updateDailyGoalInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const { type, targetValue, label, customUnit } = input;

      // Get current preferences
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      const prefs = (user?.preferences as any) || {};

      // Merge dailyGoal into preferences
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...prefs,
            dailyGoal: { type, targetValue, label, customUnit },
          },
        },
      });

      return { success: true, message: 'Daily goal updated successfully' };
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
