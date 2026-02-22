/**
 * Feedback Survey Analytics Router - IFC-068
 *
 * Provides tRPC endpoints for customer feedback survey analytics:
 * - Dashboard summary (NPS, CSAT, CES, sentiment, trends)
 * - NPS trend data over time
 * - Sentiment breakdown
 * - Exportable data for CSV/PDF
 *
 * NOT to be confused with feedback.router.ts (IFC-024: AI Score Feedback).
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { type Context } from '../../context';
import { feedbackSurveyAnalyticsQuerySchema } from '@intelliflow/validators';

/**
 * Helper to get feedback survey service from context
 */
function getFeedbackSurveyService(ctx: Context) {
  if (!ctx.services?.feedbackSurvey) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Feedback Survey Analytics service not available',
    });
  }
  return ctx.services.feedbackSurvey;
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

export const feedbackSurveyRouter = createTRPCRouter({
  /**
   * Get full dashboard summary with NPS, CSAT, CES, sentiment, trends
   */
  getDashboardStats: protectedProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = getTenantId(ctx);
      return service.getDashboardSummary(tenantId, input);
    }),

  /**
   * Get NPS trend data over time (subset of dashboard data)
   */
  getNPSTrend: protectedProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = getTenantId(ctx);
      const data = await service.getDashboardSummary(tenantId, input);
      return { trends: data.trends, nps: data.nps };
    }),

  /**
   * Get sentiment breakdown (subset of dashboard data)
   */
  getSentimentBreakdown: protectedProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = getTenantId(ctx);
      const data = await service.getDashboardSummary(tenantId, input);
      return data.sentiment;
    }),

  /**
   * Export data for CSV/PDF generation (returns full dashboard data)
   */
  exportData: protectedProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = getTenantId(ctx);
      return service.getDashboardSummary(tenantId, input);
    }),
});
