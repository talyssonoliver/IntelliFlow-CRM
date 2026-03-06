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
    lead: 'sales',
    contact: 'engagement',
    task: 'support',
  };
  return entityType ? categoryMap[entityType] || 'sales' : 'sales';
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
        entityType: insight.entityType,
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

  await job.updateProgress(100);

  const processingTimeMs = Date.now() - startTime;

  logger.info(
    {
      jobId: job.id,
      insightsCreated,
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
