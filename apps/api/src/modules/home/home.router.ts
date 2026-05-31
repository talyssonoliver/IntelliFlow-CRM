/**
 * Home Page Router
 *
 * Provides type-safe tRPC endpoints for the authenticated home page:
 * - Welcome summary with daily stats
 * - AI insights
 * - Daily goal progress
 * - Pinned items management
 *
 * Note: Activity feed is served by activityFeed.getUnifiedFeed (IFC-069).
 *
 * Task: IFC-182 - Home Page tRPC Router
 * KPIs: All endpoints <200ms; test coverage >=90%
 */

import { context as otelContext, propagation } from '@opentelemetry/api';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { type Context } from '../../context';
import { loadBullMQ } from '../../lib/load-bullmq';
import {
  pinItemInputSchema,
  unpinItemInputSchema,
  reorderPinnedItemsInputSchema,
  updateDailyGoalInputSchema,
  getAllInsightsQuerySchema,
  GOAL_DEFAULTS,
  type WelcomeSummary,
  type AIInsightsResponse,
  type GetAllInsightsResponse,
  type DailyGoalResponse,
  type PinnedItemsResponse,
  type GoalType,
} from '@intelliflow/validators';
import { z } from 'zod';
import {
  startOfDayInTimezone,
  endOfDayInTimezone,
  getHourInTimezone,
  safeTimezone,
} from '../../lib/timezone-utils';

/**
 * Maps pinnable entity types to their Prisma model delegate names.
 * 'list' is intentionally absent — no Prisma model exists for it.
 * PG-159: Used for stale pin existence checking.
 */
const ENTITY_MODEL_MAP: Record<string, string> = {
  lead: 'lead',
  contact: 'contact',
  account: 'account',
  opportunity: 'opportunity',
  ticket: 'ticket',
  document: 'document',
  report: 'reportDefinition',
};

async function checkEntityExists(
  prisma: Context['prisma'],
  entityType: string,
  entityId: string,
  tenantId: string
): Promise<boolean> {
  const modelName = ENTITY_MODEL_MAP[entityType];
  if (!modelName) {
    // Entity types without a model (e.g., 'list') are always considered available
    return true;
  }
  const model = (prisma as any)[modelName];
  const result = await model.findFirst({
    where: { id: entityId, tenantId },
    select: { id: true },
  });
  return !!result;
}

function getGreeting(timezone: string = 'Europe/London'): string {
  let hour: number;
  try {
    hour = getHourInTimezone(timezone);
  } catch {
    hour = getHourInTimezone('UTC');
  }
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// =============================================================================
// Constants
// =============================================================================

/** Days since last interaction before a deal is considered at risk */
const DEAL_RISK_DAYS = 14;

/** Minimum lead score to be considered a "hot" lead */
const HOT_LEAD_SCORE = 80;

/** IFC-192: Days threshold for stale contact warnings */
const STALE_CONTACT_DAYS = 30;

/** Default SLA for optional AI output reviews created from insights */
const INSIGHT_REVIEW_SLA_HOURS = 24;

// =============================================================================
// AI Insight Helpers
// =============================================================================

type InsightResponseItem = AIInsightsResponse['insights'][number] & {
  requiresApproval?: boolean;
};
type GetInsightByIdResponse = { insight: InsightResponseItem };
type EnsureInsightReviewResponse = {
  created: boolean;
  reviewId: string | null;
  requiresApproval: boolean;
};

const getInsightByIdInputSchema = z.object({
  insightId: z.string().min(1),
});

const ensureInsightReviewInputSchema = z.object({
  insightId: z.string().min(1),
});

/**
 * Maps DB AIInsight type to frontend type
 */
function mapDbTypeToFrontend(
  dbType: string
): 'warning' | 'opportunity' | 'reminder' | 'achievement' {
  const typeMap: Record<string, 'warning' | 'opportunity' | 'reminder' | 'achievement'> = {
    anomaly: 'warning',
    recommendation: 'opportunity',
    trend: 'reminder',
    prediction: 'achievement',
  };
  return typeMap[dbType] || 'reminder';
}

/**
 * Maps DB priority to validator-accepted priority ('low' | 'medium' | 'high')
 */
function mapDbPriority(dbPriority: string): 'low' | 'medium' | 'high' {
  if (dbPriority === 'critical' || dbPriority === 'high') return 'high';
  if (dbPriority === 'medium') return 'medium';
  return 'low';
}

/**
 * Constructs an action URL from entity type and ID
 */
function buildActionUrl(
  entityType: string | null,
  entityId: string | null,
  title?: string
): string | null {
  // Aggregate insights (e.g. overdue tasks) have no entity or entityType 'task' with no entityId
  if (entityType === 'task' && !entityId) return '/tasks?filter=overdue';
  if (!entityType && !entityId) {
    // Fallback: infer from title for known aggregate patterns
    if (title && /overdue\s+task/i.test(title)) return '/tasks?filter=overdue';
    return null;
  }
  if (!entityType || !entityId) return null;
  const routeMap: Record<string, string> = {
    opportunity: 'deals',
    lead: 'leads',
    contact: 'contacts',
    task: 'tasks',
    account: 'accounts',
  };
  const route = routeMap[entityType];
  if (!route) return null;
  const tabSuffix = ['leads', 'contacts'].includes(route) ? '?tab=ai-insights' : '';
  return `/${route}/${entityId}${tabSuffix}`;
}

function getFirstSuggestedAction(suggestedActions: unknown): string | null {
  if (!Array.isArray(suggestedActions) || suggestedActions.length === 0) {
    return null;
  }

  const first = suggestedActions[0];
  if (typeof first === 'string') {
    return first;
  }

  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const candidateKeys = ['action', 'title', 'label', 'text', 'suggestedAction'] as const;
    for (const key of candidateKeys) {
      const value = (first as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  }

  return String(first);
}

function getRequiresApproval(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).requiresApproval === true;
}

/**
 * Maps an AIInsight DB row to the validator response shape
 */
function mapAIInsightToResponse(row: {
  id: string;
  type: string;
  title: string;
  description: string;
  suggestedActions: unknown;
  entityType: string | null;
  entityId: string | null;
  priority: string;
  createdAt: Date;
  metadata?: unknown;
}): InsightResponseItem {
  return {
    id: row.id,
    type: mapDbTypeToFrontend(row.type),
    source: 'ai',
    title: row.title,
    description: row.description,
    suggestedAction: getFirstSuggestedAction(row.suggestedActions),
    entityType: row.entityType,
    entityId: row.entityId,
    actionUrl: buildActionUrl(row.entityType, row.entityId, row.title),
    requiresApproval: getRequiresApproval(row.metadata),
    priority: mapDbPriority(row.priority),
    createdAt: row.createdAt,
  };
}

/** Deduplicate insights by title — BullMQ double-enqueue can create duplicate
 *  AIInsight rows with different IDs but identical content. Keep the newest. */
function deduplicateInsights<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

/**
 * Validates that entities referenced by insights still exist in the database.
 * Returns only insights whose referenced entities are still present.
 * Stale insights (referencing deleted/converted entities) are marked EXPIRED
 * in the background to prevent repeated validation on subsequent requests.
 */
async function filterStaleInsights<
  T extends { id: string; entityType?: string | null; entityId?: string | null },
>(
  prisma: Context['prisma'],
  tenantId: string,
  insights: T[],
  timezone: string = 'UTC'
): Promise<T[]> {
  // Separate entity-linked insights from aggregate ones
  const withEntity = insights.filter((i) => i.entityId && i.entityType);
  const withoutEntity = insights.filter((i) => !i.entityId || !i.entityType);

  // Re-validate aggregate task insights (e.g. "3 Overdue Tasks") against current count.
  // These have entityType='task' but no entityId, so entity-existence checks don't apply.
  const aggregateTaskInsights = withoutEntity.filter((i) => i.entityType === 'task');
  let validWithoutEntity = withoutEntity;
  if (aggregateTaskInsights.length > 0) {
    const overdueCutoff = startOfDayInTimezone(timezone, new Date());
    const currentOverdue = await prisma.task.count({
      where: {
        tenantId,
        dueDate: { lt: overdueCutoff },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    });
    if (currentOverdue === 0) {
      const staleAggregateIds = aggregateTaskInsights.map((i) => i.id);
      validWithoutEntity = withoutEntity.filter((i) => i.entityType !== 'task');
      // Fire-and-forget: expire stale aggregate task insights
      prisma.aIInsight
        .updateMany({
          where: { id: { in: staleAggregateIds }, tenantId },
          data: { status: 'EXPIRED', dismissReason: 'No overdue tasks remain' },
        })
        .catch(() => {});
    }
  }

  if (withEntity.length === 0) return validWithoutEntity;

  // Group entity IDs by type for batch lookups
  const entityGroups = new Map<string, Set<string>>();
  for (const insight of withEntity) {
    const type = insight.entityType!;
    if (!entityGroups.has(type)) entityGroups.set(type, new Set());
    entityGroups.get(type)!.add(insight.entityId!);
  }

  // Batch-check existence per entity type
  const existingIds = new Set<string>();
  const modelMap: Record<string, string> = {
    lead: 'lead',
    contact: 'contact',
    opportunity: 'opportunity',
    deal: 'opportunity', // "deal" maps to opportunity table
    account: 'account',
    task: 'task',
  };

  await Promise.all(
    [...entityGroups.entries()].map(async ([entityType, ids]) => {
      const modelName = modelMap[entityType];
      if (!modelName || !(prisma as any)[modelName]) return;

      try {
        const existing = await (prisma as any)[modelName].findMany({
          where: { tenantId, id: { in: [...ids] } },
          select: { id: true },
        });
        for (const row of existing) existingIds.add(row.id);
      } catch {
        // If the lookup fails (e.g. model doesn't exist), keep the insights
        for (const id of ids) existingIds.add(id);
      }
    })
  );

  // Identify stale insights (entity no longer exists)
  const staleIds: string[] = [];
  const validWithEntity = withEntity.filter((insight) => {
    if (existingIds.has(insight.entityId!)) return true;
    staleIds.push(insight.id);
    return false;
  });

  // Fire-and-forget: mark stale insights as EXPIRED so they don't reappear
  if (staleIds.length > 0) {
    prisma.aIInsight
      .updateMany({
        where: { id: { in: staleIds }, tenantId },
        data: { status: 'EXPIRED', dismissReason: 'Referenced entity no longer exists' },
      })
      .catch(() => {});
  }

  return [...validWithoutEntity, ...validWithEntity];
}

/**
 * Fire-and-forget: enqueue a BullMQ job to generate AI insights
 */
/** Max items per category enqueued to the AI insight job.
 *  Prevents oversized Redis payloads and LLM prompt overflow. */
const ENQUEUE_MAX_DEALS = 10;
const ENQUEUE_MAX_LEADS = 10;
const ENQUEUE_MAX_CONTACTS = 10;
const AI_INSIGHTS_QUEUE_NAME = 'ai-insights';
const DEFAULT_AI_INSIGHTS_QUEUE_CONFIG = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
    removeOnComplete: 86400000,
    removeOnFail: 604800000,
  },
};

async function getAIInsightsQueueConfig() {
  try {
    const platformQueues = await import('@intelliflow/platform/queues/types');
    return {
      queueName: platformQueues.QUEUE_NAMES.AI_INSIGHTS,
      queueConfig:
        platformQueues.DEFAULT_QUEUE_CONFIGS[platformQueues.QUEUE_NAMES.AI_INSIGHTS] ??
        DEFAULT_AI_INSIGHTS_QUEUE_CONFIG,
    };
  } catch {
    return {
      queueName: AI_INSIGHTS_QUEUE_NAME,
      queueConfig: DEFAULT_AI_INSIGHTS_QUEUE_CONFIG,
    };
  }
}

async function enqueueInsightGeneration(
  tenantId: string,
  userId: string,
  data: {
    dealsAtRisk: Array<{ id: string; name: string; daysSinceUpdate: number }>;
    hotLeads: Array<{ id: string; name: string; score: number; company?: string | null }>;
    overdueTasksCount: number;
    staleContacts: Array<{ id: string; name: string; daysSinceContact: number | null }>;
  }
): Promise<void> {
  // Guard: reject non-UUID tenantIds (e.g. test fixtures like "test-tenant-id")
  // to prevent FK violations when the worker persists insights.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) return;

  try {
    const { Queue } = await loadBullMQ();
    const { queueName, queueConfig } = await getAIInsightsQueueConfig();
    const queue = new Queue(queueName, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      defaultJobOptions: {
        attempts: queueConfig.defaultJobOptions.attempts,
        backoff: {
          type: queueConfig.defaultJobOptions.backoff.type,
          delay: queueConfig.defaultJobOptions.backoff.delay,
        },
        removeOnComplete: queueConfig.defaultJobOptions.removeOnComplete,
        removeOnFail: queueConfig.defaultJobOptions.removeOnFail,
      },
    });

    // Cap arrays before enqueuing — the worker also caps, but trimming here
    // avoids bloated Redis payloads when callers pass 50+ items.
    const deals = data.dealsAtRisk
      .slice()
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, ENQUEUE_MAX_DEALS);
    const leads = data.hotLeads
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, ENQUEUE_MAX_LEADS);
    const contacts = data.staleContacts
      .slice()
      .sort((a, b) => (b.daysSinceContact ?? 999) - (a.daysSinceContact ?? 999))
      .slice(0, ENQUEUE_MAX_CONTACTS);

    // Use a deterministic jobId so double-enqueue from getAIInsights +
    // getAllInsights is deduplicated by BullMQ (same ID = same job).
    const jobId = `insight-${tenantId}-${userId}`;

    const _otelCarrierInsight: Record<string, string> = {};
    propagation.inject(otelContext.active(), _otelCarrierInsight);
    await queue.add(
      'generate-insights',
      {
        tenantId,
        userId,
        dealsAtRisk: deals,
        hotLeads: leads.map((l) => ({
          ...l,
          company: l.company ?? undefined,
        })),
        overdueTasksCount: data.overdueTasksCount,
        staleContacts: contacts,
        correlationId: `insight-${tenantId}-${Date.now()}`,
        _otelCarrier: _otelCarrierInsight,
      },
      { jobId }
    );

    await queue.close();

    // Enqueued successfully — no log needed in normal flow
  } catch {
    // Silent catch — insight generation is best-effort
    // BullMQ queue errors are expected when Redis is unavailable
  }
}

/**
 * Run the 4 heuristic queries to gather CRM data for insight generation.
 * Uses progressive fallback only for admin/manager users.
 * Regular users should not silently widen to tenant-wide data.
 */
async function runHeuristicQueries(
  prisma: Context['prisma'],
  tenantId: string,
  userId: string,
  opts: { dealTake: number; leadTake: number; contactTake: number },
  allowTenantFallback: boolean,
  timezone: string = 'UTC'
) {
  const now = new Date();
  const riskCutoff = new Date(now.getTime() - DEAL_RISK_DAYS * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - STALE_CONTACT_DAYS * 24 * 60 * 60 * 1000);
  // Use start-of-day in user's timezone to match task.stats overdue definition.
  // Tasks due today are NOT overdue — only tasks due before today are.
  const overdueCutoff = startOfDayInTimezone(timezone, now);

  // Helper to run all 4 queries with optional ownerId filter
  async function fetchAll(ownerFilter: string | undefined) {
    return Promise.all([
      prisma.opportunity.findMany({
        where: {
          tenantId,
          ...(ownerFilter ? { ownerId: ownerFilter } : {}),
          stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
          updatedAt: { lt: riskCutoff },
        },
        take: opts.dealTake,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, updatedAt: true },
      }),
      prisma.lead.findMany({
        where: {
          tenantId,
          ...(ownerFilter ? { ownerId: ownerFilter } : {}),
          score: { gte: HOT_LEAD_SCORE },
          status: { notIn: ['CONVERTED', 'LOST'] },
        },
        take: opts.leadTake,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, company: true, score: true },
      }),
      prisma.task.count({
        where: {
          tenantId,
          ...(ownerFilter ? { ownerId: ownerFilter } : {}),
          dueDate: { lt: overdueCutoff },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      prisma.contact.findMany({
        where: {
          tenantId,
          ...(ownerFilter ? { ownerId: ownerFilter } : {}),
          OR: [{ lastContactedAt: { lt: staleCutoff } }, { lastContactedAt: null }],
          opportunities: {
            some: { stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
          },
        },
        take: opts.contactTake,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, lastContactedAt: true },
      }),
    ]);
  }

  // Try user-scoped first
  const [dealsAtRisk, hotLeads, overdueTasksCount, staleContacts] = await fetchAll(userId);

  const hasUserData =
    dealsAtRisk.length > 0 ||
    hotLeads.length > 0 ||
    overdueTasksCount > 0 ||
    staleContacts.length > 0;

  if (hasUserData) {
    return { dealsAtRisk, hotLeads, overdueTasksCount, staleContacts, now };
  }

  if (!allowTenantFallback) {
    return { dealsAtRisk, hotLeads, overdueTasksCount, staleContacts, now };
  }

  // Fallback: tenant-scoped (no ownerId filter)
  const [dealsAll, leadsAll, tasksAll, contactsAll] = await fetchAll(undefined);
  return {
    dealsAtRisk: dealsAll,
    hotLeads: leadsAll,
    overdueTasksCount: tasksAll,
    staleContacts: contactsAll,
    now,
  };
}

/**
 * Build heuristic insights from raw query data (extracted from inline code)
 */
function buildHeuristicInsights(
  dealsAtRisk: Array<{ id: string; name: string; updatedAt: Date }>,
  hotLeads: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    score: number | null;
  }>,
  overdueTasksCount: number,
  staleContacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    lastContactedAt: Date | null;
  }>,
  now: Date
): InsightResponseItem[] {
  const insights: InsightResponseItem[] = [];

  dealsAtRisk.forEach((deal, idx) => {
    const daysSinceUpdate = Math.floor(
      (now.getTime() - deal.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
    );
    const isCritical = daysSinceUpdate > 21;
    const title = isCritical
      ? `${deal.name} — ${daysSinceUpdate} Days Without Activity`
      : `Deal Needs Attention: ${deal.name}`;
    const description = isCritical
      ? `${deal.name} has had no activity for ${daysSinceUpdate} days. This deal is at serious risk of going cold.`
      : `${deal.name} hasn't been updated in ${daysSinceUpdate} days. A timely touchpoint can keep momentum going.`;
    const actions = isCritical
      ? [
          'Call the decision-maker directly',
          'Send a value-recap email',
          'Escalate internally for support',
        ]
      : ['Schedule a check-in call', 'Send a progress update', 'Review the deal timeline'];
    insights.push({
      id: `deal-risk-${deal.id}`,
      type: 'warning',
      source: 'heuristic',
      title,
      description,
      suggestedAction: actions[idx % actions.length],
      entityType: 'opportunity',
      entityId: deal.id,
      actionUrl: `/deals/${deal.id}`,
      requiresApproval: false,
      priority: isCritical ? 'high' : 'medium',
      createdAt: now,
    });
  });

  hotLeads.forEach((lead, idx) => {
    const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.company || 'Lead';
    const score = lead.score ?? 0;
    // Vary title, description, and action based on score tier and position
    const isTopTier = score >= 90;
    const title = isTopTier ? `High-Priority Lead: ${name}` : `Hot Lead: ${name}`;
    const actions = isTopTier
      ? [
          'Schedule a discovery call',
          'Prepare a tailored proposal',
          'Send a personalized intro email',
        ]
      : [
          'Send personalized follow-up',
          'Schedule an introductory call',
          'Research their company needs',
        ];
    const action = actions[idx % actions.length];
    const descriptions = isTopTier
      ? [
          `${name} scored ${score} — one of your strongest prospects. Prioritize direct outreach.`,
          `${name} shows exceptional buying signals (score: ${score}). A discovery call could accelerate conversion.`,
        ]
      : [
          `${name} has a score of ${score}, indicating genuine interest. Engage before momentum fades.`,
          `${name} scored ${score} and may be evaluating options. Timely follow-up can make the difference.`,
        ];
    insights.push({
      id: `hot-lead-${lead.id}`,
      type: 'opportunity',
      source: 'heuristic',
      title,
      description: descriptions[idx % descriptions.length],
      suggestedAction: action,
      entityType: 'lead',
      entityId: lead.id,
      actionUrl: `/leads/${lead.id}?tab=ai-insights`,
      requiresApproval: false,
      priority: 'high',
      createdAt: now,
    });
  });

  if (overdueTasksCount > 0) {
    insights.push({
      id: `overdue-tasks`,
      type: 'reminder',
      source: 'heuristic',
      title: `${overdueTasksCount} Overdue Task${overdueTasksCount > 1 ? 's' : ''}`,
      description: `You have tasks past their due date. Review and update your task list.`,
      suggestedAction: 'Review overdue tasks',
      entityType: null,
      entityId: null,
      actionUrl: '/tasks?filter=overdue',
      requiresApproval: false,
      priority: 'medium',
      createdAt: now,
    });
  }

  staleContacts.forEach((contact, idx) => {
    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unnamed Contact';
    const days = contact.lastContactedAt
      ? Math.floor((now.getTime() - contact.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const isVeryStale = days !== null && days > 30;
    let title: string;
    let description: string;
    let actions: string[];
    if (days === null) {
      title = `New Contact Needs Outreach: ${name}`;
      description = `${name} has never been contacted but has open opportunities. Initial outreach could unlock pipeline value.`;
      actions = [
        'Send an introductory email',
        'Schedule a first meeting',
        'Add to outreach sequence',
      ];
    } else if (isVeryStale) {
      title = `Re-engage ${name} — ${days} Days Silent`;
      description = `${name} has gone ${days} days without interaction and has active opportunities at stake. Re-engagement is overdue.`;
      actions = [
        'Send a re-engagement email',
        'Call to re-establish contact',
        'Review their opportunity status',
      ];
    } else {
      title = `Follow Up with ${name}`;
      description = `It's been ${days} days since your last interaction with ${name}. Their open opportunities need attention.`;
      actions = [
        'Schedule a check-in call',
        'Send a quick update email',
        'Review their open opportunities',
      ];
    }
    insights.push({
      id: `stale-contact-${contact.id}`,
      type: 'warning',
      source: 'heuristic',
      title,
      description,
      suggestedAction: actions[idx % actions.length],
      entityType: 'contact',
      entityId: contact.id,
      actionUrl: `/contacts/${contact.id}?tab=ai-insights`,
      requiresApproval: false,
      priority: isVeryStale ? 'high' : 'medium',
      createdAt: now,
    });
  });

  return insights;
}

/** Shape returned by runHeuristicQueries (minus the `now` field). */
type HeuristicData = {
  dealsAtRisk: Array<{ id: string; name: string; updatedAt: Date }>;
  hotLeads: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    score: number | null;
  }>;
  overdueTasksCount: number;
  staleContacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    lastContactedAt: Date | null;
  }>;
};

type NotificationCandidate = {
  sourceType: string;
  sourceId: string | null;
  subject: string;
  body: string;
  priority: 'HIGH' | 'NORMAL';
  actionUrl: string;
};

/**
 * Build the proactive-notification candidate payloads from the heuristic
 * collections. Extracted from createProactiveNotifications to keep that
 * function's cognitive complexity within the sonar budget (NP-015/016/041).
 */
function buildProactiveNotificationCandidates(
  dealsAtRisk: HeuristicData['dealsAtRisk'],
  hotLeads: HeuristicData['hotLeads'],
  overdueTasksCount: HeuristicData['overdueTasksCount'],
  staleContacts: HeuristicData['staleContacts'],
  now: Date
): NotificationCandidate[] {
  const candidates: NotificationCandidate[] = [];

  for (const deal of dealsAtRisk) {
    const daysSinceUpdate = Math.floor((now.getTime() - deal.updatedAt.getTime()) / 86400000);
    candidates.push({
      sourceType: 'deal_at_risk',
      sourceId: deal.id,
      subject: `Deal at Risk: ${deal.name}`,
      body: `Last interaction was ${daysSinceUpdate} days ago. Consider scheduling a follow-up.`,
      priority: 'HIGH',
      actionUrl: `/deals/${deal.id}`,
    });
  }

  for (const lead of hotLeads) {
    const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.company || 'Lead';
    candidates.push({
      sourceType: 'lead_scored',
      sourceId: lead.id,
      subject: `Hot Lead: ${name}`,
      body: `Score of ${lead.score ?? 0} indicates strong buying signals.`,
      priority: 'NORMAL',
      actionUrl: `/leads/${lead.id}`,
    });
  }

  if (overdueTasksCount > 0) {
    candidates.push({
      sourceType: 'task_overdue',
      sourceId: null,
      subject: `${overdueTasksCount} Overdue Task${overdueTasksCount > 1 ? 's' : ''}`,
      body: `You have tasks past their due date. Review and update your task list.`,
      priority: 'HIGH',
      actionUrl: '/tasks?filter=overdue',
    });
  }

  for (const contact of staleContacts) {
    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Contact';
    const days = contact.lastContactedAt
      ? Math.floor((now.getTime() - contact.lastContactedAt.getTime()) / 86400000)
      : null;
    candidates.push({
      sourceType: 'contact_stale',
      sourceId: contact.id,
      subject: `Stale Contact: ${name}`,
      body: days
        ? `No interaction in ${days} days. This contact has open opportunities.`
        : `Never contacted. This contact has open opportunities.`,
      priority: 'NORMAL',
      actionUrl: `/contacts/${contact.id}`,
    });
  }

  return candidates;
}

/**
 * Create proactive notifications from threshold alert data.
 * Deduplicates by sourceType + sourceId — only creates a new alert if no
 * active (non-archived) notification exists for the same entity.
 * Fire-and-forget — callers should .catch(() => {}).
 *
 * Batched implementation (NP-015/016/041):
 * 1. Build all candidate notification payloads across the three collections.
 * 2. Issue ONE findMany to find existing active notifications for this user/tenant
 *    that match any of the candidate (sourceType, sourceId) pairs.
 * 3. Filter out already-existing ones (Set-based dedup).
 * 4. Insert remaining new notifications with ONE createMany call.
 */
async function createProactiveNotifications(
  prisma: Context['prisma'],
  tenantId: string,
  userId: string,
  dealsAtRisk: HeuristicData['dealsAtRisk'],
  hotLeads: HeuristicData['hotLeads'],
  overdueTasksCount: HeuristicData['overdueTasksCount'],
  staleContacts: HeuristicData['staleContacts'],
  now: Date,
  timezone: string = 'Europe/London'
): Promise<void> {
  // -------------------------------------------------------------------------
  // Step 1: Build all candidate notification payloads
  // -------------------------------------------------------------------------
  const candidates = buildProactiveNotificationCandidates(
    dealsAtRisk,
    hotLeads,
    overdueTasksCount,
    staleContacts,
    now
  );

  if (candidates.length === 0) return;

  // -------------------------------------------------------------------------
  // Step 2: ONE findMany to check which (sourceType, sourceId) pairs already
  // have an active notification for this user.
  //
  // Split into two groups: ones with a real sourceId (most), and the single
  // null-sourceId case (task_overdue). Use an OR of exact-match conditions so
  // the query is still a single round-trip regardless of collection size.
  // -------------------------------------------------------------------------
  const withSourceId = candidates.filter(
    (c): c is NotificationCandidate & { sourceId: string } => c.sourceId !== null
  );
  const withNullSourceId = candidates.filter((c) => c.sourceId === null);

  // Deduplicate sourceIds before the IN query (same id could theoretically appear
  // across categories, though in practice they are disjoint by sourceType).
  const dedupedSourceIds = [...new Set(withSourceId.map((c) => c.sourceId))];

  // Build OR conditions for the batch existence check
  const orConditions: Array<{ sourceType: string; sourceId?: string | null }> = [];

  // For entities with sourceIds: group by sourceType so the OR is compact.
  const bySourceType = new Map<string, string[]>();
  for (const c of withSourceId) {
    if (!bySourceType.has(c.sourceType)) bySourceType.set(c.sourceType, []);
    bySourceType.get(c.sourceType)!.push(c.sourceId);
  }
  // We build one OR entry per (sourceType, sourceId) pair — Prisma can handle
  // this efficiently because the dedup query is bounded by take limits (≤150 rows).
  for (const c of withSourceId) {
    orConditions.push({ sourceType: c.sourceType, sourceId: c.sourceId });
  }
  for (const c of withNullSourceId) {
    orConditions.push({ sourceType: c.sourceType, sourceId: null });
  }

  const existingRows = await prisma.notification.findMany({
    where: {
      tenantId,
      recipientId: userId,
      status: { in: ['PENDING', 'SENT', 'DELIVERED', 'READ'] },
      OR: orConditions as any,
    },
    select: { sourceType: true, sourceId: true },
  });

  // Build a Set of "sourceType|sourceId" keys for O(1) lookup.
  // null sourceId is normalised to the empty string so it forms a valid key.
  const existingKeys = new Set<string>(
    existingRows.map((r) => `${r.sourceType}|${r.sourceId ?? ''}`)
  );

  // -------------------------------------------------------------------------
  // Step 3: Filter to only the notifications that do not yet exist.
  // -------------------------------------------------------------------------
  const newCandidates = candidates.filter(
    (c) => !existingKeys.has(`${c.sourceType}|${c.sourceId ?? ''}`)
  );

  if (newCandidates.length === 0) return;

  // -------------------------------------------------------------------------
  // Step 4: ONE createMany for all new notifications.
  // -------------------------------------------------------------------------
  await prisma.notification.createMany({
    data: newCandidates.map((c) => ({
      tenantId,
      recipientId: userId,
      channel: 'IN_APP',
      subject: c.subject,
      body: c.body,
      priority: c.priority,
      status: 'PENDING',
      category: 'ALERTS',
      sourceType: c.sourceType,
      ...(c.sourceId !== null ? { sourceId: c.sourceId } : {}),
      metadata: {
        notificationType: c.sourceType,
        actionUrl: c.actionUrl,
      },
    })),
    skipDuplicates: true,
  });
}

/**
 * Builds the pipeline overview summary insight if active deals exist.
 */
async function buildPipelineSummaryInsight(
  prisma: Context['prisma'],
  tenantId: string,
  userId: string,
  now: Date
): Promise<InsightResponseItem | null> {
  const [activeDealCount, activePipelineValue] = await Promise.all([
    prisma.opportunity.count({
      where: { tenantId, ownerId: userId, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
    }),
    prisma.opportunity.aggregate({
      where: { tenantId, ownerId: userId, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
      _sum: { value: true },
    }),
  ]);

  if (activeDealCount === 0) return null;

  const value = Number(activePipelineValue._sum.value ?? 0);
  const dealPlural = activeDealCount > 1 ? 's' : '';
  return {
    id: 'pipeline-summary',
    type: 'opportunity',
    source: 'heuristic',
    title: 'Pipeline Overview',
    description: `You have ${activeDealCount} active deal${dealPlural} worth $${value.toLocaleString('en-GB')}. Review your pipeline for next steps.`,
    suggestedAction: 'Review pipeline',
    entityType: null,
    entityId: null,
    actionUrl: '/deals',
    requiresApproval: false,
    priority: 'low',
    createdAt: now,
  };
}

/**
 * Builds the weekly deal momentum trend insight if any deals were closed in the past two weeks.
 */
/**
 * Computes the percentage trend and direction labels for weekly deal momentum.
 */
function computeDealTrend(
  closedThisWeek: number,
  closedLastWeek: number
): { trend: number; direction: 'up' | 'down' | 'steady'; momentumLabel: string } {
  let trend: number;
  if (closedLastWeek > 0) {
    trend = Math.round(((closedThisWeek - closedLastWeek) / closedLastWeek) * 100);
  } else if (closedThisWeek > 0) {
    trend = 100;
  } else {
    trend = 0;
  }
  let direction: 'up' | 'down' | 'steady';
  if (trend > 0) {
    direction = 'up';
  } else if (trend < 0) {
    direction = 'down';
  } else {
    direction = 'steady';
  }
  let momentumLabel: string;
  if (direction === 'up') {
    momentumLabel = 'Rising';
  } else if (direction === 'down') {
    momentumLabel = 'Declining';
  } else {
    momentumLabel = 'Steady';
  }
  return { trend, direction, momentumLabel };
}

async function buildDealTrendInsight(
  prisma: Context['prisma'],
  tenantId: string,
  userId: string,
  weekAgo: Date,
  twoWeeksAgo: Date,
  now: Date
): Promise<InsightResponseItem | null> {
  const [closedThisWeek, closedLastWeek] = await Promise.all([
    prisma.opportunity.count({
      where: { tenantId, ownerId: userId, stage: 'CLOSED_WON', closedAt: { gte: weekAgo } },
    }),
    prisma.opportunity.count({
      where: {
        tenantId,
        ownerId: userId,
        stage: 'CLOSED_WON',
        closedAt: { gte: twoWeeksAgo, lt: weekAgo },
      },
    }),
  ]);

  if (closedThisWeek === 0 && closedLastWeek === 0) return null;

  const { trend, direction, momentumLabel } = computeDealTrend(closedThisWeek, closedLastWeek);
  const trendSign = trend > 0 ? '+' : '';
  const vsLastWeekSuffix = closedLastWeek > 0 ? ` (${trendSign}${trend}% vs last week)` : '';
  const dealPlural = closedThisWeek !== 1 ? 's' : '';
  return {
    id: 'deal-trend',
    type: direction === 'down' ? 'warning' : 'achievement',
    source: 'heuristic',
    title: `Weekly Momentum: ${momentumLabel}`,
    description: `${closedThisWeek} deal${dealPlural} closed this week${vsLastWeekSuffix}.`,
    suggestedAction: direction === 'down' ? 'Review pipeline activity' : null,
    entityType: null,
    entityId: null,
    actionUrl: '/deals',
    requiresApproval: false,
    priority: 'low',
    createdAt: now,
  };
}

/**
 * Build forward-looking smart summaries for the insights panel.
 * These replace threshold alerts in /insights — they are informational,
 * not urgent, and provide pipeline/trend/queue intelligence.
 */
async function buildSmartSummaries(
  prisma: Context['prisma'],
  tenantId: string,
  userId: string,
  heuristicData: HeuristicData,
  now: Date
): Promise<InsightResponseItem[]> {
  const summaries: InsightResponseItem[] = [];
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

  // 1. Pipeline summary — forward-looking: "what's in your pipeline"
  const pipelineInsight = await buildPipelineSummaryInsight(prisma, tenantId, userId, now);
  if (pipelineInsight) summaries.push(pipelineInsight);

  // 2. Weekly deal trend — forward-looking: "momentum indicator"
  const trendInsight = await buildDealTrendInsight(
    prisma,
    tenantId,
    userId,
    weekAgo,
    twoWeeksAgo,
    now
  );
  if (trendInsight) summaries.push(trendInsight);

  // 3. Lead qualification queue — forward-looking: "what to work on next"
  const qualifiableLeads = await prisma.lead.count({
    where: {
      tenantId,
      ownerId: userId,
      status: { in: ['NEW', 'CONTACTED'] },
      score: { gte: 50 },
    },
  });

  if (qualifiableLeads > 0) {
    const leadPlural = qualifiableLeads > 1 ? 's' : '';
    summaries.push({
      id: 'lead-queue',
      type: 'opportunity',
      source: 'heuristic',
      title: `${qualifiableLeads} Lead${leadPlural} Ready for Review`,
      description: `You have leads with scores above 50 in early stages. Qualify them to move your pipeline forward.`,
      suggestedAction: 'Review leads',
      entityType: null,
      entityId: null,
      actionUrl: '/leads?sort=score&order=desc',
      requiresApproval: false,
      priority: 'low',
      createdAt: now,
    });
  }

  // 4. When aggregate summaries are empty, include entity-level heuristic insights
  //    (deals at risk, hot leads, overdue tasks, stale contacts) so the page is not blank.
  //    This covers the case where admins/managers have no direct records but still need
  //    team-wide visibility from the heuristic pipeline.
  if (summaries.length === 0) {
    const heuristicInsights = buildHeuristicInsights(
      heuristicData.dealsAtRisk,
      heuristicData.hotLeads,
      heuristicData.overdueTasksCount,
      heuristicData.staleContacts,
      now
    );
    summaries.push(...heuristicInsights);
  }

  // 5. Achievement fallback — show when nothing needs attention at all
  if (summaries.length === 0) {
    summaries.push({
      id: 'all-good',
      type: 'achievement',
      source: 'heuristic',
      title: "You're on track!",
      description: 'No urgent items need your attention. Keep up the great work!',
      suggestedAction: null,
      entityType: null,
      entityId: null,
      actionUrl: null,
      requiresApproval: false,
      priority: 'low',
      createdAt: now,
    });
  }

  return summaries;
}

function normalizeConfidence(confidence: unknown, fallback: number): number {
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || !Number.isFinite(confidence)) {
    return fallback;
  }
  if (confidence > 1) {
    return Math.max(0, Math.min(1, confidence / 100));
  }
  return Math.max(0, Math.min(1, confidence));
}

function formatDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string
): string {
  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return name || fallback;
}

async function resolveStaleContactHeuristicInsight(
  prisma: Context['prisma'],
  tenantId: string,
  insightId: string
): Promise<InsightResponseItem | null> {
  if (!insightId.startsWith('stale-contact-')) {
    return null;
  }

  const contactId = insightId.slice('stale-contact-'.length);
  if (!contactId) {
    return null;
  }

  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      tenantId,
      opportunities: {
        some: { stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      lastContactedAt: true,
    },
  });

  if (!contact) {
    return null;
  }

  const now = new Date();
  const days = contact.lastContactedAt
    ? Math.floor((now.getTime() - contact.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const name = formatDisplayName(contact.firstName, contact.lastName, 'Contact');

  return {
    id: insightId,
    type: 'warning',
    source: 'heuristic',
    title: `Stale Contact: ${name}`,
    description: days
      ? `No interaction in ${days} days. This contact has open opportunities.`
      : `Never contacted. This contact has open opportunities.`,
    suggestedAction: 'Schedule a follow-up',
    entityType: 'contact',
    entityId: contact.id,
    actionUrl: `/contacts/${contact.id}?tab=ai-insights`,
    requiresApproval: false,
    priority: 'medium',
    createdAt: now,
  };
}

async function resolveInsightById(
  prisma: Context['prisma'],
  tenantId: string,
  userId: string,
  insightId: string
): Promise<{ insight: InsightResponseItem; confidence: number } | null> {
  const now = new Date();

  const aiInsight = await prisma.aIInsight.findFirst({
    where: {
      id: insightId,
      tenantId,
      status: { notIn: ['DISMISSED', 'EXPIRED'] },
      expiresAt: { gt: now },
      metadata: { path: ['userId'], equals: userId },
    },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      suggestedActions: true,
      entityType: true,
      entityId: true,
      priority: true,
      confidence: true,
      metadata: true,
      createdAt: true,
    },
  });

  if (aiInsight) {
    return {
      insight: mapAIInsightToResponse(aiInsight),
      confidence: normalizeConfidence(aiInsight.confidence, 0.85),
    };
  }

  const staleContactHeuristic = await resolveStaleContactHeuristicInsight(
    prisma,
    tenantId,
    insightId
  );
  if (staleContactHeuristic) {
    return {
      insight: staleContactHeuristic,
      confidence: 0.7,
    };
  }

  return null;
}

// =============================================================================
// Router Implementation
// =============================================================================

export const homeRouter = createTRPCRouter({
  /**
   * Get welcome summary for authenticated home page
   * Uses progressive time fallbacks for meaningful data display
   */
  getWelcomeSummary: tenantProcedure.query(async ({ ctx }): Promise<WelcomeSummary> => {
    // IFC-196: Delegate to HomeCacheService when container wired it up.
    // Falls through to direct compute for legacy tests that don't install it.
    const compute = async (): Promise<WelcomeSummary> => {
      const startTime = performance.now();
      const tenantId = ctx.tenant.tenantId;
      const userId = ctx.tenant.userId;
      const now = new Date();
      const userTz = safeTimezone(ctx.user?.timezone);
      const todayStart = startOfDayInTimezone(userTz, now);
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Parallel fetch user + all stats (user query was previously sequential)
      const [
        user,
        highPriorityTasks,
        overdueTasks,
        newLeadsSinceYesterday,
        newLeadsThisWeek,
        newLeadsThisMonth,
        totalLeads,
        appointmentsToday,
        dealsClosedThisWeek,
        dealsClosedLastWeek,
        dealsClosedThisMonth,
        dealsClosedLastMonth,
      ] = await Promise.all([
        // User name (timezone comes from ctx.user session)
        ctx.prismaWithTenant.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        }),
        // High priority tasks not completed (includes URGENT)
        ctx.prismaWithTenant.task.count({
          where: {
            tenantId,
            ownerId: userId,
            priority: { in: ['HIGH', 'URGENT'] },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        }),
        // Overdue tasks
        ctx.prismaWithTenant.task.count({
          where: {
            tenantId,
            ownerId: userId,
            dueDate: { lt: now },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        }),
        // New leads since yesterday
        ctx.prismaWithTenant.lead.count({
          where: {
            tenantId,
            ownerId: userId,
            createdAt: { gte: yesterdayStart },
          },
        }),
        // New leads this week
        ctx.prismaWithTenant.lead.count({
          where: {
            tenantId,
            ownerId: userId,
            createdAt: { gte: weekAgo },
          },
        }),
        // New leads this month
        ctx.prismaWithTenant.lead.count({
          where: {
            tenantId,
            ownerId: userId,
            createdAt: { gte: monthAgo },
          },
        }),
        // Total leads (all time)
        ctx.prismaWithTenant.lead.count({
          where: {
            tenantId,
            ownerId: userId,
          },
        }),
        // Appointments today
        ctx.prismaWithTenant.appointment.count({
          where: {
            OR: [{ organizerId: userId }, { attendees: { some: { userId } } }],
            startTime: { gte: todayStart },
            endTime: { lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
        }),
        // Deals closed this week
        ctx.prismaWithTenant.opportunity.count({
          where: {
            tenantId,
            ownerId: userId,
            stage: 'CLOSED_WON',
            closedAt: { gte: weekAgo },
          },
        }),
        // Deals closed last week (for comparison)
        ctx.prismaWithTenant.opportunity.count({
          where: {
            tenantId,
            ownerId: userId,
            stage: 'CLOSED_WON',
            closedAt: { gte: twoWeeksAgo, lt: weekAgo },
          },
        }),
        // Deals closed this month
        ctx.prismaWithTenant.opportunity.count({
          where: {
            tenantId,
            ownerId: userId,
            stage: 'CLOSED_WON',
            closedAt: { gte: monthAgo },
          },
        }),
        // Deals closed last month (for comparison)
        ctx.prismaWithTenant.opportunity.count({
          where: {
            tenantId,
            ownerId: userId,
            stage: 'CLOSED_WON',
            closedAt: { gte: twoMonthsAgo, lt: monthAgo },
          },
        }),
      ]);

      // Progressive fallback for leads: yesterday -> this week -> this month -> all time
      let newLeadsCount = 0;
      let newLeadsPeriod: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' =
        'yesterday';

      if (newLeadsSinceYesterday > 0) {
        newLeadsCount = newLeadsSinceYesterday;
      } else if (newLeadsThisWeek > 0) {
        newLeadsCount = newLeadsThisWeek;
        newLeadsPeriod = 'this_week';
      } else if (newLeadsThisMonth > 0) {
        newLeadsCount = newLeadsThisMonth;
        newLeadsPeriod = 'this_month';
      } else if (totalLeads > 0) {
        newLeadsCount = totalLeads;
        newLeadsPeriod = 'all_time';
      }

      // Progressive fallback for deal trends: weekly -> monthly
      let dealClosingRateTrend = 0;
      let dealsTrendPeriod: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' =
        'this_week';

      // Try weekly comparison first
      if (dealsClosedLastWeek > 0) {
        dealClosingRateTrend = Math.round(
          ((dealsClosedThisWeek - dealsClosedLastWeek) / dealsClosedLastWeek) * 100
        );
      } else if (dealsClosedThisWeek > 0) {
        dealClosingRateTrend = 100; // Infinite improvement from 0
      } else if (dealsClosedLastMonth > 0) {
        // Fall back to monthly comparison
        dealClosingRateTrend = Math.round(
          ((dealsClosedThisMonth - dealsClosedLastMonth) / dealsClosedLastMonth) * 100
        );
        dealsTrendPeriod = 'this_month';
      } else if (dealsClosedThisMonth > 0) {
        dealClosingRateTrend = 100;
        dealsTrendPeriod = 'this_month';
      }

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[home.getWelcomeSummary] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        userName: user?.name || user?.email?.split('@')[0] || 'User',
        greeting: getGreeting(safeTimezone(ctx.user?.timezone)),
        todayDate: now,
        stats: {
          highPriorityTasksCount: highPriorityTasks,
          newLeadsCount,
          newLeadsPeriod,
          dealClosingRateTrend,
          dealsTrendPeriod,
          appointmentsToday,
          overdueTasksCount: overdueTasks,
        },
      };
    };
    const homeCache = (
      ctx.services as
        | {
            homeCache?: {
              getWelcomeSummary: <T>(t: string, u: string, c: () => Promise<T>) => Promise<T>;
            };
          }
        | undefined
    )?.homeCache;
    if (homeCache) {
      return homeCache.getWelcomeSummary(ctx.tenant.tenantId, ctx.tenant.userId, compute);
    }
    return compute();
  }),

  /**
   * Get AI insights for home page
   */
  getAIInsights: tenantProcedure.query(async ({ ctx }): Promise<AIInsightsResponse> => {
    const startTime = performance.now();
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;
    const now = new Date();

    // Step 1: Check AIInsight table for cached AI insights (expiresAt encodes priority-based TTL)
    const cachedInsights = await ctx.prismaWithTenant.aIInsight.findMany({
      where: {
        tenantId,
        status: { notIn: ['DISMISSED', 'EXPIRED'] },
        expiresAt: { gt: now },
        metadata: { path: ['userId'], equals: userId },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        suggestedActions: true,
        entityType: true,
        entityId: true,
        priority: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (cachedInsights.length > 0) {
      // Validate that referenced entities still exist — prevents dead links
      // when a lead/contact/deal has been deleted or converted since the insight was cached
      const userTz = safeTimezone(ctx.user?.timezone);
      const validInsights = await filterStaleInsights(
        ctx.prismaWithTenant,
        tenantId,
        cachedInsights,
        userTz
      );

      if (validInsights.length > 0) {
        const duration = performance.now() - startTime;
        if (duration > 200) {
          console.warn(`[home.getAIInsights] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
        }
        const mapped = deduplicateInsights(validInsights.map(mapAIInsightToResponse));
        return {
          insights: mapped.slice(0, 5),
          lastRefreshed: validInsights[0].createdAt,
        };
      }
      // All cached insights were stale — fall through to heuristic generation
    }

    // Step 2: Cache miss — run heuristic queries with user→tenant fallback
    const userTz = safeTimezone(ctx.user?.timezone);
    const heuristic = await runHeuristicQueries(
      ctx.prismaWithTenant,
      tenantId,
      userId,
      {
        dealTake: 3,
        leadTake: 2,
        contactTake: 2,
      },
      ctx.tenant.canAccessAllTenantData,
      userTz
    );
    const { dealsAtRisk, hotLeads, overdueTasksCount, staleContacts } = heuristic;

    // Step 2a: Route threshold alerts to notifications (fire-and-forget)
    createProactiveNotifications(
      ctx.prismaWithTenant,
      tenantId,
      userId,
      dealsAtRisk,
      hotLeads,
      overdueTasksCount,
      staleContacts,
      heuristic.now,
      safeTimezone(ctx.user?.timezone)
    ).catch(() => {});

    // Step 2b: Build forward-looking smart summaries as insights
    const insights = await buildSmartSummaries(
      ctx.prismaWithTenant,
      tenantId,
      userId,
      { dealsAtRisk, hotLeads, overdueTasksCount, staleContacts },
      heuristic.now
    );

    // Step 3: Fire-and-forget — enqueue AI insight generation for next visit
    enqueueInsightGeneration(tenantId, userId, {
      dealsAtRisk: dealsAtRisk.map((d) => ({
        id: d.id,
        name: d.name,
        daysSinceUpdate: Math.floor(
          (heuristic.now.getTime() - d.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
        ),
      })),
      hotLeads: hotLeads.map((l) => ({
        id: l.id,
        name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.company || 'Lead',
        score: l.score ?? 0,
        company: l.company,
      })),
      overdueTasksCount,
      staleContacts: staleContacts.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        daysSinceContact: c.lastContactedAt
          ? Math.floor(
              (heuristic.now.getTime() - c.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000)
            )
          : null,
      })),
    }).catch(() => {});

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[home.getAIInsights] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      insights: insights.slice(0, 5),
      lastRefreshed: heuristic.now,
    };
  }),

  /**
   * Get daily goal progress
   *
   * Supports 5 goal types: revenue, calls, meetings, tasks, custom.
   * Reads user preferences from User.preferences.dailyGoal; defaults to revenue/$5000.
   * Task: IFC-195 - Customizable Daily Goals
   */
  getDailyGoal: tenantProcedure.query(async ({ ctx }): Promise<DailyGoalResponse> => {
    const startTime = performance.now();
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;
    const now = new Date();
    const userTz = safeTimezone(ctx.user?.timezone);
    const todayStart = startOfDayInTimezone(userTz, now);
    const todayEnd = endOfDayInTimezone(userTz, now);

    // Read user preferences for goal type
    const user = await ctx.prismaWithTenant.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const goalPrefSchema = z.object({
      type: z.enum(['revenue', 'calls', 'meetings', 'tasks', 'custom']),
      targetValue: z.number().int().positive(),
      label: z.string().optional(),
      customUnit: z.string().optional(),
    });
    const parsed = goalPrefSchema.safeParse(prefs.dailyGoal);

    const goalType: GoalType = parsed.success ? parsed.data.type : 'revenue';
    const defaults = GOAL_DEFAULTS[goalType];
    const targetValue = parsed.success ? parsed.data.targetValue : defaults.targetValue;
    const label = (parsed.success && parsed.data.label) || defaults.label;
    const unit =
      (parsed.success && goalType === 'custom' && parsed.data.customUnit) || defaults.unit;

    // Compute currentValue based on goal type
    let currentValue = 0;

    switch (goalType) {
      case 'revenue': {
        const todayRevenue = await ctx.prismaWithTenant.opportunity.aggregate({
          where: {
            tenantId,
            ownerId: userId,
            stage: 'CLOSED_WON',
            closedAt: { gte: todayStart, lt: todayEnd },
          },
          _sum: { value: true },
        });
        currentValue = Number(todayRevenue._sum.value) || 0;
        break;
      }
      case 'calls': {
        currentValue = await ctx.prismaWithTenant.callRecord.count({
          where: {
            tenantId,
            userId,
            startedAt: { gte: todayStart, lt: todayEnd },
            status: 'COMPLETED',
          },
        });
        break;
      }
      case 'meetings': {
        currentValue = await ctx.prismaWithTenant.appointment.count({
          where: {
            tenantId,
            OR: [{ organizerId: userId }, { attendees: { some: { userId } } }],
            completedAt: { gte: todayStart, lt: todayEnd },
            status: 'COMPLETED',
          },
        });
        break;
      }
      case 'tasks': {
        currentValue = await ctx.prismaWithTenant.task.count({
          where: {
            tenantId,
            ownerId: userId,
            completedAt: { gte: todayStart, lt: todayEnd },
            status: 'COMPLETED',
          },
        });
        break;
      }
      case 'custom':
        break;
    }

    const progress = Math.min(100, Math.round((currentValue / targetValue) * 100));
    const remainingToTarget = Math.max(0, targetValue - currentValue);

    // Format remaining based on goal type
    const remainingFormatted =
      goalType === 'revenue'
        ? `$${remainingToTarget.toLocaleString('en-GB')}`
        : `${remainingToTarget} ${unit}`;

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[home.getDailyGoal] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      goal: {
        id: `daily-${goalType}`,
        type: goalType,
        label,
        targetValue,
        currentValue,
        unit,
        progress,
        remainingToTarget,
        remainingFormatted,
      },
      lastUpdated: now,
    };
  }),

  /**
   * Update daily goal preferences
   *
   * Saves goal type and target to User.preferences.dailyGoal using
   * read-merge-write pattern (same as pinItem).
   * Task: IFC-195 - Customizable Daily Goals
   */
  updateDailyGoal: tenantProcedure
    .input(updateDailyGoalInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.tenant.userId;
      const { type, targetValue, label, customUnit } = input;

      // Get current preferences
      const user = await ctx.prismaWithTenant.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      const prefs = (user?.preferences as any) || {};

      // Merge dailyGoal into preferences
      await ctx.prismaWithTenant.user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...prefs,
            dailyGoal: { type, targetValue, label, customUnit },
          },
        },
      });

      return { success: true, message: 'Daily goal updated successfully' };
    }),

  /**
   * Get pinned items
   */
  getPinnedItems: tenantProcedure.query(async ({ ctx }): Promise<PinnedItemsResponse> => {
    const userId = ctx.tenant.userId;
    const tenantId = ctx.tenant.tenantId;

    // Get pinned items from user preferences
    const user = await ctx.prismaWithTenant.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const pinnedItems = prefs.pinnedItems || [];

    // PG-159: Check entity existence in parallel for stale pin detection
    const existenceResults = await Promise.all(
      pinnedItems.map((item: any) =>
        checkEntityExists(ctx.prismaWithTenant, item.entityType, item.entityId, tenantId)
      )
    );

    return {
      items: pinnedItems.map((item: any, index: number) => ({
        id: item.id || `pin-${index}`,
        entityType: item.entityType,
        entityId: item.entityId,
        title: item.title,
        subtitle: item.subtitle || null,
        icon: item.icon || null,
        url: item.url,
        pinnedAt: item.pinnedAt ? new Date(item.pinnedAt) : new Date(),
        position: index,
        isAvailable: existenceResults[index],
      })),
      maxItems: 10,
    };
  }),

  /**
   * Pin an item
   */
  pinItem: tenantProcedure.input(pinItemInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.tenant.userId;
    const { entityType, entityId, title, subtitle, icon, url } = input;

    // Get current preferences
    const user = await ctx.prismaWithTenant.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const pinnedItems = prefs.pinnedItems || [];

    // Check if already pinned
    if (pinnedItems.some((p: any) => p.entityType === entityType && p.entityId === entityId)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Item is already pinned',
      });
    }

    // Check max items
    if (pinnedItems.length >= 10) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Maximum of 10 pinned items allowed',
      });
    }

    // Add new pinned item
    pinnedItems.push({
      id: `pin-${Date.now()}`,
      entityType,
      entityId,
      title,
      subtitle,
      icon,
      url,
      pinnedAt: new Date().toISOString(),
    });

    // Update user preferences
    await ctx.prismaWithTenant.user.update({
      where: { id: userId },
      data: {
        preferences: { ...prefs, pinnedItems },
      },
    });

    return { success: true, message: 'Item pinned successfully' };
  }),

  /**
   * Unpin an item
   */
  unpinItem: tenantProcedure.input(unpinItemInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.tenant.userId;
    const { entityType, entityId } = input;

    // Get current preferences
    const user = await ctx.prismaWithTenant.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any) || {};
    const pinnedItems = prefs.pinnedItems || [];

    // Remove item
    const newPinnedItems = pinnedItems.filter(
      (p: any) => !(p.entityType === entityType && p.entityId === entityId)
    );

    if (newPinnedItems.length === pinnedItems.length) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Pinned item not found',
      });
    }

    // Update user preferences
    await ctx.prismaWithTenant.user.update({
      where: { id: userId },
      data: {
        preferences: { ...prefs, pinnedItems: newPinnedItems },
      },
    });

    return { success: true, message: 'Item unpinned successfully' };
  }),

  /**
   * Reorder pinned items
   */
  reorderPinnedItems: tenantProcedure
    .input(reorderPinnedItemsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.tenant.userId;
      const { items: newOrder } = input;

      // Get current preferences
      const user = await ctx.prismaWithTenant.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      const prefs = (user?.preferences as any) || {};
      const pinnedItems = prefs.pinnedItems || [];

      // Reorder items
      const reorderedItems = newOrder
        .map((orderItem) => {
          const existing = pinnedItems.find(
            (p: any) => p.entityType === orderItem.entityType && p.entityId === orderItem.entityId
          );
          return existing ? { ...existing, position: orderItem.position } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.position - b.position);

      // Update user preferences
      await ctx.prismaWithTenant.user.update({
        where: { id: userId },
        data: {
          preferences: { ...prefs, pinnedItems: reorderedItems },
        },
      });

      return { success: true, message: 'Pinned items reordered successfully' };
    }),

  /**
   * Get all AI insights with cursor pagination and type filtering
   *
   * PG-160 — View All AI Insights page
   * Cache-aside: checks AIInsight table first, falls back to heuristic queries.
   */
  getAllInsights: tenantProcedure
    .input(getAllInsightsQuerySchema)
    .query(async ({ ctx, input }): Promise<GetAllInsightsResponse> => {
      const startTime = performance.now();
      const tenantId = ctx.tenant.tenantId;
      const userId = ctx.tenant.userId;
      const now = new Date();
      const { limit, cursor, types } = input;

      // Step 1: Check AIInsight table for cached AI insights (expiresAt encodes priority-based TTL)
      const typeFilter = types
        ? types.map((t) => {
            const reverseMap: Record<string, string> = {
              warning: 'anomaly',
              opportunity: 'recommendation',
              reminder: 'trend',
              achievement: 'prediction',
            };
            return reverseMap[t] || t;
          })
        : undefined;

      const cachedInsights = await ctx.prismaWithTenant.aIInsight.findMany({
        where: {
          tenantId,
          status: { notIn: ['DISMISSED', 'EXPIRED'] },
          expiresAt: { gt: now },
          metadata: { path: ['userId'], equals: userId },
          ...(typeFilter ? { type: { in: typeFilter } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          suggestedActions: true,
          entityType: true,
          entityId: true,
          priority: true,
          metadata: true,
          createdAt: true,
        },
      });

      const userTz = safeTimezone(ctx.user?.timezone);

      if (cachedInsights.length > 0) {
        // Validate entity existence — filter out insights referencing deleted entities
        const validCached = await filterStaleInsights(
          ctx.prismaWithTenant,
          tenantId,
          cachedInsights,
          userTz
        );
        const dedupedCached = deduplicateInsights(validCached);
        const total = dedupedCached.length;
        const offset = cursor
          ? Number.parseInt(Buffer.from(cursor, 'base64').toString('utf-8'), 10) || 0
          : 0;

        const page = dedupedCached.slice(offset, offset + limit).map(mapAIInsightToResponse);
        const hasMore = offset + limit < total;
        const nextCursor = hasMore ? Buffer.from(String(offset + limit)).toString('base64') : null;

        const duration = performance.now() - startTime;
        if (duration > 500) {
          console.warn(`[home.getAllInsights] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
        }

        if (dedupedCached.length > 0) {
          return {
            insights: page,
            nextCursor,
            hasMore,
            total,
            lastRefreshed: validCached[0]?.createdAt ?? now,
          };
        }
        // All cached insights were stale — fall through to heuristic generation
      }

      // Step 2: Cache miss — run heuristic queries with user→tenant fallback
      const heuristic = await runHeuristicQueries(
        ctx.prismaWithTenant,
        tenantId,
        userId,
        {
          dealTake: 50,
          leadTake: 50,
          contactTake: 50,
        },
        ctx.tenant.canAccessAllTenantData,
        userTz
      );
      const { dealsAtRisk, hotLeads, overdueTasksCount, staleContacts } = heuristic;

      // Route threshold alerts to notifications (fire-and-forget)
      createProactiveNotifications(
        ctx.prismaWithTenant,
        tenantId,
        userId,
        dealsAtRisk,
        hotLeads,
        overdueTasksCount,
        staleContacts,
        heuristic.now,
        safeTimezone(ctx.user?.timezone)
      ).catch(() => {});

      // Build forward-looking smart summaries
      const allInsights = await buildSmartSummaries(
        ctx.prismaWithTenant,
        tenantId,
        userId,
        { dealsAtRisk, hotLeads, overdueTasksCount, staleContacts },
        heuristic.now
      );

      // Apply type filter in-memory
      const filtered = types ? allInsights.filter((i) => types.includes(i.type)) : allInsights;

      const total = filtered.length;

      const offset = cursor
        ? Number.parseInt(Buffer.from(cursor, 'base64').toString('utf-8'), 10) || 0
        : 0;

      const page = filtered.slice(offset, offset + limit);
      const hasMore = offset + limit < total;
      const nextCursor = hasMore ? Buffer.from(String(offset + limit)).toString('base64') : null;

      // Fire-and-forget: enqueue AI insight generation
      enqueueInsightGeneration(tenantId, userId, {
        dealsAtRisk: dealsAtRisk.map((d) => ({
          id: d.id,
          name: d.name,
          daysSinceUpdate: Math.floor(
            (heuristic.now.getTime() - d.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
          ),
        })),
        hotLeads: hotLeads.map((l) => ({
          id: l.id,
          name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.company || 'Lead',
          score: l.score ?? 0,
          company: l.company,
        })),
        overdueTasksCount,
        staleContacts: staleContacts.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          daysSinceContact: c.lastContactedAt
            ? Math.floor(
                (heuristic.now.getTime() - c.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000)
              )
            : null,
        })),
      }).catch(() => {});

      const duration = performance.now() - startTime;
      if (duration > 500) {
        console.warn(`[home.getAllInsights] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
      }

      return {
        insights: page,
        nextCursor,
        hasMore,
        total,
        lastRefreshed: heuristic.now,
      };
    }),

  /**
   * Resolve a single insight by ID (AI table row or heuristic fallback).
   * Supports deep-linking from insight cards to entity AI tabs.
   */
  getInsightById: tenantProcedure
    .input(getInsightByIdInputSchema)
    .query(async ({ ctx, input }): Promise<GetInsightByIdResponse> => {
      const tenantId = ctx.tenant.tenantId;
      const userId = ctx.tenant.userId;

      const resolved = await resolveInsightById(
        ctx.prismaWithTenant,
        tenantId,
        userId,
        input.insightId
      );
      if (!resolved) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insight not found',
        });
      }

      return {
        insight: resolved.insight,
      };
    }),

  /**
   * Optionally creates a review queue row for insights marked requiresApproval.
   * Idempotent by insightId.
   */
  ensureInsightReview: tenantProcedure
    .input(ensureInsightReviewInputSchema)
    .mutation(async ({ ctx, input }): Promise<EnsureInsightReviewResponse> => {
      const tenantId = ctx.tenant.tenantId;
      const userId = ctx.tenant.userId;

      const resolved = await resolveInsightById(
        ctx.prismaWithTenant,
        tenantId,
        userId,
        input.insightId
      );
      if (!resolved) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insight not found',
        });
      }

      const { insight, confidence } = resolved;
      if (!insight.requiresApproval) {
        return {
          created: false,
          reviewId: null,
          requiresApproval: false,
        };
      }

      const existing = await (ctx.prismaWithTenant as any).aIOutputReview.findFirst({
        where: {
          tenantId,
          outputType: 'NEXT_BEST_ACTION',
          outputPayload: {
            path: ['insightId'],
            equals: insight.id,
          },
        },
        select: { id: true },
      });

      if (existing?.id) {
        return {
          created: false,
          reviewId: existing.id,
          requiresApproval: true,
        };
      }

      const review = await (ctx.prismaWithTenant as any).aIOutputReview.create({
        data: {
          tenantId,
          outputType: 'NEXT_BEST_ACTION',
          outputPayload: {
            insightId: insight.id,
            title: insight.title,
            description: insight.description,
            suggestedAction: insight.suggestedAction,
            entityType: insight.entityType,
            entityId: insight.entityId,
            actionUrl: insight.actionUrl,
            source: 'home-insight-link',
            requestedByUserId: userId,
          },
          confidence,
          slaDeadline: new Date(Date.now() + INSIGHT_REVIEW_SLA_HOURS * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      return {
        created: true,
        reviewId: review.id,
        requiresApproval: true,
      };
    }),
  /**
   * Dismiss a stale insight — called by the frontend when an insight links to
   * an entity that no longer exists (e.g. deleted lead/contact/deal).
   * Also handles explicit user dismissals.
   */
  dismissInsight: tenantProcedure
    .input(
      z.object({
        insightId: z.string().min(1),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const now = new Date();

      const updated = await ctx.prismaWithTenant.aIInsight.updateMany({
        where: {
          id: input.insightId,
          tenantId,
          status: { notIn: ['DISMISSED', 'EXPIRED'] },
        },
        data: {
          status: 'DISMISSED',
          dismissedAt: now,
          dismissReason: input.reason || 'Dismissed by user',
        },
      });

      return { dismissed: updated.count > 0 };
    }),
});

export type HomeRouter = typeof homeRouter;
