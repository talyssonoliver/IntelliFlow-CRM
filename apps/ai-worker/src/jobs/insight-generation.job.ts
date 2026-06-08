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
  InsightGenerationChain,
  type GeneratedInsight,
} from '../chains/insight-generation.chain';
import { resolveFallbackProvider } from '../lib/llm-factory';
// Fix #14: hallucination checker
import { hallucinationChecker } from '../monitoring/hallucination-checker';
// Fix #20: conversation record audit logging
import { logConversationRecord } from '../utils/conversation-record-logger';
// H4: AI_AGENT audit entries
import { logAIAgentAction } from '../utils/audit-log';
import { runWithLogContext } from '../utils/logger';
import { getCurrentLogContext } from '@intelliflow/observability';
import { isAiFeatureEnabled } from '../lib/feature-flags';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

const logger = pino({
  name: 'insight-generation-job',
  level: process.env.LOG_LEVEL || 'info',
  mixin: () => getCurrentLogContext() ?? {},
});

// ============================================================================
// Types
// ============================================================================

/** Queue name for insight generation jobs */
export const INSIGHT_QUEUE = 'ai-insights';

/** Schema for insight job data */
export const InsightJobDataSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
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
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type InsightJobData = z.infer<typeof InsightJobDataSchema>;

/** Schema for insight job result */
export const InsightJobResultSchema = z.object({
  insightsCreated: z.number(),
  processingTimeMs: z.number(),
  processedAt: z.iso.datetime(),
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
      where: { leadId_tenantId: { leadId: lead.id, tenantId } },
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
        recommendations: llm?.suggestedActions ?? [
          'Send personalized follow-up',
          'Schedule a discovery call',
        ],
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
        recommendations: llm?.suggestedActions ?? [
          'Schedule a follow-up',
          'Review open opportunities',
        ],
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
    jobData.hotLeads.map((lead) =>
      upsertLeadInsight(prisma, lead, insightMap.get(lead.id), tenantId)
    )
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
// Priority-Based TTL
// ============================================================================

/** Returns TTL in milliseconds based on insight priority */
function getInsightTTL(priority: string): number {
  switch (priority) {
    case 'critical':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    case 'high':
      return 3 * 24 * 60 * 60 * 1000; // 3 days
    case 'low':
      return 12 * 60 * 60 * 1000; // 12 hours
    default:
      return 24 * 60 * 60 * 1000; // 24 hours (medium / unknown)
  }
}

/**
 * Verifies that an entity referenced by an insight still exists in the database.
 * Returns false if the entity has been deleted/converted since the insight was generated.
 * This prevents persisting insights with dead links that lead to "Not Found" pages.
 */
async function entityExists(
  prisma: any,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  tenantId: string
): Promise<boolean> {
  if (!entityType || !entityId) return true; // aggregate insights are always valid
  const modelMap: Record<string, string> = {
    lead: 'lead',
    contact: 'contact',
    opportunity: 'opportunity',
    deal: 'opportunity',
    account: 'account',
    task: 'task',
  };
  const modelName = modelMap[entityType];
  if (!modelName || !prisma[modelName]) return true; // unknown type — don't block
  try {
    const row = await prisma[modelName].findFirst({
      where: { id: entityId, tenantId },
      select: { id: true },
    });
    return row !== null;
  } catch {
    return true; // on error, don't block — let the insight through
  }
}

/** Build a link path for an entity, with fallback for aggregate insight types */
function buildEntityLink(
  entityType: string | undefined,
  entityId: string | undefined,
  insightType?: string
): string | null {
  if (entityType && entityId) {
    const pluralMap: Record<string, string> = {
      lead: 'leads',
      contact: 'contacts',
      opportunity: 'opportunities',
      deal: 'opportunities',
      account: 'accounts',
    };
    const plural = pluralMap[entityType] || `${entityType}s`;
    return `/${plural}/${entityId}`;
  }
  // Fallback routes for aggregate/non-entity insights
  const insightRouteMap: Record<string, string> = {
    reminder: '/tasks?filter=overdue',
    trend: '/dashboard',
    warning: '/deals',
    opportunity: '/leads',
  };
  return (insightType && insightRouteMap[insightType]) || null;
}

// ============================================================================
// Payload Guardrails
// ============================================================================

/**
 * Maximum items per category sent to the LLM.
 * Keeps prompt within token budgets and prevents stalls on large tenants.
 * Items are priority-sorted so the most important ones are always included.
 */
const MAX_DEALS_PER_JOB = 10;
const MAX_LEADS_PER_JOB = 10;
const MAX_CONTACTS_PER_JOB = 10;

/** Sort deals by value DESC then by staleness DESC, slice to limit */
function capDeals(deals: InsightJobData['dealsAtRisk'], max: number) {
  return [...deals]
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.daysSinceUpdate - a.daysSinceUpdate)
    .slice(0, max);
}

/** Sort leads by score DESC, slice to limit */
function capLeads(leads: InsightJobData['hotLeads'], max: number) {
  return [...leads].sort((a, b) => b.score - a.score).slice(0, max);
}

/** Sort contacts by staleness DESC (nulls = never contacted → most urgent), slice to limit */
function capContacts(contacts: InsightJobData['staleContacts'], max: number) {
  return [...contacts]
    .sort((a, b) => (b.daysSinceContact ?? 999) - (a.daysSinceContact ?? 999))
    .slice(0, max);
}

// ============================================================================
// Job Handler Helpers
// ============================================================================

async function gatherTenantHeuristicData(prisma: any, tenantId: string) {
  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const FOURTEEN_DAYS_AGO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  return Promise.all([
    prisma.opportunity.findMany({
      where: { tenantId, updatedAt: { lt: SEVEN_DAYS_AGO } },
      select: { id: true, name: true, stage: true, value: true, updatedAt: true },
      take: 20,
    }),
    prisma.lead.findMany({
      where: { tenantId, score: { gte: 60 } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        score: true,
        company: true,
        status: true,
      },
      take: 20,
    }),
    prisma.task.count({
      where: { tenantId, dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } },
    }),
    prisma.contact.findMany({
      where: { tenantId, lastContactedAt: { lt: FOURTEEN_DAYS_AGO } },
      select: { id: true, firstName: true, lastName: true, lastContactedAt: true },
      take: 20,
    }),
  ]);
}

function buildTenantJobPayload(
  tenantId: string,
  userId: string,
  dealsAtRisk: Array<{
    id: string;
    name: string;
    stage: string | null;
    value: unknown;
    updatedAt: Date;
  }>,
  hotLeads: Array<{
    id: string;
    firstName: string;
    lastName: string;
    score: number | null;
    company: string | null;
    status: string | null;
  }>,
  overdueCount: number,
  staleContacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    lastContactedAt: Date | null;
  }>
) {
  return {
    tenantId,
    userId,
    dealsAtRisk: dealsAtRisk.map((d) => ({
      id: d.id,
      name: d.name,
      daysSinceUpdate: Math.floor((Date.now() - d.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
      stage: d.stage ?? undefined,
      value: d.value ? Number(d.value) : undefined,
    })),
    hotLeads: hotLeads.map((l) => ({
      id: l.id,
      name: l.company ? `${l.company} lead` : `Lead ${l.id.slice(0, 8)}`,
      score: l.score ?? 0,
      company: l.company ?? undefined,
      status: l.status ?? undefined,
    })),
    overdueTasksCount: overdueCount,
    staleContacts: staleContacts.map((c) => ({
      id: c.id,
      name: `Contact ${c.id.slice(0, 8)}`,
      daysSinceContact: c.lastContactedAt
        ? Math.floor((Date.now() - c.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    })),
    correlationId: `scheduled-insight-${tenantId}-${Date.now()}`,
  };
}

async function dispatchScheduledInsights(
  job: Job<InsightJobData>,
  startTime: number
): Promise<InsightJobResult> {
  logger.info({ jobId: job.id }, 'Scheduled insight dispatcher — enumerating active tenants');
  let enqueued = 0;
  try {
    const { prisma } = await import('@intelliflow/db');
    const { Queue } = await import('bullmq');

    // M4 encryption wraps prisma in $extends — the extended client's .groupBy
    // signature doesn't narrow cleanly for this call pattern. Cast matches the
    // pattern used in packages/db/src/client.ts withTransaction helpers.
    const activeTenants = await (prisma.lead as any).groupBy({
      by: ['tenantId'],
      where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      _count: true,
    });

    if (activeTenants.length === 0) {
      logger.info(
        { jobId: job.id },
        'No active tenants found — skipping scheduled insight refresh'
      );
      return {
        insightsCreated: 0,
        processingTimeMs: Date.now() - startTime,
        processedAt: new Date().toISOString(),
      };
    }

    const queue = new Queue(INSIGHT_QUEUE, {
      connection: {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });

    // NP-005/006 fix: batch-fetch admin users for all tenants in two queries
    // instead of two findFirst calls per tenant.
    const tenantIds = activeTenants.map((t: { tenantId: string }) => t.tenantId);

    const adminUsers = await prisma.user.findMany({
      where: { tenantId: { in: tenantIds }, role: 'ADMIN' },
      select: { id: true, tenantId: true },
      distinct: ['tenantId'],
    });
    const adminByTenant = new Map<string, string>(
      adminUsers.map((u: { id: string; tenantId: string }) => [u.tenantId, u.id])
    );

    // For tenants that have no ADMIN, fall back to any user — one batch query.
    const tenantsNeedingFallback = tenantIds.filter((id: string) => !adminByTenant.has(id));
    const fallbackByTenant = new Map<string, string>();
    if (tenantsNeedingFallback.length > 0) {
      const fallbackUsers = await prisma.user.findMany({
        where: { tenantId: { in: tenantsNeedingFallback } },
        select: { id: true, tenantId: true },
        distinct: ['tenantId'],
      });
      for (const u of fallbackUsers as Array<{ id: string; tenantId: string }>) {
        fallbackByTenant.set(u.tenantId, u.id);
      }
    }

    for (const tenant of activeTenants) {
      const resolvedUserId =
        adminByTenant.get(tenant.tenantId) ?? fallbackByTenant.get(tenant.tenantId);

      const [dealsAtRisk, hotLeads, overdueCount, staleContacts] = await gatherTenantHeuristicData(
        prisma,
        tenant.tenantId
      );
      const payload = buildTenantJobPayload(
        tenant.tenantId,
        resolvedUserId ?? 'system',
        dealsAtRisk,
        hotLeads,
        overdueCount,
        staleContacts
      );
      await queue.add('generate-insights', payload);
      enqueued++;
    }

    await queue.close();
    logger.info(
      { jobId: job.id, tenantsEnqueued: enqueued },
      'Scheduled insight dispatcher completed'
    );
  } catch (error) {
    logger.error(
      { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
      'Scheduled insight dispatcher failed'
    );
  }
  return {
    insightsCreated: enqueued,
    processingTimeMs: Date.now() - startTime,
    processedAt: new Date().toISOString(),
  };
}

/**
 * #324: try the SECONDARY provider once for insight generation before accepting
 * the heuristic. Returns the recovered insights, or null when no fallback is
 * configured / it also failed or itself degraded to a heuristic.
 */
async function tryInsightFallbackProvider(
  cappedData: InsightJobData,
  LLM_TIMEOUT_MS: number
): Promise<GeneratedInsight[] | null> {
  const fallbackProvider = resolveFallbackProvider();
  if (!fallbackProvider) return null;
  try {
    const fallbackChain = new InsightGenerationChain({
      tenantId: cappedData.tenantId,
      provider: fallbackProvider,
    });
    const gen = await Promise.race([
      fallbackChain.generateInsightsWithMeta({
        tenantId: cappedData.tenantId,
        userId: cappedData.userId,
        dealsAtRisk: cappedData.dealsAtRisk,
        hotLeads: cappedData.hotLeads,
        overdueTasksCount: cappedData.overdueTasksCount,
        staleContacts: cappedData.staleContacts,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`fallback insight inference timed out after ${LLM_TIMEOUT_MS}ms`)),
          LLM_TIMEOUT_MS
        )
      ),
    ]);
    // Only a real LLM result counts as recovery — if the fallback provider also
    // degraded to its own heuristic, let the primary's heuristic stand.
    return gen.source === 'fallback' ? null : gen.insights;
  } catch {
    return null;
  }
}

async function generateInsightsWithFallback(
  job: Job<InsightJobData>,
  chain: ReturnType<typeof getInsightGenerationChain>,
  cappedData: InsightJobData,
  LLM_TIMEOUT_MS: number
): Promise<{
  insights: Awaited<ReturnType<typeof chain.generateInsights>>;
  usedFallback: boolean;
}> {
  try {
    const generation = await Promise.race([
      chain.generateInsightsWithMeta({
        tenantId: cappedData.tenantId,
        userId: cappedData.userId,
        dealsAtRisk: cappedData.dealsAtRisk,
        hotLeads: cappedData.hotLeads,
        overdueTasksCount: cappedData.overdueTasksCount,
        staleContacts: cappedData.staleContacts,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM inference timed out after ${LLM_TIMEOUT_MS}ms`)),
          LLM_TIMEOUT_MS
        )
      ),
    ]);
    if (generation.source === 'fallback') {
      // Primary provider degraded to its heuristic inside the chain — try the
      // secondary provider before accepting it.
      const recovered = await tryInsightFallbackProvider(cappedData, LLM_TIMEOUT_MS);
      if (recovered) {
        logger.warn(
          { jobId: job.id },
          'Primary insight LLM degraded to heuristic — recovered via fallback provider'
        );
        return { insights: recovered, usedFallback: false };
      }
    }
    return { insights: generation.insights, usedFallback: generation.source === 'fallback' };
  } catch (error) {
    const recovered = await tryInsightFallbackProvider(cappedData, LLM_TIMEOUT_MS);
    if (recovered) {
      logger.warn(
        { jobId: job.id, primaryError: error instanceof Error ? error.message : String(error) },
        'Primary insight LLM failed — recovered via fallback provider'
      );
      return { insights: recovered, usedFallback: false };
    }
    logger.warn(
      { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
      'LLM inference failed or timed out — falling back to heuristic insights'
    );
    return { insights: chain.generateFallbackInsights(cappedData), usedFallback: true };
  }
}

async function persistInsightNotification(
  prisma: any,
  insight: {
    entityType?: string | null;
    entityId?: string | null;
    type: string;
    priority: string;
    title: string;
    description: string;
  },
  tenantId: string,
  userId: string
): Promise<void> {
  const existingNotification = await prisma.notification.findFirst({
    where: {
      tenantId,
      recipientId: userId,
      status: { in: ['PENDING', 'SENT', 'DELIVERED', 'READ'] },
      OR: [
        ...(insight.entityId ? [{ sourceId: insight.entityId }] : []),
        ...(insight.type === 'warning'
          ? [{ sourceType: 'task_overdue' }, { sourceType: 'deal_at_risk' }]
          : []),
        { subject: insight.title },
      ],
    },
  });

  if (existingNotification) return;

  const entityLink = buildEntityLink(
    insight.entityType ?? undefined,
    insight.entityId ?? undefined,
    insight.type
  );
  await prisma.notification.create({
    data: {
      tenantId,
      recipientId: userId,
      channel: 'IN_APP',
      subject: insight.title,
      body: insight.description,
      priority: insight.priority === 'critical' ? 'HIGH' : 'NORMAL',
      status: 'PENDING',
      category: 'ALERTS',
      sourceType: 'ai_insight',
      sourceId: insight.entityId ?? undefined,
      metadata: {
        notificationType: 'ai_insight',
        insightPriority: insight.priority,
        insightType: insight.type,
        ...(entityLink ? { actionUrl: entityLink } : {}),
      },
    },
  });
}

async function persistEntityActivity(
  prisma: any,
  insight: {
    entityType?: string | null;
    entityId?: string | null;
    type: string;
    priority: string;
    title: string;
    description: string;
    confidence: number;
    suggestedActions: string[];
  },
  tenantId: string
): Promise<void> {
  if (!insight.entityId) return;

  const sentiment = insight.priority === 'critical' ? 'NEGATIVE' : 'POSITIVE';
  const metadata = {
    insightType: insight.type,
    insightPriority: insight.priority,
    confidence: insight.confidence,
    suggestedActions: insight.suggestedActions,
  };

  if (insight.entityType === 'lead') {
    const existing = await prisma.leadActivity.findFirst({
      where: { leadId: insight.entityId, title: insight.title, tenantId },
    });
    if (!existing) {
      await prisma.leadActivity.create({
        data: {
          leadId: insight.entityId,
          type: 'SCORE_UPDATE',
          title: insight.title,
          description: insight.description,
          userName: 'AI Insights',
          sentiment,
          metadata,
          tenantId,
        },
      });
    }
  } else if (insight.entityType === 'contact') {
    const existing = await prisma.contactActivity.findFirst({
      where: { contactId: insight.entityId, title: insight.title, tenantId },
    });
    if (!existing) {
      await prisma.contactActivity.create({
        data: {
          contactId: insight.entityId,
          type: 'NOTE',
          title: insight.title,
          description: insight.description,
          userName: 'AI Insights',
          sentiment,
          metadata,
          tenantId,
        },
      });
    }
  }
}

async function persistInsightRecord(
  prisma: any,
  insight: GeneratedInsight,
  tenantId: string,
  userId: string,
  validatedData: InsightJobData,
  now: Date,
  job: Job<InsightJobData>
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + getInsightTTL(insight.priority));

  const existingInsight = await prisma.aIInsight.findFirst({
    where: {
      tenantId,
      title: insight.title,
      ...(insight.entityId ? { entityId: insight.entityId } : {}),
      status: { in: ['NEW', 'VIEWED', 'ACTED_ON'] },
    },
  });
  if (existingInsight) return false;

  if (insight.entityId && insight.entityType) {
    const exists = await entityExists(prisma, insight.entityType, insight.entityId, tenantId);
    if (!exists) {
      logger.info(
        { jobId: job.id, entityType: insight.entityType, entityId: insight.entityId },
        'Skipping insight — referenced entity no longer exists'
      );
      return false;
    }
  }

  const created = await prisma.aIInsight.create({
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

  // H4: emit AI_AGENT audit entry — non-fatal (warn and continue on failure)
  await logAIAgentAction({
    tenantId,
    agentName: 'insight-generation-job',
    resourceType: 'AIInsight',
    resourceId: created.id as string,
    action: 'CREATE',
  }).catch((err: unknown) => {
    logger.warn({ insightId: created.id, err }, 'audit-log: logAIAgentAction failed (non-fatal)');
  });

  return true;
}

async function persistHighPriorityInsightSideEffects(
  prisma: any,
  insight: GeneratedInsight,
  tenantId: string,
  userId: string,
  now: Date,
  _job: Job<InsightJobData>
): Promise<void> {
  if (insight.priority !== 'critical' && insight.priority !== 'high') return;

  try {
    await persistInsightNotification(prisma, insight, tenantId, userId);
    await persistEntityActivity(prisma, insight, tenantId);
  } catch (notifError) {
    logger.warn(
      { error: notifError instanceof Error ? notifError.message : String(notifError) },
      'Failed to create notification/activity for insight — non-blocking'
    );
  }

  if (insight.priority === 'critical' && insight.suggestedActions.length > 0) {
    try {
      await prisma.task.create({
        data: {
          title: `[AI] ${insight.suggestedActions[0]}`,
          description: `Auto-created from AI insight: ${insight.title}\n\nReasoning: ${insight.reasoning}`,
          status: 'PENDING',
          priority: 'HIGH',
          tenantId,
          ownerId: userId,
          dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (taskError) {
      logger.warn(
        { error: taskError instanceof Error ? taskError.message : String(taskError) },
        'Failed to create auto-task for critical insight — non-blocking'
      );
    }
  }
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
  const { tenantId, userId, correlationId } = job.data;

  return runWithLogContext(
    {
      correlationId: correlationId ?? job.id ?? undefined,
      tenantId,
      userId,
    },
    async () => {
      // Scheduled cron sentinel — enumerate active tenants and enqueue real per-tenant jobs
      if (tenantId === '__scheduled__') {
        return dispatchScheduledInsights(job, startTime);
      }

      // Validate input (tenantId now confirmed non-sentinel)
      const validatedData = InsightJobDataSchema.parse(job.data);

      // Feature-flag gate — checked after Zod validation, before LLM work
      if (!isAiFeatureEnabled('ai.insights.enabled', validatedData.tenantId)) {
        logger.info(
          { jobId: job.id, tenantId: validatedData.tenantId },
          'AI insights job skipped — feature flag disabled'
        );
        return { skipped: true, reason: 'feature-flag-disabled' } as unknown as InsightJobResult;
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

      // Cap arrays to prevent LLM token overflow and stalls on large tenants.
      // Items are priority-sorted so the most important ones are always analysed.
      const cappedDeals = capDeals(validatedData.dealsAtRisk, MAX_DEALS_PER_JOB);
      const cappedLeads = capLeads(validatedData.hotLeads, MAX_LEADS_PER_JOB);
      const cappedContacts = capContacts(validatedData.staleContacts, MAX_CONTACTS_PER_JOB);

      const truncated =
        cappedDeals.length < validatedData.dealsAtRisk.length ||
        cappedLeads.length < validatedData.hotLeads.length ||
        cappedContacts.length < validatedData.staleContacts.length;

      if (truncated) {
        logger.info(
          {
            jobId: job.id,
            original: {
              deals: validatedData.dealsAtRisk.length,
              leads: validatedData.hotLeads.length,
              contacts: validatedData.staleContacts.length,
            },
            capped: {
              deals: cappedDeals.length,
              leads: cappedLeads.length,
              contacts: cappedContacts.length,
            },
          },
          'Payload truncated to fit LLM prompt budget — highest-priority items retained'
        );
      }

      const cappedData = {
        ...validatedData,
        dealsAtRisk: cappedDeals,
        hotLeads: cappedLeads,
        staleContacts: cappedContacts,
      };

      await job.updateProgress(10);

      // Extend lock before the potentially long-running LLM call to prevent
      // BullMQ stall detection from killing the job mid-inference.
      await job.extendLock(job.token!, 300_000); // 5 minutes

      // Generate insights via chain, with a timeout guard so a hanging LLM
      // (e.g. Ollama not running) doesn't stall the worker indefinitely.
      const LLM_TIMEOUT_MS = 120_000; // 2 minutes
      const chain = getInsightGenerationChain();
      const llmStartTime = Date.now();

      const { insights, usedFallback } = await generateInsightsWithFallback(
        job,
        chain,
        cappedData,
        LLM_TIMEOUT_MS
      );

      const llmDuration = Date.now() - llmStartTime;

      // Fix #20: log conversation record for audit trail (only when LLM was actually called)
      if (!usedFallback) {
        logConversationRecord(logger, {
          conversationId: `insight-${tenantId}-${job.id ?? Date.now()}`,
          model: `${process.env.AI_PROVIDER || 'mock'}:insight-generation:v1`,
          tokenCountInput: 0, // token usage tracked via cost-tracker callbacks
          tokenCountOutput: 0,
          duration: llmDuration,
          chainType: 'INSIGHT_GENERATION',
          tenantId,
        });
      }

      // Fix #14: hallucination check on first insight's description — log warning, do NOT block
      if (!usedFallback && insights.length > 0) {
        const firstInsight = insights[0];
        const inputSummary = `Deals: ${cappedData.dealsAtRisk.length}, Leads: ${cappedData.hotLeads.length}, Overdue: ${cappedData.overdueTasksCount}`;
        const hallucinationResult = await hallucinationChecker.checkOutput({
          id: `insight-${tenantId}-${job.id ?? Date.now()}`,
          model: `${process.env.AI_PROVIDER || 'mock'}:insight-generation:v1`,
          inputContext: inputSummary,
          output: firstInsight.description,
        });

        if (hallucinationResult.hallucinated) {
          logger.warn(
            {
              jobId: job.id,
              tenantId,
              hallucinationScore: hallucinationResult.score,
              hallucinationTypes: hallucinationResult.hallucinationTypes,
            },
            'Hallucination detected in insight generation output — output not blocked, flagged for monitoring'
          );
        }
      }

      await job.updateProgress(60);

      // Persist insights to AIInsight table
      // Dynamic import to avoid circular deps — Prisma client lives in @intelliflow/db
      const { prisma } = await import('@intelliflow/db');

      // Extend lock again before the DB write loop (many insights = many round-trips)
      await job.extendLock(job.token!, 300_000);

      const now = new Date();

      let insightsCreated = 0;

      for (const insight of insights) {
        const created = await persistInsightRecord(
          prisma,
          insight,
          tenantId,
          userId,
          validatedData,
          now,
          job
        );
        if (!created) continue;
        insightsCreated++;
        await persistHighPriorityInsightSideEffects(prisma, insight, tenantId, userId, now, job);
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
  );
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
