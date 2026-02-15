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
import {
  SIGNIFICANCE_LEVELS,
  requiresHumanReview,
} from '@intelliflow/domain';

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
   * Get sentiment dashboard data (PG-142)
   *
   * Single data source: LeadAIInsight + ContactAIInsight tables.
   * Stats, analysis list, and trend chart all derive from the same rows,
   * ensuring consistency between the summary counts and the detail cards.
   */
  getSentimentDashboard: tenantProcedure
    .input(z.object({
      entityType: z.enum(['all', 'lead', 'contact']).default('all'),
      dateRange: z.enum(['7d', '30d', '90d']).default('30d'),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      // Calculate date filter
      const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
      const since = new Date();
      since.setDate(since.getDate() - daysMap[input.dateRange]);

      // ----- Unified data source: fetch full insight rows -----

      type InsightRow = {
        id: string;
        entityType: 'lead' | 'contact';
        entityId: string;
        entityName: string;
        sentiment: string;
        churnRisk: string;
        engagementScore: number;
        sentimentTrend: string | null;
        nextBestAction: string | null;
        recommendations: unknown;
        updatedAt: Date;
      };

      const churnToUrgency = (cr: string): string => {
        if (cr === 'CRITICAL') return 'CRITICAL';
        if (cr === 'HIGH') return 'HIGH';
        if (cr === 'MEDIUM') return 'MEDIUM';
        return 'NONE';
      };

      const allInsights: InsightRow[] = [];

      if (input.entityType === 'all' || input.entityType === 'lead') {
        const leadInsights = await ctx.prisma.leadAIInsight.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          include: { lead: { select: { id: true, firstName: true, lastName: true, company: true } } },
          orderBy: { updatedAt: 'desc' },
        });
        for (const li of leadInsights) {
          const name = [li.lead.firstName, li.lead.lastName].filter(Boolean).join(' ') || li.lead.company || 'Unknown Lead';
          allInsights.push({
            id: li.id,
            entityType: 'lead',
            entityId: li.leadId,
            entityName: name,
            sentiment: (li.sentiment ?? 'NEUTRAL').toUpperCase(),
            churnRisk: li.churnRisk,
            engagementScore: li.engagementScore,
            sentimentTrend: li.sentimentTrend,
            nextBestAction: li.nextBestAction,
            recommendations: li.recommendations,
            updatedAt: li.updatedAt,
          });
        }
      }

      if (input.entityType === 'all' || input.entityType === 'contact') {
        const contactInsights = await ctx.prisma.contactAIInsight.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          include: { contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
          orderBy: { updatedAt: 'desc' },
        });
        for (const ci of contactInsights) {
          const name = [ci.contact.firstName, ci.contact.lastName].filter(Boolean).join(' ') || ci.contact.company || 'Unknown Contact';
          allInsights.push({
            id: ci.id,
            entityType: 'contact',
            entityId: ci.contactId,
            entityName: name,
            sentiment: (ci.sentiment ?? 'NEUTRAL').toUpperCase(),
            churnRisk: ci.churnRisk,
            engagementScore: ci.engagementScore,
            sentimentTrend: ci.sentimentTrend,
            nextBestAction: ci.nextBestAction,
            recommendations: ci.recommendations,
            updatedAt: ci.updatedAt,
          });
        }
      }

      // Sort all insights by updatedAt desc (newest first)
      allInsights.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      // ----- Stats (derived from same rows) -----

      const sentimentCounts = { VERY_POSITIVE: 0, POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0, VERY_NEGATIVE: 0 };
      let urgentCount = 0;

      for (const row of allInsights) {
        const s = row.sentiment as keyof typeof sentimentCounts;
        if (s in sentimentCounts) sentimentCounts[s]++;
        if (row.churnRisk === 'CRITICAL' || row.churnRisk === 'HIGH') urgentCount++;
      }

      const posCount = sentimentCounts.VERY_POSITIVE + sentimentCounts.POSITIVE;
      const neutralCount = sentimentCounts.NEUTRAL;
      const negCount = sentimentCounts.VERY_NEGATIVE + sentimentCounts.NEGATIVE;
      const total = posCount + neutralCount + negCount;
      const avgScore = total > 0 ? (posCount - negCount) / total : 0;

      // ----- Recent analyses (paginated slice of same rows) -----

      const offset = (input.page - 1) * input.limit;
      const paginatedInsights = allInsights.slice(offset, offset + input.limit);

      const sentimentScoreMap: Record<string, number> = {
        VERY_POSITIVE: 0.9, POSITIVE: 0.7, NEUTRAL: 0.5, NEGATIVE: 0.3, VERY_NEGATIVE: 0.1,
      };

      const recentAnalyses = paginatedInsights.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        entityName: row.entityName,
        sentiment: row.sentiment,
        sentimentScore: sentimentScoreMap[row.sentiment] ?? 0.5,
        emotions: [] as Array<{ emotion: string; intensity: number }>,
        primaryEmotion: 'NEUTRAL',
        urgency: churnToUrgency(row.churnRisk),
        keyPhrases: [] as Array<{ phrase: string; sentiment: string }>,
        confidence: row.engagementScore / 100,
        analyzedAt: row.updatedAt.toISOString(),
      }));

      // ----- Trends (grouped by date from same rows) -----

      const trendMap = new Map<string, { positive: number; neutral: number; negative: number; total: number }>();
      for (const row of allInsights) {
        const dateKey = row.updatedAt.toISOString().split('T')[0];
        if (!trendMap.has(dateKey)) {
          trendMap.set(dateKey, { positive: 0, neutral: 0, negative: 0, total: 0 });
        }
        const bucket = trendMap.get(dateKey)!;
        if (row.sentiment.includes('POSITIVE')) bucket.positive++;
        else if (row.sentiment.includes('NEGATIVE')) bucket.negative++;
        else bucket.neutral++;
        bucket.total++;
      }

      // Sort trend entries chronologically
      const trendEntries = Array.from(trendMap.entries()).sort(
        ([a], [b]) => a.localeCompare(b),
      );

      const trends = trendEntries.map(([date, b]) => ({
        date,
        positive: b.positive,
        neutral: b.neutral,
        negative: b.negative,
        avgScore: b.total > 0 ? (b.positive - b.negative) / b.total : 0,
      }));

      return {
        stats: { total, positive: posCount, neutral: neutralCount, negative: negCount, avgScore, urgentCount },
        distribution: sentimentCounts,
        recentAnalyses,
        trends,
      };
    }),

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
      confidence: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { leadId, confidence, ...updateData } = input;

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

      // Check if human review is required based on confidence
      // Use CHURN_PREDICTION chain type for churn risk assessments
      const needsReview = confidence !== undefined
        ? requiresHumanReview(confidence, 'CHURN_PREDICTION')
        : false;

      if (needsReview) {
        console.warn(
          `[intelligence.updateLeadInsights] Lead ${leadId} requires human review (confidence: ${confidence?.toFixed(2)}, threshold: ${SIGNIFICANCE_LEVELS.MEDIUM})`
        );
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

      return {
        ...aiInsight,
        requiresHumanReview: needsReview,
        reviewReason: needsReview
          ? `Low confidence (${confidence?.toFixed(2)}) for churn prediction (threshold: ${SIGNIFICANCE_LEVELS.MEDIUM})`
          : undefined,
      };
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

  /**
   * Get churn risk dashboard data (PG-143)
   *
   * Single data source: LeadAIInsight + ContactAIInsight tables.
   * Stats, at-risk customer list, and trend chart all derive from the same rows.
   */
  getChurnDashboard: tenantProcedure
    .input(z.object({
      entityType: z.enum(['all', 'lead', 'contact']).default('all'),
      dateRange: z.enum(['7d', '30d', '90d']).default('30d'),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
      const since = new Date();
      since.setDate(since.getDate() - daysMap[input.dateRange]);

      // SLA hours per risk level
      const slaHoursMap: Record<string, number> = {
        CRITICAL: 24, HIGH: 48, MEDIUM: 168, LOW: 336, MINIMAL: 720,
      };

      type InsightRow = {
        id: string;
        entityType: 'lead' | 'contact';
        entityId: string;
        entityName: string;
        churnRisk: string;
        engagementScore: number;
        nextBestAction: string | null;
        recommendations: unknown;
        lastEngagementDays: number | null;
        updatedAt: Date;
      };

      const allInsights: InsightRow[] = [];

      if (input.entityType === 'all' || input.entityType === 'lead') {
        const leadInsights = await ctx.prisma.leadAIInsight.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          include: { lead: { select: { id: true, firstName: true, lastName: true, company: true } } },
          orderBy: { updatedAt: 'desc' },
        });
        for (const li of leadInsights) {
          const name = [li.lead.firstName, li.lead.lastName].filter(Boolean).join(' ') || li.lead.company || 'Unknown Lead';
          allInsights.push({
            id: li.id,
            entityType: 'lead',
            entityId: li.leadId,
            entityName: name,
            churnRisk: li.churnRisk,
            engagementScore: li.engagementScore,
            nextBestAction: li.nextBestAction,
            recommendations: li.recommendations,
            lastEngagementDays: li.lastEngagementDays,
            updatedAt: li.updatedAt,
          });
        }
      }

      if (input.entityType === 'all' || input.entityType === 'contact') {
        const contactInsights = await ctx.prisma.contactAIInsight.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          include: { contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
          orderBy: { updatedAt: 'desc' },
        });
        for (const ci of contactInsights) {
          const name = [ci.contact.firstName, ci.contact.lastName].filter(Boolean).join(' ') || ci.contact.company || 'Unknown Contact';
          allInsights.push({
            id: ci.id,
            entityType: 'contact',
            entityId: ci.contactId,
            entityName: name,
            churnRisk: ci.churnRisk,
            engagementScore: ci.engagementScore,
            nextBestAction: ci.nextBestAction,
            recommendations: ci.recommendations,
            lastEngagementDays: ci.lastEngagementDays,
            updatedAt: ci.updatedAt,
          });
        }
      }

      // Sort by risk (CRITICAL first), then updatedAt desc
      const riskOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, MINIMAL: 4 };
      allInsights.sort((a, b) => {
        const riskDiff = (riskOrder[a.churnRisk] ?? 4) - (riskOrder[b.churnRisk] ?? 4);
        if (riskDiff !== 0) return riskDiff;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      // Stats
      const distribution: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, MINIMAL: 0 };
      let totalEngagement = 0;

      for (const row of allInsights) {
        if (row.churnRisk in distribution) distribution[row.churnRisk]++;
        totalEngagement += row.engagementScore;
      }

      const total = allInsights.length;
      const avgEngagement = total > 0 ? Math.round(totalEngagement / total) : 0;

      // Paginated at-risk customers
      const offset = (input.page - 1) * input.limit;
      const paginatedInsights = allInsights.slice(offset, offset + input.limit);

      const atRiskCustomers = paginatedInsights.map((row) => {
        const slaHours = slaHoursMap[row.churnRisk] ?? 720;
        const slaDeadline = new Date(row.updatedAt.getTime() + slaHours * 3600000);
        return {
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          entityName: row.entityName,
          riskLevel: row.churnRisk as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL',
          engagementScore: row.engagementScore,
          slaHours,
          slaDeadline: slaDeadline.toISOString(),
          nextBestAction: row.nextBestAction,
          recommendations: Array.isArray(row.recommendations) ? row.recommendations as string[] : [],
          lastEngagementDays: row.lastEngagementDays,
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      // Trends grouped by date
      const trendMap = new Map<string, { critical: number; high: number; medium: number; low: number; minimal: number; totalEng: number; count: number }>();
      for (const row of allInsights) {
        const dateKey = row.updatedAt.toISOString().split('T')[0];
        if (!trendMap.has(dateKey)) {
          trendMap.set(dateKey, { critical: 0, high: 0, medium: 0, low: 0, minimal: 0, totalEng: 0, count: 0 });
        }
        const bucket = trendMap.get(dateKey)!;
        const key = row.churnRisk.toLowerCase() as 'critical' | 'high' | 'medium' | 'low' | 'minimal';
        if (key in bucket) (bucket as Record<string, number>)[key]++;
        bucket.totalEng += row.engagementScore;
        bucket.count++;
      }

      const trendEntries = Array.from(trendMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      const trends = trendEntries.map(([date, b]) => ({
        date,
        critical: b.critical,
        high: b.high,
        medium: b.medium,
        low: b.low,
        minimal: b.minimal,
        avgEngagement: b.count > 0 ? Math.round(b.totalEng / b.count) : 0,
      }));

      return {
        stats: {
          total,
          critical: distribution.CRITICAL,
          high: distribution.HIGH,
          medium: distribution.MEDIUM,
          low: distribution.LOW,
          minimal: distribution.MINIMAL,
          avgEngagement,
        },
        distribution,
        atRiskCustomers,
        trends,
      };
    }),
});

export type IntelligenceRouter = typeof intelligenceRouter;
