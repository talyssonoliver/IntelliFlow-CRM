/**
 * Intelligence Router (IFC-095)
 *
 * Provides type-safe tRPC endpoints for AI-powered insights:
 * - Churn risk predictions for leads and contacts
 * - Next best action recommendations
 * - AI insights summary for 360 views
 *
 * Integrates with:
 * - ai-worker: ChurnRiskChain, NextBestActionAgent
 * - Database: LeadAIInsight, ContactAIInsight models
 *
 * @see Sprint 8 - IFC-095: Churn Risk & Next Best Action
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  churnRiskLevelSchema,
  nbaActionTypeSchema,
  nbaPrioritySchema,
  aiInsightsSummarySchema,
} from '@intelliflow/validators';
import { getTenantContext } from '../../security/tenant-context';

/**
 * Entity type for AI predictions
 */
const entityTypeSchema = z.enum(['lead', 'contact', 'opportunity', 'account']);

/**
 * Input schema for getting AI insights
 */
const getInsightsInputSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
});

/**
 * Input schema for triggering predictions
 */
const triggerPredictionInputSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  predictionType: z.enum(['CHURN_RISK', 'NEXT_BEST_ACTION', 'QUALIFICATION']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
});

/**
 * AI insights response schema
 */
const aiInsightsResponseSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  entityType: z.string(),

  // Churn risk
  churnRisk: churnRiskLevelSchema.nullable(),
  churnRiskScore: z.number().min(0).max(100).nullable(),

  // Conversion & value
  conversionProbability: z.number().min(0).max(100).nullable(),
  estimatedValue: z.number().nullable(),
  lifetimeValue: z.number().nullable(),

  // Engagement
  engagementScore: z.number().min(0).max(100).nullable(),
  sentiment: z.string().nullable(),
  sentimentTrend: z.string().nullable(),
  lastEngagementDays: z.number().nullable(),

  // Next best action
  nextBestAction: z.string().nullable(),
  recommendations: z.array(z.string()).nullable(),

  // Metadata
  updatedAt: z.date(),
  createdAt: z.date(),
});

export const intelligenceRouter = createTRPCRouter({
  /**
   * Get AI insights for a lead
   * Returns the stored AI insights from LeadAIInsight model
   */
  getLeadInsights: tenantProcedure
    .input(z.object({ leadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Verify lead exists and belongs to tenant
      const lead = await typedCtx.prismaWithTenant.lead.findUnique({
        where: { id: input.leadId },
        include: {
          aiInsight: true,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead with ID ${input.leadId} not found`,
        });
      }

      if (!lead.aiInsight) {
        return null;
      }

      return {
        id: lead.aiInsight.id,
        entityId: lead.id,
        entityType: 'lead' as const,
        churnRisk: lead.aiInsight.churnRisk,
        churnRiskScore: null, // Not stored directly, computed from churnRisk level
        conversionProbability: lead.aiInsight.conversionProbability,
        estimatedValue: lead.aiInsight.estimatedValue,
        lifetimeValue: null,
        engagementScore: lead.aiInsight.engagementScore,
        sentiment: lead.aiInsight.sentiment,
        sentimentTrend: lead.aiInsight.sentimentTrend,
        lastEngagementDays: lead.aiInsight.lastEngagementDays,
        nextBestAction: lead.aiInsight.nextBestAction,
        recommendations: lead.aiInsight.recommendations as string[] | null,
        updatedAt: lead.aiInsight.updatedAt,
        createdAt: lead.aiInsight.createdAt,
      };
    }),

  /**
   * Get AI insights for a contact
   * Returns the stored AI insights from ContactAIInsight model
   */
  getContactInsights: tenantProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Verify contact exists and belongs to tenant
      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
        include: {
          aiInsight: true,
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${input.contactId} not found`,
        });
      }

      if (!contact.aiInsight) {
        return null;
      }

      return {
        id: contact.aiInsight.id,
        entityId: contact.id,
        entityType: 'contact' as const,
        churnRisk: contact.aiInsight.churnRisk,
        churnRiskScore: null,
        conversionProbability: contact.aiInsight.conversionProbability,
        estimatedValue: null,
        lifetimeValue: contact.aiInsight.lifetimeValue,
        engagementScore: contact.aiInsight.engagementScore,
        sentiment: contact.aiInsight.sentiment,
        sentimentTrend: contact.aiInsight.sentimentTrend,
        lastEngagementDays: contact.aiInsight.lastEngagementDays,
        nextBestAction: contact.aiInsight.nextBestAction,
        recommendations: contact.aiInsight.recommendations as string[] | null,
        updatedAt: contact.aiInsight.updatedAt,
        createdAt: contact.aiInsight.createdAt,
      };
    }),

  /**
   * Get AI insights summary for 360 view
   * Combines churn risk, NBA, and other insights into a summary
   */
  getInsightsSummary: tenantProcedure
    .input(getInsightsInputSchema)
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { entityType, entityId } = input;

      let aiInsight: {
        churnRisk: string;
        conversionProbability: number;
        lifetimeValue?: number;
        estimatedValue?: number;
        engagementScore: number;
        sentiment: string | null;
        nextBestAction: string | null;
        recommendations: unknown;
        updatedAt: Date;
      } | null = null;

      if (entityType === 'lead') {
        const lead = await typedCtx.prismaWithTenant.lead.findUnique({
          where: { id: entityId },
          include: { aiInsight: true },
        });
        if (lead?.aiInsight) {
          aiInsight = lead.aiInsight;
        }
      } else if (entityType === 'contact') {
        const contact = await typedCtx.prismaWithTenant.contact.findUnique({
          where: { id: entityId },
          include: { aiInsight: true },
        });
        if (contact?.aiInsight) {
          aiInsight = contact.aiInsight;
        }
      }

      if (!aiInsight) {
        return null;
      }

      // Map churn risk level to numeric score for display
      const churnRiskScoreMap: Record<string, number> = {
        LOW: 20,
        MEDIUM: 50,
        HIGH: 80,
      };

      const summary = {
        churnRisk: {
          score: churnRiskScoreMap[aiInsight.churnRisk] ?? 0,
          level: aiInsight.churnRisk as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'MINIMAL',
          trend: undefined,
          lastAssessedAt: aiInsight.updatedAt.toISOString(),
        },
        nextBestAction: {
          action: (aiInsight.nextBestAction?.toUpperCase().replace(/\s+/g, '_') || 'WAIT') as
            'CALL' | 'EMAIL' | 'MEETING' | 'SEND_PROPOSAL' | 'OFFER_DISCOUNT' | 'SCHEDULE_DEMO' |
            'SEND_CASE_STUDY' | 'ESCALATE' | 'UPSELL' | 'CROSS_SELL' | 'TRAINING' | 'WAIT',
          title: aiInsight.nextBestAction || 'No action recommended',
          deadline: undefined,
          priority: 'MEDIUM' as const,
        },
        conversionProbability: aiInsight.conversionProbability,
        lifetimeValue: aiInsight.lifetimeValue ?? aiInsight.estimatedValue,
        sentiment: aiInsight.sentiment as 'VERY_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE' | undefined,
        engagementScore: aiInsight.engagementScore,
        recommendations: (aiInsight.recommendations as string[]) ?? [],
        confidence: 0.85, // Default confidence
        lastUpdatedAt: aiInsight.updatedAt.toISOString(),
      };

      return summary;
    }),

  /**
   * Trigger a prediction job for an entity
   * Queues an async job to the ai-worker
   *
   * Note: This requires BullMQ/Redis infrastructure to be running.
   * The prediction results will be stored in the database and can be
   * retrieved via getLeadInsights/getContactInsights.
   */
  triggerPrediction: tenantProcedure
    .input(triggerPredictionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { entityType, entityId, predictionType, priority } = input;

      // Verify entity exists
      if (entityType === 'lead') {
        const lead = await typedCtx.prismaWithTenant.lead.findUnique({
          where: { id: entityId },
        });
        if (!lead) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Lead with ID ${entityId} not found`,
          });
        }
      } else if (entityType === 'contact') {
        const contact = await typedCtx.prismaWithTenant.contact.findUnique({
          where: { id: entityId },
        });
        if (!contact) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Contact with ID ${entityId} not found`,
          });
        }
      }

      // TODO: When BullMQ is configured, add job to prediction queue
      // For now, return a pending status
      //
      // Example future implementation:
      // const job = await predictionQueue.add('prediction', {
      //   entityType,
      //   entityId,
      //   tenantId: typedCtx.tenant.tenantId,
      //   predictionType,
      // }, {
      //   priority: priority === 'HIGH' ? 1 : priority === 'NORMAL' ? 5 : 10,
      // });
      // return { jobId: job.id, status: 'QUEUED' };

      return {
        status: 'PENDING' as const,
        message: 'Prediction job infrastructure not yet configured. Use synchronous prediction endpoints.',
        entityType,
        entityId,
        predictionType,
        queuedAt: new Date().toISOString(),
      };
    }),

  /**
   * Update AI insights for a lead
   * Called by ai-worker after prediction completes
   */
  updateLeadInsights: tenantProcedure
    .input(z.object({
      leadId: z.string().uuid(),
      churnRisk: churnRiskLevelSchema.optional(),
      conversionProbability: z.number().min(0).max(100).optional(),
      estimatedValue: z.number().optional(),
      engagementScore: z.number().min(0).max(100).optional(),
      sentiment: z.string().optional(),
      sentimentTrend: z.string().optional(),
      nextBestAction: z.string().optional(),
      recommendations: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { leadId, ...updateData } = input;

      // Verify lead exists
      const lead = await typedCtx.prismaWithTenant.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead with ID ${leadId} not found`,
        });
      }

      // Upsert AI insight
      const aiInsight = await ctx.prisma.leadAIInsight.upsert({
        where: { leadId },
        create: {
          tenantId: typedCtx.tenant.tenantId,
          leadId,
          churnRisk: updateData.churnRisk ?? 'LOW',
          conversionProbability: updateData.conversionProbability ?? 0,
          estimatedValue: updateData.estimatedValue ?? 0,
          engagementScore: updateData.engagementScore ?? 0,
          sentiment: updateData.sentiment ?? null,
          sentimentTrend: updateData.sentimentTrend ?? null,
          nextBestAction: updateData.nextBestAction ?? null,
          recommendations: updateData.recommendations ?? [],
        },
        update: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      return aiInsight;
    }),

  /**
   * Update AI insights for a contact
   * Called by ai-worker after prediction completes
   */
  updateContactInsights: tenantProcedure
    .input(z.object({
      contactId: z.string().uuid(),
      churnRisk: churnRiskLevelSchema.optional(),
      conversionProbability: z.number().min(0).max(100).optional(),
      lifetimeValue: z.number().optional(),
      engagementScore: z.number().min(0).max(100).optional(),
      sentiment: z.string().optional(),
      sentimentTrend: z.string().optional(),
      nextBestAction: z.string().optional(),
      recommendations: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { contactId, ...updateData } = input;

      // Verify contact exists
      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: contactId },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${contactId} not found`,
        });
      }

      // Upsert AI insight
      const aiInsight = await ctx.prisma.contactAIInsight.upsert({
        where: { contactId },
        create: {
          tenantId: typedCtx.tenant.tenantId,
          contactId,
          churnRisk: updateData.churnRisk ?? 'LOW',
          conversionProbability: updateData.conversionProbability ?? 0,
          lifetimeValue: updateData.lifetimeValue ?? 0,
          engagementScore: updateData.engagementScore ?? 0,
          sentiment: updateData.sentiment ?? null,
          sentimentTrend: updateData.sentimentTrend ?? null,
          nextBestAction: updateData.nextBestAction ?? null,
          recommendations: updateData.recommendations ?? [],
        },
        update: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      return aiInsight;
    }),
});

export type IntelligenceRouter = typeof intelligenceRouter;
