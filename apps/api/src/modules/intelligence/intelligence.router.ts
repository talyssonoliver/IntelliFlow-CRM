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

import { context as otelContext, propagation } from '@opentelemetry/api';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@intelliflow/db';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { loadBullMQ } from '../../lib/load-bullmq';
import {
  churnRiskLevelSchema,
  nbaActionTypeSchema,
  nbaPrioritySchema,
  aiInsightsSummarySchema,
} from '@intelliflow/validators';
import { getTenantContext } from '../../security/tenant-context';
import { SIGNIFICANCE_LEVELS, requiresHumanReview } from '@intelliflow/domain';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

// ── Structured sentiment data stored inside the Json `recommendations` field ──

const emotionEntrySchema = z.object({
  emotion: z.string(),
  intensity: z.number().min(0).max(1),
});

const keyPhraseEntrySchema = z.object({
  phrase: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
});

/** Shape written by updateLead/ContactInsights when sentiment data is available */
const structuredRecommendationsSchema = z.object({
  texts: z.array(z.string()).optional().default([]),
  emotions: z.array(emotionEntrySchema).optional().default([]),
  keyPhrases: z.array(keyPhraseEntrySchema).optional().default([]),
  primaryEmotion: z.string().optional().default('NEUTRAL'),
});

type StructuredRecommendations = z.infer<typeof structuredRecommendationsSchema>;

/**
 * Parse the `recommendations` Json field.
 *
 * Legacy rows store a plain `string[]`.  New rows store a structured object
 * `{ texts, emotions, keyPhrases, primaryEmotion }`.  This helper normalises
 * both shapes into `StructuredRecommendations`.
 */
function parseRecommendations(raw: unknown): StructuredRecommendations {
  if (raw == null) return { texts: [], emotions: [], keyPhrases: [], primaryEmotion: 'NEUTRAL' };

  // Legacy: plain string[]
  if (Array.isArray(raw)) {
    return {
      texts: raw.filter((r): r is string => typeof r === 'string'),
      emotions: [],
      keyPhrases: [],
      primaryEmotion: 'NEUTRAL',
    };
  }

  // New: structured object
  const parsed = structuredRecommendationsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  return { texts: [], emotions: [], keyPhrases: [], primaryEmotion: 'NEUTRAL' };
}

/**
 * Build the Json value to store in the `recommendations` field.
 * If only plain string recommendations are provided (no emotions/keyPhrases),
 * stores a legacy `string[]` for backward compatibility.
 */
function buildRecommendationsJson(
  texts: string[] | undefined,
  emotions: Array<{ emotion: string; intensity: number }> | undefined,
  keyPhrases: Array<{ phrase: string; sentiment: string }> | undefined,
  primaryEmotion: string | undefined
) {
  const hasStructuredData =
    (emotions && emotions.length > 0) || (keyPhrases && keyPhrases.length > 0);
  if (!hasStructuredData) {
    // Backward-compatible: plain string[]
    return texts ?? [];
  }
  return {
    texts: texts ?? [],
    emotions: emotions ?? [],
    keyPhrases: keyPhrases ?? [],
    primaryEmotion: primaryEmotion ?? 'NEUTRAL',
  };
}

type ScoreTier = 'hot' | 'warm' | 'cold';

function classifyScore(score: number): ScoreTier {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

function buildScoreTrends(allScores: Array<{ score: number; createdAt: Date }>): Array<{
  date: string;
  avgScore: number;
  hot: number;
  warm: number;
  cold: number;
  count: number;
}> {
  const trendMap = new Map<
    string,
    { totalScore: number; hot: number; warm: number; cold: number; count: number }
  >();

  for (const s of allScores) {
    const dateKey = s.createdAt.toISOString().split('T')[0];
    if (!trendMap.has(dateKey)) {
      trendMap.set(dateKey, { totalScore: 0, hot: 0, warm: 0, cold: 0, count: 0 });
    }
    const bucket = trendMap.get(dateKey)!;
    bucket.totalScore += s.score;
    bucket.count++;
    bucket[classifyScore(s.score)]++;
  }

  return Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      avgScore: b.count > 0 ? Math.round(b.totalScore / b.count) : 0,
      hot: b.hot,
      warm: b.warm,
      cold: b.cold,
      count: b.count,
    }));
}

/**
 * Entity type for AI predictions
 */
const entityTypeSchema = z.enum(['lead', 'contact', 'opportunity', 'account']);

/**
 * Input schema for getting AI insights
 */
const getInsightsInputSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.uuid(),
});

/**
 * Input schema for triggering predictions
 */
const triggerPredictionInputSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.uuid(),
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

// ── Shared helpers (reduce cognitive complexity & duplication) ────────────────

/** Superset row type used by both sentiment and churn dashboards */
type BaseInsightRow = {
  id: string;
  entityType: 'lead' | 'contact';
  entityId: string;
  sentiment: string;
  churnRisk: string;
  engagementScore: number;
  sentimentTrend: string | null;
  nextBestAction: string | null;
  recommendations: unknown;
  lastEngagementDays: number | null;
  updatedAt: Date;
};

/** Build a display name from first/last/company, with a fallback */
function buildEntityName(
  firstName: string | null,
  lastName: string | null,
  company: string | null,
  fallback: string
): string {
  return [firstName, lastName].filter(Boolean).join(' ') || company || fallback;
}

/** Convert date range string to a Date threshold */
function dateRangeSince(dateRange: '7d' | '30d' | '90d'): Date {
  const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysMap[dateRange]);
  return since;
}

/**
 * Fetch insight rows from both LeadAIInsight and ContactAIInsight tables.
 *
 * Dashboard stats and trends are computed over the FULL date window, so every
 * row in range is still read — but WITHOUT joining lead/contact. Display names
 * are only needed for the paginated page, so they're resolved separately by
 * `resolveEntityNames`. Previously each row carried a relational join + name
 * fields across the entire window even though only `limit` rows display them.
 * The two table reads are independent, so they run in parallel.
 */
async function fetchAllInsightRows(
  prisma: {
    leadAIInsight: { findMany: (...args: any[]) => any };
    contactAIInsight: { findMany: (...args: any[]) => any };
  },
  tenantId: string,
  since: Date,
  entityType: 'all' | 'lead' | 'contact'
): Promise<BaseInsightRow[]> {
  const insightSelect = {
    id: true,
    sentiment: true,
    churnRisk: true,
    engagementScore: true,
    sentimentTrend: true,
    nextBestAction: true,
    recommendations: true,
    lastEngagementDays: true,
    updatedAt: true,
  };

  const [leadInsights, contactInsights] = await Promise.all([
    entityType === 'all' || entityType === 'lead'
      ? prisma.leadAIInsight.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          select: { ...insightSelect, leadId: true },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([] as Array<any>),
    entityType === 'all' || entityType === 'contact'
      ? prisma.contactAIInsight.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          select: { ...insightSelect, contactId: true },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([] as Array<any>),
  ]);

  const rows: BaseInsightRow[] = [];
  for (const li of leadInsights) {
    rows.push({
      id: li.id,
      entityType: 'lead',
      entityId: li.leadId,
      sentiment: (li.sentiment ?? 'NEUTRAL').toUpperCase(),
      churnRisk: li.churnRisk,
      engagementScore: li.engagementScore,
      sentimentTrend: li.sentimentTrend,
      nextBestAction: li.nextBestAction,
      recommendations: li.recommendations,
      lastEngagementDays: li.lastEngagementDays,
      updatedAt: li.updatedAt,
    });
  }
  for (const ci of contactInsights) {
    rows.push({
      id: ci.id,
      entityType: 'contact',
      entityId: ci.contactId,
      sentiment: (ci.sentiment ?? 'NEUTRAL').toUpperCase(),
      churnRisk: ci.churnRisk,
      engagementScore: ci.engagementScore,
      sentimentTrend: ci.sentimentTrend,
      nextBestAction: ci.nextBestAction,
      recommendations: ci.recommendations,
      lastEngagementDays: ci.lastEngagementDays,
      updatedAt: ci.updatedAt,
    });
  }
  return rows;
}

/**
 * Batch-resolve display names for a page of insight rows. Names are only needed
 * for the rows actually shown, so we fetch them by id here (one query per entity
 * type) instead of joining lead/contact across the entire window. Queries are
 * tenant-scoped (defence-in-depth alongside RLS) so a cross-tenant/stale id can
 * never resolve to another tenant's entity name. Returns a map keyed by
 * `"<entityType>:<entityId>"`.
 */
async function resolveEntityNames(
  prisma: {
    lead: { findMany: (...args: any[]) => any };
    contact: { findMany: (...args: any[]) => any };
  },
  rows: Array<{ entityType: 'lead' | 'contact'; entityId: string }>,
  tenantId: string
): Promise<Map<string, string>> {
  const leadIds = [...new Set(rows.filter((r) => r.entityType === 'lead').map((r) => r.entityId))];
  const contactIds = [
    ...new Set(rows.filter((r) => r.entityType === 'contact').map((r) => r.entityId)),
  ];

  const [leads, contacts] = await Promise.all([
    leadIds.length
      ? prisma.lead.findMany({
          where: { id: { in: leadIds }, tenantId },
          select: { id: true, firstName: true, lastName: true, company: true },
        })
      : Promise.resolve([] as Array<any>),
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds }, tenantId },
          select: { id: true, firstName: true, lastName: true, company: true },
        })
      : Promise.resolve([] as Array<any>),
  ]);

  const names = new Map<string, string>();
  for (const l of leads) {
    names.set(`lead:${l.id}`, buildEntityName(l.firstName, l.lastName, l.company, 'Unknown Lead'));
  }
  for (const c of contacts) {
    names.set(
      `contact:${c.id}`,
      buildEntityName(c.firstName, c.lastName, c.company, 'Unknown Contact')
    );
  }
  return names;
}

/** Look up a resolved name, falling back to the per-type 'Unknown …' default */
function entityNameFor(
  names: Map<string, string>,
  entityType: 'lead' | 'contact',
  entityId: string
): string {
  return (
    names.get(`${entityType}:${entityId}`) ??
    (entityType === 'lead' ? 'Unknown Lead' : 'Unknown Contact')
  );
}

/** Map churn risk to urgency level */
function churnToUrgency(cr: string): string {
  if (cr === 'CRITICAL') return 'CRITICAL';
  if (cr === 'HIGH') return 'HIGH';
  if (cr === 'MEDIUM') return 'MEDIUM';
  return 'NONE';
}

/** Paginate an array by page/limit */
function paginateRows<T>(rows: T[], page: number, limit: number): T[] {
  const offset = (page - 1) * limit;
  return rows.slice(offset, offset + limit);
}

/** Group rows by date key for trend charts */
function groupByDateKey<T extends { updatedAt: Date }, B extends Record<string, number>>(
  rows: T[],
  init: () => B,
  accumulate: (bucket: B, row: T) => void
): Array<{ date: string; bucket: B }> {
  const trendMap = new Map<string, B>();
  for (const row of rows) {
    const dateKey = row.updatedAt.toISOString().split('T')[0];
    if (!trendMap.has(dateKey)) trendMap.set(dateKey, init());
    accumulate(trendMap.get(dateKey)!, row);
  }
  return Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({ date, bucket }));
}

type RagSearchResultRow = {
  id: string;
  source: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  metadata: Record<string, unknown>;
  citation: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Build all active Prisma search promises for ragSearch.
 * Only sources included in `searchSources` are queried.
 */
function buildRagSearchPromises(
  prisma: any,
  searchSources: string[],
  tenantId: string,
  searchTerm: string,
  dateFilter: { gte: Date } | undefined,
  limit: number,
  offset: number
): Promise<RagSearchResultRow[]>[] {
  const searches: Promise<RagSearchResultRow[]>[] = [];
  const insensitive = 'insensitive' as const;

  if (searchSources.includes('leads')) {
    searches.push(
      prisma.lead
        .findMany({
          where: {
            tenantId,
            ...(dateFilter && { updatedAt: dateFilter }),
            OR: [
              { firstName: { contains: searchTerm, mode: insensitive } },
              { lastName: { contains: searchTerm, mode: insensitive } },
              { email: { contains: searchTerm, mode: insensitive } },
              { company: { contains: searchTerm, mode: insensitive } },
            ],
          },
          take: limit,
          skip: offset,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows: any[]) =>
          rows.map((r: any) => ({
            id: r.id,
            source: 'leads',
            title: `${r.firstName} ${r.lastName}` + (r.company ? ` - ${r.company}` : ''),
            snippet:
              `${r.email ?? ''}` + (r.company ? ` at ${r.company}` : '') + `. Status: ${r.status}`,
            relevanceScore: 0.8,
            metadata: { status: r.status, company: r.company } as Record<string, unknown>,
            citation: 'Lead record',
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        )
    );
  }

  if (searchSources.includes('contacts')) {
    searches.push(
      prisma.contact
        .findMany({
          where: {
            tenantId,
            ...(dateFilter && { updatedAt: dateFilter }),
            OR: [
              { firstName: { contains: searchTerm, mode: insensitive } },
              { lastName: { contains: searchTerm, mode: insensitive } },
              { email: { contains: searchTerm, mode: insensitive } },
            ],
          },
          take: limit,
          skip: offset,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows: any[]) =>
          rows.map((r: any) => ({
            id: r.id,
            source: 'contacts',
            title: `${r.firstName} ${r.lastName}`,
            snippet: `${r.email ?? ''}. Status: ${r.status}`,
            relevanceScore: 0.75,
            metadata: { status: r.status } as Record<string, unknown>,
            citation: 'Contact record',
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        )
    );
  }

  if (searchSources.includes('accounts')) {
    searches.push(
      prisma.account
        .findMany({
          where: {
            tenantId,
            ...(dateFilter && { updatedAt: dateFilter }),
            OR: [
              { name: { contains: searchTerm, mode: insensitive } },
              { industry: { contains: searchTerm, mode: insensitive } },
            ],
          },
          take: limit,
          skip: offset,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows: any[]) =>
          rows.map((r: any) => ({
            id: r.id,
            source: 'accounts',
            title: r.name,
            snippet: `Industry: ${r.industry ?? 'N/A'}`,
            relevanceScore: 0.7,
            metadata: { industry: r.industry } as Record<string, unknown>,
            citation: 'Account record',
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        )
    );
  }

  if (searchSources.includes('opportunities')) {
    searches.push(
      prisma.opportunity
        .findMany({
          where: {
            tenantId,
            ...(dateFilter && { updatedAt: dateFilter }),
            OR: [
              { name: { contains: searchTerm, mode: insensitive } },
              { description: { contains: searchTerm, mode: insensitive } },
            ],
          },
          take: limit,
          skip: offset,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows: any[]) =>
          rows.map((r: any) => ({
            id: r.id,
            source: 'opportunities',
            title: r.name,
            snippet: r.description ?? `Stage: ${r.stage}`,
            relevanceScore: 0.7,
            metadata: { stage: r.stage, value: r.value } as Record<string, unknown>,
            citation: 'Opportunity pipeline',
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        )
    );
  }

  if (searchSources.includes('tickets')) {
    searches.push(
      prisma.ticket
        .findMany({
          where: {
            tenantId,
            ...(dateFilter && { updatedAt: dateFilter }),
            OR: [
              { subject: { contains: searchTerm, mode: insensitive } },
              { description: { contains: searchTerm, mode: insensitive } },
            ],
          },
          take: limit,
          skip: offset,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows: any[]) =>
          rows.map((r: any) => ({
            id: r.id,
            source: 'tickets',
            title: r.subject,
            snippet: r.description ?? '',
            relevanceScore: 0.65,
            metadata: { status: r.status, priority: r.priority } as Record<string, unknown>,
            citation: 'Support ticket',
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        )
    );
  }

  return searches;
}

export const intelligenceRouter = createTRPCRouter({
  /**
   * Get sentiment dashboard data (PG-142)
   *
   * Single data source: LeadAIInsight + ContactAIInsight tables.
   * Stats, analysis list, and trend chart all derive from the same rows,
   * ensuring consistency between the summary counts and the detail cards.
   */
  getSentimentDashboard: tenantProcedure
    .input(
      z.object({
        entityType: z.enum(['all', 'lead', 'contact']).default('all'),
        dateRange: z.enum(['7d', '30d', '90d']).default('30d'),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;
      const since = dateRangeSince(input.dateRange);

      const allInsights = await fetchAllInsightRows(
        ctx.prismaWithTenant,
        tenantId,
        since,
        input.entityType
      );
      allInsights.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      // Stats
      const sentimentCounts = {
        VERY_POSITIVE: 0,
        POSITIVE: 0,
        NEUTRAL: 0,
        NEGATIVE: 0,
        VERY_NEGATIVE: 0,
      };
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

      // Recent analyses (paginated)
      const sentimentScoreMap: Record<string, number> = {
        VERY_POSITIVE: 0.9,
        POSITIVE: 0.7,
        NEUTRAL: 0.5,
        NEGATIVE: 0.3,
        VERY_NEGATIVE: 0.1,
      };
      const pageRows = paginateRows(allInsights, input.page, input.limit);
      const nameMap = await resolveEntityNames(ctx.prismaWithTenant, pageRows, tenantId);
      const recentAnalyses = pageRows.map((row) => {
        const recs = parseRecommendations(row.recommendations);
        return {
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          entityName: entityNameFor(nameMap, row.entityType, row.entityId),
          sentiment: row.sentiment,
          sentimentScore: sentimentScoreMap[row.sentiment] ?? 0.5,
          emotions: recs.emotions,
          primaryEmotion: recs.primaryEmotion,
          urgency: churnToUrgency(row.churnRisk),
          keyPhrases: recs.keyPhrases,
          confidence: row.engagementScore / 100,
          analyzedAt: row.updatedAt.toISOString(),
        };
      });

      // Trends
      const trends = groupByDateKey(
        allInsights,
        () => ({ positive: 0, neutral: 0, negative: 0, total: 0 }),
        (bucket, row) => {
          if (row.sentiment.includes('POSITIVE')) bucket.positive++;
          else if (row.sentiment.includes('NEGATIVE')) bucket.negative++;
          else bucket.neutral++;
          bucket.total++;
        }
      ).map(({ date, bucket: b }) => ({
        date,
        positive: b.positive,
        neutral: b.neutral,
        negative: b.negative,
        avgScore: b.total > 0 ? (b.positive - b.negative) / b.total : 0,
      }));

      return {
        stats: {
          total,
          positive: posCount,
          neutral: neutralCount,
          negative: negCount,
          avgScore,
          urgentCount,
        },
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
    .input(z.object({ leadId: z.uuid() }))
    .output(aiInsightsResponseSchema.nullable())
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Verify lead exists and belongs to tenant
      const lead = await typedCtx.prismaWithTenant.lead.findUnique({
        where: { id: input.leadId },
        include: {
          aiInsights: { take: 1 },
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lead with ID ${input.leadId} not found`,
        });
      }

      const aiInsightRow = lead.aiInsights[0] ?? null;
      if (!aiInsightRow) {
        return null;
      }

      return {
        id: aiInsightRow.id,
        entityId: lead.id,
        entityType: 'lead' as const,
        churnRisk: aiInsightRow.churnRisk,
        churnRiskScore: null, // Not stored directly, computed from churnRisk level
        conversionProbability: aiInsightRow.conversionProbability,
        estimatedValue: aiInsightRow.estimatedValue,
        lifetimeValue: null,
        engagementScore: aiInsightRow.engagementScore,
        sentiment: aiInsightRow.sentiment,
        sentimentTrend: aiInsightRow.sentimentTrend,
        lastEngagementDays: aiInsightRow.lastEngagementDays,
        nextBestAction: aiInsightRow.nextBestAction,
        recommendations: aiInsightRow.recommendations as string[] | null,
        updatedAt: aiInsightRow.updatedAt,
        createdAt: aiInsightRow.createdAt,
      };
    }),

  /**
   * Get AI insights for a contact
   * Returns the stored AI insights from ContactAIInsight model
   */
  getContactInsights: tenantProcedure
    .input(z.object({ contactId: z.uuid() }))
    .output(aiInsightsResponseSchema.nullable())
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
          include: { aiInsights: { take: 1 } },
        });
        if (lead?.aiInsights[0]) {
          aiInsight = lead.aiInsights[0];
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

      // Validate action type against the canonical schema, falling back to 'WAIT'
      const rawAction = aiInsight.nextBestAction?.toUpperCase().replaceAll(/\s+/g, '_') || 'WAIT';
      const parsedAction = nbaActionTypeSchema.safeParse(rawAction);
      const action = parsedAction.success ? parsedAction.data : 'WAIT';

      // Validate priority against schema
      const parsedPriority = nbaPrioritySchema.safeParse('MEDIUM');
      const priority = parsedPriority.success ? parsedPriority.data : 'MEDIUM';

      // Validate churn risk level against schema
      const parsedChurnLevel = churnRiskLevelSchema.safeParse(aiInsight.churnRisk);
      const churnLevel = parsedChurnLevel.success ? parsedChurnLevel.data : 'LOW';

      const summary = {
        churnRisk: {
          score: churnRiskScoreMap[aiInsight.churnRisk] ?? 0,
          level: churnLevel,
          lastAssessedAt: aiInsight.updatedAt.toISOString(),
        },
        nextBestAction: {
          action,
          title: aiInsight.nextBestAction || 'No action recommended',
          priority,
        },
        conversionProbability: aiInsight.conversionProbability,
        lifetimeValue: aiInsight.lifetimeValue ?? aiInsight.estimatedValue,
        sentiment: aiInsight.sentiment as 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | undefined,
        engagementScore: aiInsight.engagementScore,
        recommendations: Array.isArray(aiInsight.recommendations)
          ? (aiInsight.recommendations as string[])
          : [],
        confidence: 0.85,
        lastUpdatedAt: aiInsight.updatedAt.toISOString(),
      };

      // Validate summary against the canonical aiInsightsSummarySchema
      const validated = aiInsightsSummarySchema.safeParse(summary);
      if (!validated.success) {
        console.warn(
          `[intelligence.getInsightsSummary] Schema validation warning for ${entityType}/${entityId}: ${validated.error.message}`
        );
      }

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

      // Enqueue prediction job via BullMQ (same pattern as home.router.ts)
      const priorityMap = { HIGH: 1, NORMAL: 5, LOW: 10 } as const;
      const correlationId = `prediction-${entityType}-${entityId}-${Date.now()}`;

      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES, DEFAULT_QUEUE_CONFIGS } =
          await import('@intelliflow/platform/queues/types');
        const qConfig = DEFAULT_QUEUE_CONFIGS[QUEUE_NAMES.AI_PREDICTION];
        const queue = new Queue(QUEUE_NAMES.AI_PREDICTION, {
          connection: {
            host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          },
          defaultJobOptions: {
            attempts: qConfig.defaultJobOptions.attempts,
            backoff: {
              type: qConfig.defaultJobOptions.backoff.type,
              delay: qConfig.defaultJobOptions.backoff.delay,
            },
            removeOnComplete: qConfig.defaultJobOptions.removeOnComplete,
            removeOnFail: qConfig.defaultJobOptions.removeOnFail,
          },
        });

        const _otelCarrierPredict: Record<string, string> = {};
        propagation.inject(otelContext.active(), _otelCarrierPredict);
        const job = await queue.add(
          'predict',
          {
            entityType,
            entityId,
            predictionType,
            correlationId,
            context: {
              tenantId: typedCtx.tenantId,
              userId: typedCtx.userId,
            },
            priority: priorityMap[priority],
            _otelCarrier: _otelCarrierPredict,
          },
          {
            priority: priorityMap[priority],
          }
        );

        await queue.close();

        return {
          status: 'QUEUED' as const,
          jobId: job.id,
          entityType,
          entityId,
          predictionType,
          queuedAt: new Date().toISOString(),
        };
      } catch {
        // Redis unavailable — fall back to PENDING status
        return {
          status: 'PENDING' as const,
          message: 'Redis unavailable. Prediction job could not be queued.',
          entityType,
          entityId,
          predictionType,
          queuedAt: new Date().toISOString(),
        };
      }
    }),

  /**
   * Update AI insights for a lead
   * Called by ai-worker after prediction completes
   */
  updateLeadInsights: tenantProcedure
    .input(
      z.object({
        leadId: z.uuid(),
        churnRisk: churnRiskLevelSchema.optional(),
        conversionProbability: z.number().min(0).max(100).optional(),
        estimatedValue: z.number().optional(),
        engagementScore: z.number().min(0).max(100).optional(),
        sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
        sentimentTrend: z.string().optional(),
        nextBestAction: z.string().optional(),
        recommendations: z.array(z.string()).optional(),
        emotions: z.array(emotionEntrySchema).optional(),
        keyPhrases: z.array(keyPhraseEntrySchema).optional(),
        primaryEmotion: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { leadId, confidence, emotions, keyPhrases, primaryEmotion, ...updateData } = input;

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
      const needsReview =
        confidence === undefined ? false : requiresHumanReview(confidence, 'CHURN_PREDICTION');

      if (needsReview) {
        console.warn(
          `[intelligence.updateLeadInsights] Lead ${leadId} requires human review (confidence: ${confidence?.toFixed(2)}, threshold: ${SIGNIFICANCE_LEVELS.MEDIUM})`
        );
      }

      // Build structured recommendations JSON (stores emotions + keyPhrases alongside text recs)
      const recsJson = buildRecommendationsJson(
        updateData.recommendations,
        emotions,
        keyPhrases,
        primaryEmotion
      );

      // Upsert AI insight
      const aiInsight = await ctx.prismaWithTenant.leadAIInsight.upsert({
        where: { leadId_tenantId: { leadId, tenantId: typedCtx.tenant.tenantId } },
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
          recommendations: recsJson as Prisma.InputJsonValue,
        },
        update: {
          ...updateData,
          recommendations: recsJson as Prisma.InputJsonValue,
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
    .input(
      z.object({
        contactId: z.uuid(),
        churnRisk: churnRiskLevelSchema.optional(),
        conversionProbability: z.number().min(0).max(100).optional(),
        lifetimeValue: z.number().optional(),
        engagementScore: z.number().min(0).max(100).optional(),
        sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
        sentimentTrend: z.string().optional(),
        nextBestAction: z.string().optional(),
        recommendations: z.array(z.string()).optional(),
        emotions: z.array(emotionEntrySchema).optional(),
        keyPhrases: z.array(keyPhraseEntrySchema).optional(),
        primaryEmotion: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { contactId, emotions, keyPhrases, primaryEmotion, ...updateData } = input;

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

      // Build structured recommendations JSON
      const recsJson = buildRecommendationsJson(
        updateData.recommendations,
        emotions,
        keyPhrases,
        primaryEmotion
      );

      // Upsert AI insight
      const aiInsight = await ctx.prismaWithTenant.contactAIInsight.upsert({
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
          recommendations: recsJson as Prisma.InputJsonValue,
        },
        update: {
          ...updateData,
          recommendations: recsJson as Prisma.InputJsonValue,
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
    .input(
      z.object({
        entityType: z.enum(['all', 'lead', 'contact']).default('all'),
        dateRange: z.enum(['7d', '30d', '90d']).default('30d'),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;
      const since = dateRangeSince(input.dateRange);

      const slaHoursMap: Record<string, number> = {
        CRITICAL: 24,
        HIGH: 48,
        MEDIUM: 168,
        LOW: 336,
        MINIMAL: 720,
      };
      const riskOrder: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
        MINIMAL: 4,
      };

      const allInsights = await fetchAllInsightRows(
        ctx.prismaWithTenant,
        tenantId,
        since,
        input.entityType
      );
      allInsights.sort((a, b) => {
        const riskDiff = (riskOrder[a.churnRisk] ?? 4) - (riskOrder[b.churnRisk] ?? 4);
        return riskDiff === 0 ? b.updatedAt.getTime() - a.updatedAt.getTime() : riskDiff;
      });

      // Stats
      const distribution: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        MINIMAL: 0,
      };
      let totalEngagement = 0;
      for (const row of allInsights) {
        if (row.churnRisk in distribution) distribution[row.churnRisk]++;
        totalEngagement += row.engagementScore;
      }
      const total = allInsights.length;
      const avgEngagement = total > 0 ? Math.round(totalEngagement / total) : 0;

      // Paginated at-risk customers
      const pageRows = paginateRows(allInsights, input.page, input.limit);
      const nameMap = await resolveEntityNames(ctx.prismaWithTenant, pageRows, tenantId);
      const atRiskCustomers = pageRows.map((row) => {
        const slaHours = slaHoursMap[row.churnRisk] ?? 720;
        const slaDeadline = new Date(row.updatedAt.getTime() + slaHours * 3600000);
        const parsedRisk = churnRiskLevelSchema.safeParse(row.churnRisk);
        return {
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          entityName: entityNameFor(nameMap, row.entityType, row.entityId),
          riskLevel: parsedRisk.success ? parsedRisk.data : 'LOW',
          engagementScore: row.engagementScore,
          slaHours,
          slaDeadline: slaDeadline.toISOString(),
          nextBestAction: row.nextBestAction,
          recommendations: Array.isArray(row.recommendations)
            ? (row.recommendations as string[])
            : [],
          lastEngagementDays: row.lastEngagementDays,
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      // Trends
      const trends = groupByDateKey(
        allInsights,
        () => ({ critical: 0, high: 0, medium: 0, low: 0, minimal: 0, totalEng: 0, count: 0 }),
        (bucket, row) => {
          const key = row.churnRisk.toLowerCase() as keyof typeof bucket;
          if (key in bucket) bucket[key]++;
          bucket.totalEng += row.engagementScore;
          bucket.count++;
        }
      ).map(({ date, bucket: b }) => ({
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

  // ── Lead Scoring Dashboard (PG-148) ──────────────────────────────

  getLeadScoringDashboard: tenantProcedure
    .input(
      z.object({
        dateRange: z.enum(['7d', '30d', '90d']).default('30d'),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - daysMap[input.dateRange]);

      // Fetch all AI scores for the tenant within the date range
      const allScores = await ctx.prismaWithTenant.aIScore.findMany({
        where: {
          tenantId,
          createdAt: { gte: since },
        },
        include: {
          lead: {
            select: { id: true, firstName: true, lastName: true, company: true },
          },
        },
        orderBy: { score: 'desc' },
      });

      // Stats aggregation
      let totalScore = 0;
      let totalConfidence = 0;
      let hot = 0;
      let warm = 0;
      let cold = 0;

      for (const s of allScores) {
        totalScore += s.score;
        totalConfidence += s.confidence;
        const tier = classifyScore(s.score);
        if (tier === 'hot') hot++;
        else if (tier === 'warm') warm++;
        else cold++;
      }

      const total = allScores.length;
      const avgScore = total > 0 ? Math.round(totalScore / total) : 0;
      const avgConfidence = total > 0 ? totalConfidence / total : 0;

      // Paginated scored leads
      const offset = (input.page - 1) * input.limit;
      const paginatedScores = allScores.slice(offset, offset + input.limit);

      const scoredLeads = paginatedScores.map((s) => {
        const leadName =
          [s.lead.firstName, s.lead.lastName].filter(Boolean).join(' ') || 'Unknown Lead';
        const tier: ScoreTier = classifyScore(s.score);

        // Parse factors from Json field
        let factors: Array<{ name: string; impact: number; reasoning: string }> = [];
        if (Array.isArray(s.factors)) {
          factors = (s.factors as Array<Record<string, unknown>>).map((f) => ({
            name: (f.name as string | null | undefined) ?? '',
            impact: Number(f.impact ?? 0),
            reasoning: (f.reasoning as string | null | undefined) ?? '',
          }));
        }

        return {
          id: s.id,
          leadId: s.leadId,
          leadName,
          company: s.lead.company,
          score: s.score,
          confidence: s.confidence,
          factors,
          modelVersion: s.modelVersion,
          scoredAt: s.createdAt.toISOString(),
          tier,
          requiresReview: requiresHumanReview(s.confidence, 'LEAD_SCORING'),
        };
      });

      // Trends grouped by date
      const trends = buildScoreTrends(allScores);

      return {
        stats: { total, hot, warm, cold, avgScore, avgConfidence },
        distribution: { hot, warm, cold },
        scoredLeads,
        trends,
      };
    }),

  // ── RAG Search (PG-144) ──────────────────────────────────

  ragSearch: tenantProcedure
    .input(
      z.object({
        query: z.string().min(1).max(1000),
        sources: z
          .array(
            z.enum([
              'leads',
              'contacts',
              'accounts',
              'opportunities',
              'documents',
              'notes',
              'conversations',
              'messages',
              'tickets',
            ])
          )
          .optional(),
        searchType: z.enum(['fulltext', 'semantic', 'hybrid']).default('hybrid'),
        minRelevance: z.number().min(0).max(1).default(0.3),
        dateRange: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const startTime = performance.now();
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      // Date range filter
      let since: Date | undefined;
      if (input.dateRange !== 'all') {
        const daysMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };
        since = new Date();
        since.setUTCDate(since.getUTCDate() - (daysMap[input.dateRange] ?? 7));
      }

      const searchTerm = input.query.trim();
      const results: RagSearchResultRow[] = [];

      // Determine which sources to search
      const allSources = [
        'leads',
        'contacts',
        'accounts',
        'opportunities',
        'documents',
        'notes',
        'conversations',
        'messages',
        'tickets',
      ];
      const searchSources = input.sources ?? allSources;

      // Search each source with tenant isolation
      const dateFilter = since ? { gte: since } : undefined;

      try {
        const searches = buildRagSearchPromises(
          ctx.prismaWithTenant,
          searchSources,
          tenantId,
          searchTerm,
          dateFilter,
          input.limit,
          input.offset
        );

        // Run all searches in parallel
        const allResults = await Promise.all(searches);
        for (const batch of allResults) {
          results.push(...batch);
        }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Search failed',
          cause: err,
        });
      }

      // Apply min relevance filter
      const filteredResults = results.filter((r) => r.relevanceScore >= input.minRelevance);

      // Sort by relevance (descending)
      filteredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Build source counts
      const sourceCounts: Record<string, number> = {};
      for (const r of filteredResults) {
        sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1;
      }

      // Calculate average relevance
      const avgRelevance =
        filteredResults.length > 0
          ? filteredResults.reduce((sum, r) => sum + r.relevanceScore, 0) / filteredResults.length
          : 0;

      const executionTimeMs = Math.round(performance.now() - startTime);

      return {
        results: filteredResults.slice(0, input.limit),
        totalResults: filteredResults.length,
        avgRelevance: Math.round(avgRelevance * 100) / 100,
        executionTimeMs,
        sourceCounts,
      };
    }),
});

export type IntelligenceRouter = typeof intelligenceRouter;
