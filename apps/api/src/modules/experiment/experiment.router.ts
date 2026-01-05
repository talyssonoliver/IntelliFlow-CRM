/**
 * Experiment Router - IFC-025: A/B Testing Framework
 *
 * Provides type-safe tRPC endpoints for A/B experiment management:
 * - Create and manage experiments
 * - Assign leads to variants
 * - Record scores and conversions
 * - Analyze experiment results
 *
 * Uses ExperimentService from application layer (hexagonal architecture)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, tenantProcedure } from '../../trpc';
import {
  createExperimentSchema,
  updateExperimentSchema,
  recordScoreInputSchema,
  recordConversionInputSchema,
  analyzeExperimentInputSchema,
} from '@intelliflow/validators';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';

/**
 * Helper to get experiment service with null check
 * Cast to any to work around application package build issues
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExperimentService(ctx: Context): any {
  if (!ctx.services?.experiment) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Experiment service not available',
    });
  }
  return ctx.services.experiment;
}

export const experimentRouter = createTRPCRouter({
  // ===========================================================================
  // Experiment Lifecycle
  // ===========================================================================

  /**
   * Create a new A/B experiment
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  create: tenantProcedure
    .input(createExperimentSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const experimentService = getExperimentService(ctx);

      return experimentService.createExperiment(input, typedCtx.tenant.tenantId);
    }),

  /**
   * Update experiment configuration (DRAFT only)
   * SECURITY: Uses tenantProcedure
   */
  update: tenantProcedure
    .input(
      z.object({
        experimentId: z.string().cuid(),
        data: updateExperimentSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.updateExperiment(input.experimentId, input.data);
    }),

  /**
   * Start an experiment
   * SECURITY: Uses tenantProcedure
   */
  start: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.startExperiment(input.experimentId);
    }),

  /**
   * Pause a running experiment
   * SECURITY: Uses tenantProcedure
   */
  pause: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.pauseExperiment(input.experimentId);
    }),

  /**
   * Complete an experiment
   * SECURITY: Uses tenantProcedure
   */
  complete: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.completeExperiment(input.experimentId);
    }),

  /**
   * Archive a completed experiment
   * SECURITY: Uses tenantProcedure
   */
  archive: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.archiveExperiment(input.experimentId);
    }),

  // ===========================================================================
  // Variant Assignment
  // ===========================================================================

  /**
   * Assign a lead to an experiment variant
   * Returns existing assignment if already assigned (deterministic)
   * SECURITY: Uses tenantProcedure
   */
  assignVariant: tenantProcedure
    .input(
      z.object({
        experimentId: z.string().cuid(),
        leadId: z.string().cuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.assignVariant(input.experimentId, input.leadId);
    }),

  /**
   * Get current variant for a lead (without creating assignment)
   * SECURITY: Uses tenantProcedure
   */
  getVariant: tenantProcedure
    .input(
      z.object({
        experimentId: z.string().cuid(),
        leadId: z.string().cuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.getVariant(input.experimentId, input.leadId);
    }),

  // ===========================================================================
  // Score & Conversion Recording
  // ===========================================================================

  /**
   * Record a score for a lead in an experiment
   * SECURITY: Uses tenantProcedure
   */
  recordScore: tenantProcedure
    .input(recordScoreInputSchema)
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.recordScore(input);
    }),

  /**
   * Record a conversion for a lead
   * SECURITY: Uses tenantProcedure
   */
  recordConversion: tenantProcedure
    .input(recordConversionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.recordConversion(input);
    }),

  // ===========================================================================
  // Statistical Analysis
  // ===========================================================================

  /**
   * Run statistical analysis on an experiment
   * SECURITY: Uses protectedProcedure (requires elevated access)
   */
  analyze: protectedProcedure
    .input(analyzeExperimentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.analyzeExperiment(input.experimentId);
    }),

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get experiment by ID
   * SECURITY: Uses tenantProcedure
   */
  getById: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.getExperiment(input.experimentId);
    }),

  /**
   * List all experiments for the tenant
   * SECURITY: Uses tenantProcedure
   */
  list: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const experimentService = getExperimentService(ctx);
    return experimentService.listExperiments(typedCtx.tenant.tenantId);
  }),

  /**
   * Get experiment status (sample sizes, progress)
   * SECURITY: Uses tenantProcedure
   */
  getStatus: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.getStatus(input.experimentId);
    }),

  /**
   * Get experiment results (statistical analysis)
   * SECURITY: Uses tenantProcedure
   */
  getResults: tenantProcedure
    .input(z.object({ experimentId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const experimentService = getExperimentService(ctx);
      return experimentService.getResults(input.experimentId);
    }),
});
