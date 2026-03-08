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
import { leadScoringChain } from '../chains/scoring.chain';
import type { LeadInput, ScoringResult } from '../chains/scoring.chain';

const logger = pino({
  name: 'scoring-job',
  level: process.env.LOG_LEVEL || 'info',
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
  tenantId: z.string().optional(),
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
// Job Handler
// ============================================================================

/**
 * Handle the scheduled cron sentinel — enumerate unscored/stale leads and enqueue per-lead jobs.
 */
async function handleScheduledDispatch(job: Job<ScoringJobData>, startTime: number): Promise<ScoringJobResult> {
  const { leadId } = job.data;
  logger.info({ jobId: job.id }, 'Scheduled scoring dispatcher — enumerating unscored leads');
  let enqueued = 0;

  try {
    const { prisma } = await import('@intelliflow/db');
    const { Queue } = await import('bullmq');

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unscoredLeads = await prisma.lead.findMany({
      where: {
        OR: [
          { aiInsight: null },
          { aiInsight: { updatedAt: { lt: staleThreshold } } },
        ],
      },
      select: {
        id: true,
        tenantId: true,
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

    if (unscoredLeads.length > 0) {
      const queue = new Queue(SCORING_QUEUE, {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        },
      });

      for (const l of unscoredLeads) {
        await queue.add('score-lead', {
          leadId: l.id,
          tenantId: l.tenantId,
          lead: {
            email: l.email,
            firstName: l.firstName ?? undefined,
            lastName: l.lastName ?? undefined,
            company: l.company ?? undefined,
            title: l.title ?? undefined,
            phone: l.phone ?? undefined,
            source: l.source ?? 'unknown',
          },
        }, DEFAULT_SCORING_JOB_OPTIONS);
        enqueued++;
      }

      await queue.close();
    }

    logger.info({ jobId: job.id, leadsEnqueued: enqueued }, 'Scheduled scoring dispatcher completed');
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
    const { prisma } = await import('@intelliflow/db');
    const churnRisk = churnRiskFromTier(tier);

    await prisma.leadAIInsight.upsert({
      where: { leadId },
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
  const startTime = Date.now();
  const { leadId, lead } = job.data;

  if (job.data.tenantId === '__scheduled__') {
    return handleScheduledDispatch(job, startTime);
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

  const result: ScoringResult = await leadScoringChain.scoreLead(chainInput);

  await job.updateProgress(90);

  const tier = computeTier(result.score);
  const recommendations = generateRecommendations(tier, result.score);

  const tenantId = job.data.tenantId;
  if (tenantId) {
    await persistScoringResult(leadId, tenantId, result, tier, recommendations);
  }

  const processingTimeMs = Date.now() - startTime;
  const jobResult: ScoringJobResult = {
    leadId,
    score: result.score,
    confidence: result.confidence,
    tier,
    factors: result.factors,
    recommendations,
    modelVersion: result.modelVersion,
    processedAt: new Date().toISOString(),
    processingTimeMs,
  };

  await job.updateProgress(100);

  return jobResult;
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
