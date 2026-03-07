/**
 * Insight Generation Job Handler
 *
 * BullMQ job handler for processing AI insight generation requests.
 * Receives CRM data gathered by heuristic queries, feeds it to the
 * InsightGenerationChain, and persists rich AI insights to the AIInsight table.
 *
 * @module ai-worker/jobs/insight-generation
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import {
  getInsightGenerationChain,
  type GeneratedInsight,
} from '../chains/insight-generation.chain';

const logger = pino({
  name: 'insight-generation-job',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

/** Queue name for insight generation jobs */
export const INSIGHT_QUEUE = 'ai-insights';

/** Schema for insight job data */
export const InsightJobDataSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  correlationId: z.string().optional(),
  dealsAtRisk: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        daysSinceUpdate: z.number(),
        stage: z.string().optional(),
        value: z.number().optional(),
      })
    )
    .default([]),
  hotLeads: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        score: z.number(),
        company: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .default([]),
  overdueTasksCount: z.number().default(0),
  staleContacts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        daysSinceContact: z.number().nullable(),
        hasOpenOpportunities: z.boolean().optional(),
      })
    )
    .default([]),
});

export type InsightJobData = z.infer<typeof InsightJobDataSchema>;

/** Schema for insight job result */
export const InsightJobResultSchema = z.object({
  insightsCreated: z.number(),
  processingTimeMs: z.number(),
  processedAt: z.string().datetime(),
});

export type InsightJobResult = z.infer<typeof InsightJobResultSchema>;

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Maps frontend insight types to AIInsight DB type values
 */
function mapInsightTypeToDbType(type: GeneratedInsight['type']): string {
  const typeMap: Record<string, string> = {
    warning: 'anomaly',
    opportunity: 'recommendation',
    reminder: 'trend',
    achievement: 'prediction',
  };
  return typeMap[type] || 'recommendation';
}

/**
 * Maps insight entity type to AIInsight DB category
 */
function mapEntityTypeToCategory(entityType: GeneratedInsight['entityType']): string {
  const categoryMap: Record<string, string> = {
    opportunity: 'risk',
    deal: 'risk',
    lead: 'sales',
    contact: 'engagement',
    task: 'support',
  };
  return entityType ? categoryMap[entityType] || 'sales' : 'sales';
}

// ============================================================================
// Entity-Level Insight Population
// ============================================================================

/**
 * Populate entity-level insight tables (LeadAIInsight / ContactAIInsight)
 * so that entity 360 pages display rich AI-derived data.
 *
 * Uses job input data (scores, recency) for numeric fields and
 * LLM-generated insights for text fields (nextBestAction, recommendations).
 */
async function populateEntityInsights(
  prisma: any,
  jobData: InsightJobData,
  generatedInsights: GeneratedInsight[],
  tenantId: string
): Promise<{ leads: number; contacts: number }> {
  const insightMap = new Map<string, GeneratedInsight>();
  for (const insight of generatedInsights) {
    if (insight.entityId) insightMap.set(insight.entityId, insight);
  }

  let leads = 0;
  let contacts = 0;

  for (const lead of jobData.hotLeads) {
    try {
      const llm = insightMap.get(lead.id);
      const score = lead.score;

      await prisma.leadAIInsight.upsert({
        where: { leadId: lead.id },
        create: {
          leadId: lead.id,
          tenantId,
          engagementScore: Math.min(100, score),
          conversionProbability: Math.min(100, Math.round(score * 0.8)),
          estimatedValue: 0,
          churnRisk: score >= 75 ? 'MINIMAL' : score >= 60 ? 'LOW' : score >= 40 ? 'MEDIUM' : 'HIGH',
          nextBestAction: llm?.suggestedActions[0] || 'Send personalized follow-up',
          sentiment: score >= 65 ? 'POSITIVE' : score >= 35 ? 'NEUTRAL' : 'NEGATIVE',
          sentimentTrend: lead.status?.toUpperCase() === 'QUALIFIED' ? 'improving' : 'stable',
          recommendations: llm?.suggestedActions || ['Send personalized follow-up', 'Schedule a discovery call'],
          lastEngagementDays: 0,
          icpMatch: score >= 80 && lead.company ? 'Strong Match' : score >= 65 ? 'Good Match' : 'Partial Match',
        },
        update: {
          ...(llm
            ? {
                nextBestAction: llm.suggestedActions[0],
                recommendations: llm.suggestedActions,
              }
            : {}),
        },
      });
      leads++;
    } catch {
      // Entity may have been deleted between enqueue and processing
    }
  }

  for (const contact of jobData.staleContacts) {
    try {
      const llm = insightMap.get(contact.id);
      const daysSince = contact.daysSinceContact ?? 90;
      const engScore = Math.max(0, 100 - daysSince * 2);

      await prisma.contactAIInsight.upsert({
        where: { contactId: contact.id },
        create: {
          contactId: contact.id,
          tenantId,
          engagementScore: engScore,
          conversionProbability: contact.hasOpenOpportunities ? Math.max(10, 50 - daysSince) : 10,
          lifetimeValue: 0,
          churnRisk: daysSince > 30 ? 'HIGH' : daysSince > 14 ? 'MEDIUM' : 'LOW',
          nextBestAction: llm?.suggestedActions[0] || 'Schedule a follow-up',
          sentiment: engScore >= 65 ? 'POSITIVE' : engScore >= 35 ? 'NEUTRAL' : 'NEGATIVE',
          sentimentTrend: daysSince > 30 ? 'declining' : 'stable',
          recommendations: llm?.suggestedActions || ['Schedule a follow-up', 'Review open opportunities'],
          lastEngagementDays: daysSince,
        },
        update: {
          lastEngagementDays: daysSince,
          churnRisk: daysSince > 30 ? 'HIGH' : daysSince > 14 ? 'MEDIUM' : 'LOW',
          ...(llm
            ? {
                nextBestAction: llm.suggestedActions[0],
                recommendations: llm.suggestedActions,
              }
            : {}),
        },
      });
      contacts++;
    } catch {
      // Entity may have been deleted between enqueue and processing
    }
  }

  return { leads, contacts };
}

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Process an insight generation job
 *
 * @param job - BullMQ job containing CRM data for insight analysis
 * @returns Result with count of insights created
 */
export async function processInsightJob(job: Job<InsightJobData>): Promise<InsightJobResult> {
  const startTime = Date.now();
  const { tenantId, userId } = job.data;

  logger.info(
    {
      jobId: job.id,
      tenantId,
      dealsCount: job.data.dealsAtRisk.length,
      leadsCount: job.data.hotLeads.length,
    },
    'Processing insight generation job'
  );

  // Validate input
  const validatedData = InsightJobDataSchema.parse(job.data);

  await job.updateProgress(10);

  // Generate insights via chain
  const chain = getInsightGenerationChain();
  const insights = await chain.generateInsights({
    tenantId: validatedData.tenantId,
    userId: validatedData.userId,
    dealsAtRisk: validatedData.dealsAtRisk,
    hotLeads: validatedData.hotLeads,
    overdueTasksCount: validatedData.overdueTasksCount,
    staleContacts: validatedData.staleContacts,
  });

  await job.updateProgress(60);

  // Persist insights to AIInsight table
  // Dynamic import to avoid circular deps — Prisma client lives in @intelliflow/db
  const { prisma } = await import('@intelliflow/db');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h TTL

  let insightsCreated = 0;

  for (const insight of insights) {
    await prisma.aIInsight.create({
      data: {
        type: mapInsightTypeToDbType(insight.type),
        category: mapEntityTypeToCategory(insight.entityType),
        title: insight.title,
        description: insight.description,
        confidence: Math.round(insight.confidence * 100),
        priority: insight.priority,
        entityType: insight.entityType === 'deal' ? 'opportunity' : insight.entityType,
        entityId: insight.entityId,
        actionable: insight.suggestedActions.length > 0,
        suggestedActions: insight.suggestedActions,
        metadata: {
          userId,
          reasoning: insight.reasoning,
          modelVersion: `${process.env.AI_PROVIDER || 'mock'}:insight-generation:v1`,
          dataQuality: insight.confidence >= 0.7 ? 'complete' : 'partial',
          correlationId: validatedData.correlationId,
        },
        status: 'NEW',
        expiresAt,
        tenantId,
      },
    });
    insightsCreated++;
  }

  await job.updateProgress(80);

  // Populate entity-level insight tables for lead/contact 360 pages
  const entityStats = await populateEntityInsights(prisma, validatedData, insights, tenantId);

  await job.updateProgress(100);

  const processingTimeMs = Date.now() - startTime;

  logger.info(
    {
      jobId: job.id,
      insightsCreated,
      entityInsights: entityStats,
      processingTimeMs,
    },
    'Insight generation job completed'
  );

  return {
    insightsCreated,
    processingTimeMs,
    processedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Job Options
// ============================================================================

/** Default job options for insight generation jobs */
export const DEFAULT_INSIGHT_JOB_OPTIONS = {
  attempts: 2,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
  },
};
