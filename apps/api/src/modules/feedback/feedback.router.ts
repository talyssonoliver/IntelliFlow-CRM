/**
 * Feedback Router - IFC-024: Human-in-the-Loop Feedback
 *
 * Provides type-safe tRPC endpoints for AI score feedback:
 * - Submit thumbs up/down feedback
 * - Submit score corrections with reasons
 * - Get feedback for a lead
 * - Get feedback analytics
 * - Check retraining recommendations
 * - Export training data
 *
 * Uses FeedbackService from application layer (hexagonal architecture)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, tenantProcedure } from '../../trpc';
import {
  submitSimpleFeedbackSchema,
  submitScoreCorrectionSchema,
  feedbackAnalyticsQuerySchema,
} from '@intelliflow/validators';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';

/**
 * Helper to get feedback service with null check
 * Cast to any to work around application package build issues
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFeedbackService(ctx: Context): any {
  if (!ctx.services?.feedback) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Feedback service not available',
    });
  }
  return ctx.services.feedback;
}

export const feedbackRouter = createTRPCRouter({
  /**
   * Submit simple feedback (thumbs up/down)
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  submitSimple: tenantProcedure
    .input(submitSimpleFeedbackSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const feedbackService = getFeedbackService(ctx);

      const feedback = await feedbackService.submitSimpleFeedback(
        input,
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      return feedback;
    }),

  /**
   * Submit score correction with reason
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  submitCorrection: tenantProcedure
    .input(submitScoreCorrectionSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const feedbackService = getFeedbackService(ctx);

      const feedback = await feedbackService.submitScoreCorrection(
        input,
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      return feedback;
    }),

  /**
   * Get feedback for a specific lead
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  getForLead: tenantProcedure
    .input(z.object({ leadId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const feedbackService = getFeedbackService(ctx);
      return feedbackService.getFeedbackForLead(input.leadId);
    }),

  /**
   * Get feedback analytics
   * SECURITY: Uses protectedProcedure (admins/managers only for cross-tenant analytics)
   */
  getAnalytics: protectedProcedure
    .input(feedbackAnalyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const feedbackService = getFeedbackService(ctx);
      return feedbackService.getAnalytics(input);
    }),

  /**
   * Check if model retraining is recommended
   * SECURITY: Uses protectedProcedure
   */
  checkRetraining: protectedProcedure
    .input(z.object({ modelVersion: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const feedbackService = getFeedbackService(ctx);
      return feedbackService.checkRetrainingNeeded(input.modelVersion);
    }),

  /**
   * Export training data from corrections
   * SECURITY: Uses protectedProcedure (restricted access for training data export)
   */
  exportTrainingData: protectedProcedure
    .input(z.object({
      modelVersion: z.string().min(1),
      dateFrom: z.coerce.date(),
      dateTo: z.coerce.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const feedbackService = getFeedbackService(ctx);
      return feedbackService.exportTrainingData(
        input.modelVersion,
        input.dateFrom,
        input.dateTo,
        ctx.user?.userId ?? 'system'
      );
    }),
});
