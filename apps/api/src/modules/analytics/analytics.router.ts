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

      const trends = await analyticsService.getGrowthTrend(tenantId, input.metric, input.months);

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

  /**
   * Export aggregated metrics for selected metric types in a date range
   */
  exportMetrics: protectedProcedure
    .input(
      z.object({
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
        metrics: z.array(z.enum(['revenue', 'leads', 'deals', 'contacts'])),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      return analyticsService.exportMetrics(
        tenantId,
        {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
        input.metrics
      );
    }),

  /**
   * @deprecated Use exportReport instead (IFC-190)
   * Export conversion funnel data for a date range
   */
  exportConversionFunnel: protectedProcedure
    .input(
      z.object({
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      return analyticsService.exportConversionFunnel(tenantId, {
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });
    }),

  // ============================================
  // IFC-190: Composite Analytics Endpoints
  // ============================================

  /**
   * Dashboard overview — composite metrics with parallel queries
   */
  getOverview: protectedProcedure
    .input(
      z.object({
        startDate: z.iso.datetime().optional(),
        endDate: z.iso.datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      const dateRange =
        input.startDate && input.endDate
          ? { startDate: new Date(input.startDate), endDate: new Date(input.endDate) }
          : undefined;

      return analyticsService.getOverview(tenantId, dateRange);
    }),

  /**
   * Sales KPIs — pipeline value, win rate, avg deal size, cycle length, revenue
   */
  getSalesMetrics: protectedProcedure
    .input(
      z.object({
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
        ownerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      return analyticsService.getSalesMetrics(
        tenantId,
        { startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
        input.ownerId
      );
    }),

  /**
   * Lead pipeline metrics — by source, by status, conversion rate
   */
  getLeadMetrics: protectedProcedure
    .input(
      z.object({
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      return analyticsService.getLeadMetrics(tenantId, {
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });
    }),

  /**
   * Conversion funnel — 7-stage pipeline with per-stage metrics
   */
  getConversionFunnel: protectedProcedure
    .input(
      z.object({
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
        includeLeads: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      return analyticsService.getConversionFunnel(
        tenantId,
        { startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
        input.includeLeads
      );
    }),

  /**
   * Time series data — parametric metric + granularity with date range limits
   */
  getTimeSeriesData: protectedProcedure
    .input(
      z.object({
        metric: z.enum(['revenue', 'leads', 'deals', 'contacts', 'pipeline_value', 'win_rate']),
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
        granularity: z.enum(['day', 'week', 'month']).default('month'),
        ownerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // NF-003: Date range limits
      if (input.granularity === 'day' && diffDays > 31) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Daily granularity is limited to 31 days maximum',
        });
      }
      if (input.granularity === 'week' && diffDays > 365) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly granularity is limited to 365 days maximum',
        });
      }

      return analyticsService.getTimeSeriesData(
        tenantId,
        input.metric,
        { startDate: start, endDate: end },
        input.granularity,
        input.ownerId
      );
    }),

  /**
   * Unified report export — delegates to other endpoints, supports JSON/CSV
   */
  exportReport: protectedProcedure
    .input(
      z.object({
        format: z.enum(['csv', 'json']),
        reportType: z.enum(['sales', 'leads', 'funnel', 'timeseries', 'overview']),
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
        metrics: z
          .array(z.enum(['revenue', 'leads', 'deals', 'contacts', 'pipeline_value', 'win_rate']))
          .optional(),
        granularity: z.enum(['day', 'week', 'month']).optional(),
        ownerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analyticsService = getAnalyticsService(ctx);
      const tenantId = getTenantId(ctx);

      return analyticsService.exportReport(
        tenantId,
        input.reportType,
        { startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
        input.format,
        {
          metrics: input.metrics,
          granularity: input.granularity,
          ownerId: input.ownerId,
        }
      );
    }),
});
