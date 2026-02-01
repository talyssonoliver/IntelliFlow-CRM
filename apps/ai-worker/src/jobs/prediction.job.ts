/**
 * Prediction Job Handler (IFC-095, IFC-168)
 *
 * BullMQ job handler for processing AI prediction requests
 * (churn risk, next best action, qualification).
 *
 * Integrates with real AI chains instead of returning mock values:
 * - processChurnRisk: Uses ChurnRiskChain
 * - processNextBestAction: Uses NextBestActionAgent
 * - processQualification: Uses LeadScoringChain
 *
 * @module ai-worker/jobs/prediction
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';

// AI Chain imports (IFC-095)
import { getChurnRiskChain, type ChurnRiskInput } from '../chains/churn-risk.chain';
import { createNBAAgent, type NBAContext } from '../agents/next-best-action.agent';
import { getLeadScoringChain, type LeadInput } from '../chains/scoring.chain';

const logger = pino({
  name: 'prediction-job',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

/** Queue name for prediction jobs */
export const PREDICTION_QUEUE = 'ai-prediction';

/** Prediction type enum */
export const PredictionTypes = ['CHURN_RISK', 'NEXT_BEST_ACTION', 'QUALIFICATION'] as const;
export type PredictionType = (typeof PredictionTypes)[number];

/** Schema for prediction job data */
export const PredictionJobDataSchema = z.object({
  entityType: z.enum(['lead', 'contact', 'opportunity', 'account']),
  entityId: z.string().uuid(),
  predictionType: z.enum(PredictionTypes),
  context: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
});

export type PredictionJobData = z.infer<typeof PredictionJobDataSchema>;

/** Schema for prediction job result */
export const PredictionJobResultSchema = z.object({
  entityType: z.string(),
  entityId: z.string().uuid(),
  predictionType: z.string(),
  prediction: z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    confidence: z.number().min(0).max(1),
    explanation: z.string(),
  }),
  recommendations: z.array(z.string()),
  processedAt: z.string().datetime(),
  processingTimeMs: z.number(),
});

export type PredictionJobResult = z.infer<typeof PredictionJobResultSchema>;

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Process a prediction job
 *
 * @param job - BullMQ job containing prediction request
 * @returns Prediction result
 */
export async function processPredictionJob(job: Job<PredictionJobData>): Promise<PredictionJobResult> {
  const startTime = Date.now();
  const { entityType, entityId, predictionType, context } = job.data;

  logger.info(
    {
      jobId: job.id,
      entityType,
      entityId,
      predictionType,
    },
    'Processing prediction job'
  );

  // Update job progress
  await job.updateProgress(10);

  // Route to appropriate prediction handler
  let prediction: PredictionJobResult['prediction'];
  let recommendations: string[];

  switch (predictionType) {
    case 'CHURN_RISK':
      ({ prediction, recommendations } = await processChurnRisk(entityType, entityId, context));
      break;
    case 'NEXT_BEST_ACTION':
      ({ prediction, recommendations } = await processNextBestAction(entityType, entityId, context));
      break;
    case 'QUALIFICATION':
      ({ prediction, recommendations } = await processQualification(entityType, entityId, context));
      break;
    default:
      throw new Error(`Unknown prediction type: ${predictionType}`);
  }

  await job.updateProgress(90);

  // Transform to job result
  const processingTimeMs = Date.now() - startTime;
  const jobResult: PredictionJobResult = {
    entityType,
    entityId,
    predictionType,
    prediction,
    recommendations,
    processedAt: new Date().toISOString(),
    processingTimeMs,
  };

  await job.updateProgress(100);

  logger.info(
    {
      jobId: job.id,
      processingTimeMs,
      confidence: prediction.confidence,
    },
    'Prediction job completed'
  );

  return jobResult;
}

// ============================================================================
// Prediction Handlers - Real AI Chain Integration (IFC-095)
// ============================================================================

/**
 * Process churn risk prediction using ChurnRiskChain
 *
 * @param entityType - Type of entity (lead, contact, opportunity, account)
 * @param entityId - UUID of the entity
 * @param context - Optional context data with engagement metrics
 * @returns Prediction result with risk score and recommendations
 */
async function processChurnRisk(
  entityType: string,
  entityId: string,
  context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  logger.info({ entityType, entityId }, 'Processing churn risk with real AI chain');

  try {
    // Build input for churn risk chain
    const churnInput: ChurnRiskInput = {
      entityType: entityType as ChurnRiskInput['entityType'],
      entityId,
      // Extract engagement metrics from context if available
      daysSinceLastLogin: context?.daysSinceLastLogin as number | undefined,
      loginFrequency30d: context?.loginFrequency30d as number | undefined,
      sessionDurationAvg: context?.sessionDurationAvg as number | undefined,
      featureUsageScore: context?.featureUsageScore as number | undefined,
      emailOpenRate: context?.emailOpenRate as number | undefined,
      usageTrendSlope: context?.usageTrendSlope as number | undefined,
      sessionTimeTrend: context?.sessionTimeTrend as number | undefined,
      totalRevenue: context?.totalRevenue as number | undefined,
      paymentConsistency: context?.paymentConsistency as number | undefined,
      billingIssuesCount: context?.billingIssuesCount as number | undefined,
      contractLengthMonths: context?.contractLengthMonths as number | undefined,
      supportTickets30d: context?.supportTickets30d as number | undefined,
      ticketResolutionSatisfaction: context?.ticketResolutionSatisfaction as number | undefined,
      escalationCount: context?.escalationCount as number | undefined,
      npsScore: context?.npsScore as number | undefined,
      csatAvg: context?.csatAvg as number | undefined,
      accountAgeMonths: context?.accountAgeMonths as number | undefined,
      planTier: context?.planTier as string | undefined,
      userCount: context?.userCount as number | undefined,
      metadata: context,
    };

    // Call the real churn risk chain
    const chain = getChurnRiskChain();
    const result = await chain.predictChurnRisk(churnInput);

    return {
      prediction: {
        value: result.riskScore,
        confidence: result.confidence,
        explanation: result.explanation,
      },
      recommendations: result.recommendations,
    };
  } catch (error) {
    logger.error(
      {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Churn risk prediction failed, using fallback'
    );

    // Return a safe fallback with low confidence
    return {
      prediction: {
        value: 0.5, // Medium risk as fallback
        confidence: 0.3, // Low confidence indicates unreliable result
        explanation: `Churn risk analysis encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Defaulting to medium risk.`,
      },
      recommendations: [
        'Manual review recommended due to analysis error',
        'Schedule customer health check',
        'Review recent interaction history',
      ],
    };
  }
}

/**
 * Process next best action using NextBestActionAgent
 *
 * @param entityType - Type of entity (lead, contact, opportunity)
 * @param entityId - UUID of the entity
 * @param context - Optional context data with entity details and recent communications
 * @returns Prediction result with recommended action and additional recommendations
 */
async function processNextBestAction(
  entityType: string,
  entityId: string,
  context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  logger.info({ entityType, entityId }, 'Processing next best action with real AI agent');

  // IFC-095 P1: Enforce mandatory tenant context - security fix
  const tenantId = context?.tenantId as string;
  if (!tenantId) {
    logger.error({ entityId }, 'Missing tenantId - tenant isolation violated');
    throw new Error('tenantId is required for prediction jobs - tenant isolation enforced');
  }

  const userId = context?.userId as string;
  if (!userId) {
    logger.error({ entityId }, 'Missing userId - user context required');
    throw new Error('userId is required for prediction jobs');
  }

  try {
    // Build context for NBA agent
    const nbaContext: NBAContext = {
      entityType: entityType as NBAContext['entityType'],
      entityId,
      tenantId,
      userId,
      name: context?.name as string | undefined,
      email: context?.email as string | undefined,
      company: context?.company as string | undefined,
      title: context?.title as string | undefined,
      score: context?.score as number | undefined,
      stage: context?.stage as string | undefined,
      value: context?.value as number | undefined,
      lastContactDate: context?.lastContactDate as string | undefined,
      totalInteractions: context?.totalInteractions as number | undefined,
      daysSinceLastContact: context?.daysSinceLastContact as number | undefined,
      recentMessages: context?.recentMessages as NBAContext['recentMessages'],
      urgencyOverride: context?.urgencyOverride as NBAContext['urgencyOverride'],
      excludeActions: context?.excludeActions as NBAContext['excludeActions'],
    };

    // Call the real NBA agent
    const agent = createNBAAgent();
    const result = await agent.execute({
      id: `nba-job-${entityId}`,
      description: `Generate NBA for ${entityType} ${entityId}`,
      input: nbaContext,
      expectedOutput: z.any(), // Use the agent's internal schema
    });

    if (!result.success || !result.output) {
      throw new Error(result.error || 'NBA agent returned no output');
    }

    // Extract top recommendation
    const topRecommendation = result.output.recommendations[0];

    return {
      prediction: {
        value: topRecommendation?.action || 'FOLLOW_UP',
        confidence: topRecommendation?.confidence || result.confidence,
        explanation: topRecommendation?.description || result.output.entitySummary,
      },
      recommendations: result.output.recommendations.map(
        (rec: { title: string; description: string }) => `${rec.title}: ${rec.description}`
      ),
    };
  } catch (error) {
    logger.error(
      {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Next best action prediction failed, using fallback'
    );

    // Return a safe fallback with low confidence
    return {
      prediction: {
        value: 'FOLLOW_UP',
        confidence: 0.3,
        explanation: `NBA analysis encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Recommending standard follow-up.`,
      },
      recommendations: [
        'Manual review recommended due to analysis error',
        'Consider scheduling a check-in call',
        'Review entity history before taking action',
      ],
    };
  }
}

/**
 * Process qualification using LeadScoringChain
 *
 * @param entityType - Type of entity (primarily lead)
 * @param entityId - UUID of the entity
 * @param context - Optional context data with lead information
 * @returns Prediction result with qualification status and recommendations
 */
async function processQualification(
  entityType: string,
  entityId: string,
  context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  logger.info({ entityType, entityId }, 'Processing qualification with real AI chain');

  try {
    // Build input for lead scoring chain
    const leadInput: LeadInput = {
      email: (context?.email as string) || `${entityId}@unknown.example`,
      firstName: context?.firstName as string | undefined,
      lastName: context?.lastName as string | undefined,
      company: context?.company as string | undefined,
      title: context?.title as string | undefined,
      phone: context?.phone as string | undefined,
      source: (context?.source as string) || 'unknown',
      metadata: context,
    };

    // Call the real lead scoring chain
    const chain = getLeadScoringChain();
    const result = await chain.scoreLead(leadInput);

    // Determine qualification status based on score
    let qualificationStatus: string;
    let recommendations: string[];

    if (result.score >= 80) {
      qualificationStatus = 'HIGHLY_QUALIFIED';
      recommendations = [
        'Prioritize for immediate sales outreach',
        'Schedule discovery call within 24 hours',
        'Prepare personalized proposal',
        'Assign to senior sales representative',
      ];
    } else if (result.score >= 60) {
      qualificationStatus = 'QUALIFIED';
      recommendations = [
        'Add to active pipeline',
        'Schedule discovery call within 48 hours',
        'Send product information package',
        'Assign to sales representative',
      ];
    } else if (result.score >= 40) {
      qualificationStatus = 'NURTURE';
      recommendations = [
        'Add to nurture campaign',
        'Send educational content series',
        'Schedule follow-up in 2 weeks',
        'Monitor engagement signals',
      ];
    } else if (result.score >= 20) {
      qualificationStatus = 'DEVELOPING';
      recommendations = [
        'Add to awareness campaign',
        'Provide self-service resources',
        'Re-evaluate in 30 days',
        'Track website engagement',
      ];
    } else {
      qualificationStatus = 'NOT_QUALIFIED';
      recommendations = [
        'Archive for future reference',
        'Add to long-term nurture list',
        'Consider for different product/segment',
        'Re-evaluate if engagement increases',
      ];
    }

    // Add factor-based recommendations
    const factorRecommendations = result.factors
      .filter((f) => f.impact < 0)
      .map((f) => `Improve: ${f.name} - ${f.reasoning}`);

    return {
      prediction: {
        value: qualificationStatus,
        confidence: result.confidence,
        explanation: `Lead score: ${result.score}/100. ${result.factors.map((f) => f.reasoning).join(' ')}`,
      },
      recommendations: [...recommendations, ...factorRecommendations].slice(0, 5),
    };
  } catch (error) {
    logger.error(
      {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Qualification prediction failed, using fallback'
    );

    // Return a safe fallback with low confidence
    return {
      prediction: {
        value: 'NEEDS_REVIEW',
        confidence: 0.3,
        explanation: `Qualification analysis encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Manual review recommended.`,
      },
      recommendations: [
        'Manual qualification review required',
        'Verify lead data completeness',
        'Check for missing contact information',
        'Re-run qualification after data enrichment',
      ],
    };
  }
}

// ============================================================================
// Job Options
// ============================================================================

/** Default job options for prediction jobs */
export const DEFAULT_PREDICTION_JOB_OPTIONS = {
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
