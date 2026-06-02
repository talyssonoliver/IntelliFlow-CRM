/**
 * Lead Scoring Job Handler
 *
 * BullMQ job handler for processing lead scoring requests.
 *
 * @module ai-worker/jobs/scoring
 * @task IFC-168
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { LeadScoringChain } from '../chains/scoring.chain';
import type { LeadInput, ScoringResult } from '../chains/scoring.chain';
import { logAIAgentAction } from '../utils/audit-log';
import { getLLMBreaker } from '../lib/llm-factory';
import type { CircuitBreaker } from '../utils/circuit-breaker';
import { runWithLogContext, getCurrentLogContext } from '@intelliflow/observability';
import { isAiFeatureEnabled } from '../lib/feature-flags';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

const logger = pino({
  name: 'scoring-job',
  level: process.env.LOG_LEVEL || 'info',
  mixin: () => getCurrentLogContext() ?? {},
});

// ============================================================================
// Types
// ============================================================================

/** Queue name for scoring jobs */
export const SCORING_QUEUE = 'ai-scoring';

/** Lead tier based on score */
export type LeadTier = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/** Schema for scoring job data */
export const ScoringJobDataSchema = z.object({
  leadId: z.uuid(),
  tenantId: z.string().min(1),
  lead: z.object({
    email: z.email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    source: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  correlationId: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type ScoringJobData = z.infer<typeof ScoringJobDataSchema>;

/** Schema for scoring job result */
export const ScoringJobResultSchema = z.object({
  leadId: z.uuid(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  tier: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  factors: z.array(
    z.object({
      name: z.string(),
      impact: z.number(),
      reasoning: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
  modelVersion: z.string(),
  processedAt: z.iso.datetime(),
  processingTimeMs: z.number(),
});

export type ScoringJobResult = z.infer<typeof ScoringJobResultSchema>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute lead tier from score
 */
function computeTier(score: number): LeadTier {
  if (score >= 80) return 'HOT';
  if (score >= 60) return 'WARM';
  if (score >= 30) return 'COLD';
  return 'UNQUALIFIED';
}

/** Map lead tier to churn risk level. */
function churnRiskFromTier(tier: LeadTier): 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' {
  if (tier === 'HOT') return 'MINIMAL';
  if (tier === 'WARM') return 'LOW';
  if (tier === 'COLD') return 'MEDIUM';
  return 'HIGH';
}

/** Map score to sentiment label. */
function sentimentFromScore(score: number): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' {
  if (score >= 65) return 'POSITIVE';
  if (score >= 35) return 'NEUTRAL';
  return 'NEGATIVE';
}

/** Map score to ICP match label. */
function icpMatchFromScore(score: number): string {
  if (score >= 80) return 'Strong Match';
  if (score >= 60) return 'Good Match';
  return 'Partial Match';
}

/**
 * Generate recommendations based on tier and score
 */
function generateRecommendations(tier: LeadTier, score: number): string[] {
  switch (tier) {
    case 'HOT':
      return [
        'Schedule immediate follow-up call',
        'Assign to senior sales rep',
        'Prepare custom proposal',
      ];
    case 'WARM':
      return [
        'Send personalized email sequence',
        'Schedule discovery call within 48 hours',
        'Add to nurture campaign',
      ];
    case 'COLD':
      return [
        'Add to long-term nurture campaign',
        'Monitor engagement metrics',
        'Re-evaluate in 30 days',
      ];
    case 'UNQUALIFIED':
      return [
        'Archive for potential future outreach',
        'Request additional information if available',
        score > 0 ? 'Add to educational content list' : 'No action recommended',
      ];
  }
}

// ============================================================================
// Constants
// ============================================================================

/** LLM inference timeout for scoring (120 s — matches insight job pattern). */
const LLM_TIMEOUT_MS = 120_000;

// ============================================================================
// Fallback Scoring
// ============================================================================

/**
 * Heuristic fallback score when LLM is unavailable or timed out.
 * Pure logic — no LLM dependency. Survives a total LLM outage.
 */
function computeHeuristicScore(lead: ScoringJobData['lead']): number {
  let score = 50; // baseline

  // Corporate email domain bump
  const emailDomain = lead.email.split('@')[1] ?? '';
  const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  if (!freeDomains.includes(emailDomain.toLowerCase())) score += 10;

  // Title signals (decision-making authority)
  const title = (lead.title ?? '').toLowerCase();
  if (/\b(ceo|cto|cfo|vp|vice president|director|head|chief)\b/.test(title)) score += 15;
  else if (/\b(manager|lead|senior|principal)\b/.test(title)) score += 8;

  // Company present
  if (lead.company && lead.company.length > 1) score += 5;

  // Phone present
  if (lead.phone) score += 5;

  // Source quality
  const source = (lead.source ?? '').toLowerCase();
  if (source === 'referral') score += 10;
  else if (source === 'website' || source === 'demo_request') score += 5;

  // metadata: companySize
  const companySize = Number(
    (lead.metadata as Record<string, unknown> | undefined)?.companySize ?? 0
  );
  if (companySize > 500) score += 10;
  else if (companySize > 100) score += 5;

  return Math.min(100, Math.max(0, score));
}

/**
 * Wrap LLM scoring in a Promise.race timeout + circuit-breaker catch.
 * Returns `{ result, usedFallback }`.
 */
async function generateScoringWithFallback(
  job: Job<ScoringJobData>,
  chain: LeadScoringChain,
  input: LeadInput,
  timeoutMs: number,
  breaker: CircuitBreaker
): Promise<{ result: ScoringResult; usedFallback: boolean }> {
  try {
    const scored = await Promise.race([
      breaker.execute(() => chain.scoreLead(input)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`LLM scoring timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return { result: scored, usedFallback: false };
  } catch (error) {
    logger.warn(
      { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
      'LLM scoring failed or timed out — using heuristic fallback'
    );
    const heuristicScore = computeHeuristicScore(job.data.lead);
    const fallbackResult: ScoringResult = {
      score: heuristicScore,
      confidence: 0.3,
      factors: [
        {
          name: 'heuristic',
          impact: heuristicScore,
          reasoning: 'Heuristic fallback — LLM unavailable',
        },
      ],
      modelVersion: 'fallback',
    };
    return { result: fallbackResult, usedFallback: true };
  }
}

/** Convenience accessor for the scoring circuit breaker (purpose='scoring', tier='free'). */
function getScoringBreaker(): CircuitBreaker {
  return getLLMBreaker('scoring', 'free');
}

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Handle the scheduled cron sentinel — enumerate unscored/stale leads and enqueue per-lead jobs.
 */
async function handleScheduledDispatch(
  job: Job<ScoringJobData>,
  startTime: number
): Promise<ScoringJobResult> {
  const { leadId } = job.data;
  logger.info(
    { jobId: job.id },
    'Scheduled scoring dispatcher — enumerating unscored leads per tenant'
  );
  let enqueued = 0;

  try {
    const { prisma } = await import('@intelliflow/db');
    const { Queue } = await import('bullmq');

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Step 1: find distinct tenants that have any unscored / stale leads
    const tenantsWithUnscoredLeads = await (prisma as any).lead.groupBy({
      by: ['tenantId'],
      where: {
        OR: [
          { aiInsights: { none: {} } },
          { aiInsights: { some: { updatedAt: { lt: staleThreshold } } } },
        ],
      },
      _count: { id: true },
    });

    if (tenantsWithUnscoredLeads.length === 0) {
      logger.info(
        { jobId: job.id },
        'No tenants with unscored leads — skipping scheduled dispatch'
      );
      return {
        leadId,
        score: 0,
        confidence: 0,
        tier: 'UNQUALIFIED',
        factors: [],
        recommendations: [],
        modelVersion: 'scheduler-dispatcher',
        processedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
      };
    }

    const queue = new Queue(SCORING_QUEUE, {
      connection: {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });

    // Step 2: for each tenant, run a scoped query and enqueue per-lead jobs
    for (const tenantRow of tenantsWithUnscoredLeads) {
      const tenantId: string = tenantRow.tenantId;
      const tenantLeads = await (prisma as any).lead.findMany({
        where: {
          tenantId,
          OR: [
            { aiInsights: { none: {} } },
            { aiInsights: { some: { updatedAt: { lt: staleThreshold } } } },
          ],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          title: true,
          phone: true,
          source: true,
        },
        take: 100,
      });

      let tenantEnqueued = 0;
      for (const l of tenantLeads) {
        await queue.add(
          'score-lead',
          {
            leadId: l.id,
            tenantId,
            lead: {
              email: l.email,
              firstName: l.firstName ?? undefined,
              lastName: l.lastName ?? undefined,
              company: l.company ?? undefined,
              title: l.title ?? undefined,
              phone: l.phone ?? undefined,
              source: l.source ?? 'unknown',
            },
          },
          DEFAULT_SCORING_JOB_OPTIONS
        );
        tenantEnqueued++;
        enqueued++;
      }

      // Step 4: log per-tenant batch counts
      logger.info(
        { jobId: job.id, tenantId, batchSize: tenantEnqueued },
        'Enqueued scoring batch for tenant'
      );
    }

    await queue.close();

    logger.info(
      { jobId: job.id, tenantsProcessed: tenantsWithUnscoredLeads.length, leadsEnqueued: enqueued },
      'Scheduled scoring dispatcher completed'
    );
  } catch (error) {
    logger.error(
      { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
      'Scheduled scoring dispatcher failed'
    );
  }

  return {
    leadId,
    score: 0,
    confidence: 0,
    tier: 'UNQUALIFIED',
    factors: [],
    recommendations: [],
    modelVersion: 'scheduler-dispatcher',
    processedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Persist scoring result to LeadAIInsight table.
 */
async function persistScoringResult(
  leadId: string,
  tenantId: string,
  result: ScoringResult,
  tier: LeadTier,
  recommendations: string[]
): Promise<void> {
  try {
    const { prisma: rawPrisma } = await import('@intelliflow/db');
    const prisma = rawPrisma as unknown as import('@intelliflow/db').PrismaClient;
    const churnRisk = churnRiskFromTier(tier);

    await prisma.leadAIInsight.upsert({
      where: { leadId_tenantId: { leadId, tenantId } },
      create: {
        leadId,
        tenantId,
        engagementScore: Math.min(100, result.score),
        conversionProbability: Math.min(100, Math.round(result.score * 0.8)),
        estimatedValue: 0,
        churnRisk,
        nextBestAction: recommendations[0] || 'Review lead',
        sentiment: sentimentFromScore(result.score),
        sentimentTrend: 'stable',
        recommendations,
        lastEngagementDays: 0,
        icpMatch: icpMatchFromScore(result.score),
      },
      update: {
        engagementScore: Math.min(100, result.score),
        conversionProbability: Math.min(100, Math.round(result.score * 0.8)),
        churnRisk,
        nextBestAction: recommendations[0] || 'Review lead',
        recommendations,
      },
    });

    logger.info({ leadId, score: result.score, tier }, 'Persisted scoring result to LeadAIInsight');

    // H4: emit AI_AGENT audit entry — non-fatal (warn and continue on failure)
    await logAIAgentAction({
      tenantId,
      agentName: 'scoring-job',
      resourceType: 'LeadAIInsight',
      resourceId: leadId,
      action: 'UPSERT',
    }).catch((err: unknown) => {
      logger.warn({ leadId, err }, 'audit-log: logAIAgentAction failed (non-fatal)');
    });
  } catch (error) {
    logger.error(
      { leadId, error: error instanceof Error ? error.message : String(error) },
      'Failed to persist scoring result'
    );
  }
}

/**
 * Process a lead scoring job
 *
 * @param job - BullMQ job containing lead data
 * @returns Scoring result with score, confidence, and recommendations
 */
export async function processScoringJob(job: Job<ScoringJobData>): Promise<ScoringJobResult> {
  const validatedData = ScoringJobDataSchema.parse(job.data);

  return runWithLogContext(
    {
      correlationId: validatedData.correlationId ?? job.id ?? undefined,
      tenantId: validatedData.tenantId,
    },
    async () => {
      const startTime = Date.now();
      const { leadId, lead } = validatedData;

      if (validatedData.tenantId === '__scheduled__') {
        return handleScheduledDispatch(job, startTime);
      }

      // Feature-flag gate — checked after tenantId validation, before LLM work
      if (!isAiFeatureEnabled('ai.scoring.enabled', validatedData.tenantId)) {
        logger.info(
          { jobId: job.id, tenantId: validatedData.tenantId },
          'AI scoring job skipped — feature flag disabled'
        );
        return { skipped: true, reason: 'feature-flag-disabled' } as unknown as ScoringJobResult;
      }

      const chainInput: LeadInput = {
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        title: lead.title,
        phone: lead.phone,
        source: lead.source,
        metadata: lead.metadata,
      };

      await job.updateProgress(10);

      await job.extendLock(job.token!, 300_000); // 5 minutes — prevent stall detection during LLM call
      const breaker = getScoringBreaker();
      // Construct per-job chain with tenantId so versioned configs are resolved per-tenant
      const chainInstance = new LeadScoringChain({ tenantId: validatedData.tenantId });
      const { result, usedFallback } = await generateScoringWithFallback(
        job,
        chainInstance,
        chainInput,
        LLM_TIMEOUT_MS,
        breaker
      );

      await job.updateProgress(90);

      const tier = computeTier(result.score);
      const recommendations = generateRecommendations(tier, result.score);

      const tenantId = validatedData.tenantId;
      await persistScoringResult(leadId, tenantId, result, tier, recommendations);

      const processingTimeMs = Date.now() - startTime;
      const jobResult: ScoringJobResult = {
        leadId,
        score: result.score,
        confidence: result.confidence,
        tier,
        factors: result.factors,
        recommendations,
        modelVersion: usedFallback ? 'fallback' : result.modelVersion,
        processedAt: new Date().toISOString(),
        processingTimeMs,
      };

      await job.updateProgress(100);

      return jobResult;
    }
  );
}

// ============================================================================
// Job Options
// ============================================================================

/** Default job options for scoring jobs */
export const DEFAULT_SCORING_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
  },
};
