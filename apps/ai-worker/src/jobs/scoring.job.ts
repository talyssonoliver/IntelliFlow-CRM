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
import { leadScoringChain } from '../chains/scoring.chain';
import type { LeadInput, ScoringResult } from '../chains/scoring.chain';

// ============================================================================
// Types
// ============================================================================

/** Queue name for scoring jobs */
export const SCORING_QUEUE = 'ai-scoring';

/** Lead tier based on score */
export type LeadTier = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/** Schema for scoring job data */
export const ScoringJobDataSchema = z.object({
  leadId: z.string().uuid(),
  lead: z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    source: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
  correlationId: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
});

export type ScoringJobData = z.infer<typeof ScoringJobDataSchema>;

/** Schema for scoring job result */
export const ScoringJobResultSchema = z.object({
  leadId: z.string().uuid(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  tier: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  factors: z.array(z.object({
    name: z.string(),
    impact: z.number(),
    reasoning: z.string(),
  })),
  recommendations: z.array(z.string()),
  modelVersion: z.string(),
  processedAt: z.string().datetime(),
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
 * Process a lead scoring job
 *
 * @param job - BullMQ job containing lead data
 * @returns Scoring result with score, confidence, and recommendations
 */
export async function processScoringJob(job: Job<ScoringJobData>): Promise<ScoringJobResult> {
  const startTime = Date.now();
  const { leadId, lead } = job.data;

  // Transform job data to chain input
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

  // Update job progress
  await job.updateProgress(10);

  // Process through scoring chain
  const result: ScoringResult = await leadScoringChain.scoreLead(chainInput);

  await job.updateProgress(90);

  // Compute tier and recommendations
  const tier = computeTier(result.score);
  const recommendations = generateRecommendations(tier, result.score);

  // Transform to job result
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
