/**
 * Analytics Router
 *
 * Provides type-safe tRPC endpoints for dashboard analytics:
 * - Deals won trends
 * - Growth metrics (revenue, leads, deals, contacts)
 * - Traffic source distribution
 * - Recent activity feed
 * - Lead statistics
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { type Context } from '../../context';

/**
 * Helper to get analytics service from context
 */
function getAnalyticsService(ctx: Context) {
  if (!ctx.services?.analytics) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Analytics service not available',
    });
  }
  return ctx.services.analytics;
}

/**
 * Helper to get tenant ID from context
 */
function getTenantId(ctx: Context): string {
  if (!ctx.user?.tenantId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Tenant ID not found in user context',
    });
  }
  return ctx.user.tenantId;
}

export const analyticsRouter = createTRPCRouter({
  /**
   * Get deals won trend (last N months)
   */
  dealsWonTrend: protectedProcedure
    .input(
      z.object({
        months: z.number().min(1).max(12).default(6),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      const trend = await analyticsService.getDealsWonTrend(tenantId, input.months);

      return trend;
    }),

  /**
   * Get growth trends for a specific metric
   */
  growthTrends: protectedProcedure
    .input(
      z.object({
        metric: z.enum(['revenue', 'leads', 'deals', 'contacts']),
        months: z.number().min(1).max(12).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      const trends = await analyticsService.getGrowthTrend(
        tenantId,
        input.metric,
        input.months
      );

      return trends;
    }),

  /**
   * Get traffic source distribution (lead sources)
   */
  trafficSources: protectedProcedure.query(async ({ ctx }) => {
    const analyticsService = getAnalyticsService(ctx);
    const tenantId = getTenantId(ctx);

    const sources = await analyticsService.getTrafficSources(tenantId);

    return sources;
  }),

  /**
   * Get recent activity feed
   */
  recentActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      const activities = await analyticsService.getRecentActivity(tenantId, input.limit);

      return activities;
    }),

  /**
   * Get lead statistics for dashboard widget
   */
  leadStats: protectedProcedure.query(async ({ ctx }) => {
    const analyticsService = getAnalyticsService(ctx);
    const tenantId = getTenantId(ctx);

    const stats = await analyticsService.getLeadStats(tenantId);

    return stats;
  }),
});
