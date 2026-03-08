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
// Entity-Level Insight Population — helpers
// ============================================================================

/** Derive churn-risk label from a lead engagement score */
function leadChurnRisk(score: number): string {
  if (score >= 75) return 'MINIMAL';
  if (score >= 60) return 'LOW';
  if (score >= 40) return 'MEDIUM';
  return 'HIGH';
}

/** Derive sentiment label from a 0-100 score */
function scoreSentiment(score: number): string {
  if (score >= 65) return 'POSITIVE';
  if (score >= 35) return 'NEUTRAL';
  return 'NEGATIVE';
}

/** Derive ICP-match label for a lead */
function leadIcpMatch(score: number, company: string | undefined): string {
  if (score >= 80 && company) return 'Strong Match';
  if (score >= 65) return 'Good Match';
  return 'Partial Match';
}

/** Derive churn-risk label from days since last contact */
function contactChurnRisk(daysSince: number): string {
  if (daysSince > 30) return 'HIGH';
  if (daysSince > 14) return 'MEDIUM';
  return 'LOW';
}

/** Build the LLM-derived update fields (empty object when no LLM insight) */
function llmUpdateFields(llm: GeneratedInsight | undefined): Record<string, unknown> {
  if (!llm) return {};
  return {
    nextBestAction: llm.suggestedActions[0],
    recommendations: llm.suggestedActions,
  };
}

/**
 * Upsert a single LeadAIInsight row.
 * Returns true on success, false if the entity no longer exists.
 */
async function upsertLeadInsight(
  prisma: any,
  lead: InsightJobData['hotLeads'][number],
  llm: GeneratedInsight | undefined,
  tenantId: string
): Promise<boolean> {
  try {
    const score = lead.score;
    await prisma.leadAIInsight.upsert({
      where: { leadId: lead.id },
      create: {
        leadId: lead.id,
        tenantId,
        engagementScore: Math.min(100, score),
        conversionProbability: Math.min(100, Math.round(score * 0.8)),
        estimatedValue: 0,
        churnRisk: leadChurnRisk(score),
        nextBestAction: llm?.suggestedActions[0] ?? 'Send personalized follow-up',
        sentiment: scoreSentiment(score),
        sentimentTrend: lead.status?.toUpperCase() === 'QUALIFIED' ? 'improving' : 'stable',
        recommendations: llm?.suggestedActions ?? ['Send personalized follow-up', 'Schedule a discovery call'],
        lastEngagementDays: 0,
        icpMatch: leadIcpMatch(score, lead.company),
      },
      update: llmUpdateFields(llm),
    });
    return true;
  } catch {
    // Entity may have been deleted between enqueue and processing
    return false;
  }
}

/**
 * Upsert a single ContactAIInsight row.
 * Returns true on success, false if the entity no longer exists.
 */
async function upsertContactInsight(
  prisma: any,
  contact: InsightJobData['staleContacts'][number],
  llm: GeneratedInsight | undefined,
  tenantId: string
): Promise<boolean> {
  try {
    const daysSince = contact.daysSinceContact ?? 90;
    const engScore = Math.max(0, 100 - daysSince * 2);
    const churnRisk = contactChurnRisk(daysSince);
    await prisma.contactAIInsight.upsert({
      where: { contactId: contact.id },
      create: {
        contactId: contact.id,
        tenantId,
        engagementScore: engScore,
        conversionProbability: contact.hasOpenOpportunities ? Math.max(10, 50 - daysSince) : 10,
        lifetimeValue: 0,
        churnRisk,
        nextBestAction: llm?.suggestedActions[0] ?? 'Schedule a follow-up',
        sentiment: scoreSentiment(engScore),
        sentimentTrend: daysSince > 30 ? 'declining' : 'stable',
        recommendations: llm?.suggestedActions ?? ['Schedule a follow-up', 'Review open opportunities'],
        lastEngagementDays: daysSince,
      },
      update: {
        lastEngagementDays: daysSince,
        churnRisk,
        ...llmUpdateFields(llm),
      },
    });
    return true;
  } catch {
    // Entity may have been deleted between enqueue and processing
    return false;
  }
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

  const leadResults = await Promise.all(
    jobData.hotLeads.map((lead) => upsertLeadInsight(prisma, lead, insightMap.get(lead.id), tenantId))
  );
  const contactResults = await Promise.all(
    jobData.staleContacts.map((contact) =>
      upsertContactInsight(prisma, contact, insightMap.get(contact.id), tenantId)
    )
  );

  return {
    leads: leadResults.filter(Boolean).length,
    contacts: contactResults.filter(Boolean).length,
  };
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

  // Scheduled cron sentinel — enumerate active tenants and enqueue real per-tenant jobs
  if (tenantId === '__scheduled__') {
    logger.info({ jobId: job.id }, 'Scheduled insight dispatcher — enumerating active tenants');
    let enqueued = 0;
    try {
      const { prisma } = await import('@intelliflow/db');
      const { Queue } = await import('bullmq');

      // Find tenants with recent activity (leads updated in the last 7 days)
      const activeTenants = await prisma.lead.groupBy({
        by: ['tenantId'],
        where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        _count: true,
      });

      if (activeTenants.length === 0) {
        logger.info({ jobId: job.id }, 'No active tenants found — skipping scheduled insight refresh');
        return { insightsCreated: 0, processingTimeMs: Date.now() - startTime, processedAt: new Date().toISOString() };
      }

      const queue = new Queue(INSIGHT_QUEUE, {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        },
      });

      for (const tenant of activeTenants) {
        // Gather heuristic data for this tenant
        const [dealsAtRisk, hotLeads, overdueCount, staleContacts] = await Promise.all([
          prisma.opportunity.findMany({
            where: { tenantId: tenant.tenantId, updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            select: { id: true, name: true, stage: true, value: true, updatedAt: true },
            take: 20,
          }),
          prisma.lead.findMany({
            where: { tenantId: tenant.tenantId, score: { gte: 60 } },
            select: { id: true, firstName: true, lastName: true, score: true, company: true, status: true },
            take: 20,
          }),
          prisma.task.count({
            where: { tenantId: tenant.tenantId, dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } },
          }),
          prisma.contact.findMany({
            where: { tenantId: tenant.tenantId, lastContactedAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
            select: { id: true, firstName: true, lastName: true, lastContactedAt: true },
            take: 20,
          }),
        ]);

        await queue.add('generate-insights', {
          tenantId: tenant.tenantId,
          userId: 'system',
          dealsAtRisk: dealsAtRisk.map((d) => ({
            id: d.id,
            name: d.name,
            daysSinceUpdate: Math.floor((Date.now() - d.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
            stage: d.stage ?? undefined,
            value: d.value ? Number(d.value) : undefined,
          })),
          hotLeads: hotLeads.map((l) => ({
            id: l.id,
            name: [l.firstName, l.lastName].filter(Boolean).join(' ') || 'Unknown',
            score: l.score ?? 0,
            company: l.company ?? undefined,
            status: l.status ?? undefined,
          })),
          overdueTasksCount: overdueCount,
          staleContacts: staleContacts.map((c) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
            daysSinceContact: c.lastContactedAt
              ? Math.floor((Date.now() - c.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
              : null,
          })),
          correlationId: `scheduled-insight-${tenant.tenantId}-${Date.now()}`,
        });
        enqueued++;
      }

      await queue.close();
      logger.info({ jobId: job.id, tenantsEnqueued: enqueued }, 'Scheduled insight dispatcher completed');
    } catch (error) {
      logger.error(
        { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
        'Scheduled insight dispatcher failed'
      );
    }
    return { insightsCreated: enqueued, processingTimeMs: Date.now() - startTime, processedAt: new Date().toISOString() };
  }

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
  attempts: 3,
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
