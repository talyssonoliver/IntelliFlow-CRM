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
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { type Context } from '../../context';
import {
  feedbackSurveyAnalyticsQuerySchema,
  feedbackSurveySettingsSchema,
  sendFeedbackSurveySchema,
} from '@intelliflow/validators';
import { adminTenantProcedure } from '../../trpc';
import { createAndSendSurvey, loadSurveySettings, type SurveyDb } from './survey-service';

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

const SEND_REFUSED_MESSAGE = {
  contact_not_found: 'Contact not found.',
  no_email: 'This contact has no email address.',
  restricted: 'This contact asked us to restrict use of their data, so no survey was sent.',
} as const;

export const feedbackSurveyRouter = createTRPCRouter({
  /**
   * Get full dashboard summary with NPS, CSAT, CES, sentiment, trends
   */
  getDashboardStats: tenantProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = ctx.tenant.tenantId;
      return service.getDashboardSummary(tenantId, input);
    }),

  /**
   * Get NPS trend data over time (subset of dashboard data)
   */
  getNPSTrend: tenantProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = ctx.tenant.tenantId;
      const data = await service.getDashboardSummary(tenantId, input);
      return { trends: data.trends, nps: data.nps };
    }),

  /**
   * Get sentiment breakdown (subset of dashboard data)
   */
  getSentimentBreakdown: tenantProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = ctx.tenant.tenantId;
      const data = await service.getDashboardSummary(tenantId, input);
      return data.sentiment;
    }),

  /**
   * Export data for CSV/PDF generation (returns full dashboard data)
   */
  exportData: tenantProcedure
    .input(feedbackSurveyAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const service = getFeedbackSurveyService(ctx);
      const tenantId = ctx.tenant.tenantId;
      return service.getDashboardSummary(tenantId, input);
    }),

  /**
   * MVP-012: email one customer a short NPS or CSAT question with a single-use link. The tenant
   * comes from the session; the contact must belong to it.
   */
  send: tenantProcedure.input(sendFeedbackSurveySchema).mutation(async ({ ctx, input }) => {
    const sender = ctx.adapters?.notificationService;
    if (!sender) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Email sending is not set up, so a survey cannot be sent yet.',
      });
    }
    const result = await createAndSendSurvey(ctx.prismaWithTenant as unknown as SurveyDb, sender, {
      tenantId: ctx.tenant.tenantId,
      contactId: input.contactId,
      surveyType: input.surveyType,
      trigger: 'MANUAL',
      sentById: ctx.tenant.userId,
    });
    if (!result.ok) {
      throw new TRPCError({
        code: result.reason === 'contact_not_found' ? 'NOT_FOUND' : 'BAD_REQUEST',
        message: SEND_REFUSED_MESSAGE[result.reason],
      });
    }
    return { surveyId: result.surveyId, delivered: result.delivered };
  }),

  /** The tenant's automatic-survey switches (no row: both on). */
  getSettings: tenantProcedure.query(async ({ ctx }) =>
    loadSurveySettings(ctx.prismaWithTenant as unknown as SurveyDb, ctx.tenant.tenantId)
  ),

  updateSettings: adminTenantProcedure
    .input(feedbackSurveySettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      await ctx.prismaWithTenant.feedbackSurveySetting.upsert({
        where: { tenantId },
        create: { tenantId, ...input },
        update: input,
      });
      return input;
    }),
});
