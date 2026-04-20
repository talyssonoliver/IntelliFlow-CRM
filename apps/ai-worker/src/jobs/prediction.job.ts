/**
 * Prediction Job Handler (IFC-095, IFC-168)
 *
 * BullMQ job handler for processing AI prediction requests
 * (churn risk, next best action, qualification).
 *
 * Integrates with real AI chains instead of returning mock values:
 * - processChurnRisk: Uses ChurnRiskChain
 * - processNextBestAction: Uses NextBestActionAgent
 * - processQualification: Uses LeadQualificationAgent (M15: was LeadScoringChain)
 *
 * @module ai-worker/jobs/prediction
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';

// AI Chain imports (IFC-095)
import { ChurnRiskChain, type ChurnRiskInput } from '../chains/churn-risk.chain';
import { createNBAAgent, type NBAContext } from '../agents/next-best-action.agent';
// M15: qualification now routes to LeadQualificationAgent instead of LeadScoringChain
import {
  createQualificationTask,
  qualificationAgent,
  type QualificationInput,
} from '../agents/qualification.agent';
// M3: Import pre-wired ragContextChain singleton so NBA agent uses the RetrievalService
// wired at startup instead of spawning a new disconnected chain instance.
import { ragContextChain } from '../chains/rag-context.chain';
// Fix #14: hallucination checker
import { hallucinationChecker } from '../monitoring/hallucination-checker';
// Fix #20: conversation record audit logging
import { logConversationRecord } from '../utils/conversation-record-logger';
// Fix #15: human review threshold check
import { requiresHumanReview } from '@intelliflow/domain';
// H4: AI_AGENT audit entries
import { logAIAgentAction } from '../utils/audit-log';
// H9/H10: circuit breaker + fallbacks
import { getLLMBreaker } from '../lib/llm-factory';
import { runWithLogContext, getCurrentLogContext } from '@intelliflow/observability';
import { isAiFeatureEnabled } from '../lib/feature-flags';

const logger = pino({
  name: 'prediction-job',
  level: process.env.LOG_LEVEL || 'info',
  mixin: () => getCurrentLogContext() ?? {},
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
  entityId: z.uuid(),
  predictionType: z.enum(PredictionTypes),
  // H5/M8 — tenantId is a top-level required field (was previously buried in
  // untyped context). Enqueue sites MUST pass it; Zod rejects missing/empty
  // with the same message regardless of which failure mode triggered.
  tenantId: z
    .string({
      error: () => 'tenantId is required for prediction jobs - tenant isolation enforced',
    })
    .min(1, 'tenantId is required for prediction jobs - tenant isolation enforced'),
  context: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type PredictionJobData = z.infer<typeof PredictionJobDataSchema>;

/** Schema for prediction job result */
export const PredictionJobResultSchema = z.object({
  entityType: z.string(),
  entityId: z.uuid(),
  predictionType: z.string(),
  prediction: z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    confidence: z.number().min(0).max(1),
    explanation: z.string(),
  }),
  recommendations: z.array(z.string()),
  processedAt: z.iso.datetime(),
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
export async function processPredictionJob(
  job: Job<PredictionJobData>
): Promise<PredictionJobResult> {
  const validatedData = PredictionJobDataSchema.parse(job.data);
  const { tenantId } = validatedData;

  return runWithLogContext(
    {
      correlationId: validatedData.correlationId ?? job.id ?? undefined,
      tenantId,
      userId: undefined,
    },
    async () => {
      const startTime = Date.now();
      const { entityType, entityId, predictionType, context } = validatedData;

      // Feature-flag gate — checked after Zod validation, before LLM work
      if (!isAiFeatureEnabled('ai.prediction.enabled', tenantId)) {
        logger.info(
          { jobId: job.id, tenantId, entityId, predictionType },
          'AI prediction job skipped — feature flag disabled'
        );
        return { skipped: true, reason: 'feature-flag-disabled' } as unknown as PredictionJobResult;
      }

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
          ({ prediction, recommendations } = await processChurnRisk(
            job,
            entityType,
            entityId,
            tenantId,
            context
          ));
          break;
        case 'NEXT_BEST_ACTION':
          ({ prediction, recommendations } = await processNextBestAction(
            job,
            entityType,
            entityId,
            tenantId,
            context
          ));
          break;
        case 'QUALIFICATION':
          ({ prediction, recommendations } = await processQualification(
            job,
            entityType,
            entityId,
            tenantId,
            context
          ));
          break;
        default:
          throw new Error(`Unknown prediction type: ${predictionType}`);
      }

      await job.updateProgress(90);

      // Persist prediction results to entity insight tables
      await persistPredictionResult(
        entityType,
        entityId,
        tenantId,
        predictionType,
        prediction,
        recommendations
      );

      // Notify on high churn risk (non-blocking)
      if (predictionType === 'CHURN_RISK') {
        await notifyHighChurnRisk(tenantId, entityType, entityId, prediction, context);
      }

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
  );
}

// ============================================================================
// Prediction Result Persistence
// ============================================================================

/** Map a numeric churn score to a risk level string. */
function churnRiskLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.4) return 'MEDIUM';
  return 'LOW';
}

/** Build the update payload for a prediction type. */
function buildPredictionUpdateData(
  predictionType: string,
  prediction: PredictionJobResult['prediction'],
  recommendations: string[]
): Record<string, unknown> {
  const updateData: Record<string, unknown> = { recommendations };

  if (predictionType === 'CHURN_RISK') {
    const score = typeof prediction.value === 'number' ? prediction.value : 0.5;
    updateData.churnRisk = churnRiskLevel(score);
    updateData.nextBestAction = recommendations[0] || 'Review churn risk assessment';
  } else if (predictionType === 'QUALIFICATION') {
    const status = typeof prediction.value === 'string' ? prediction.value : 'NEEDS_REVIEW';
    updateData.nextBestAction = recommendations[0] || `Qualification: ${status}`;
  } else if (predictionType === 'NEXT_BEST_ACTION') {
    updateData.nextBestAction =
      typeof prediction.value === 'string' ? prediction.value : recommendations[0] || 'Follow up';
  }

  return updateData;
}

/** Persist prediction to LeadAIInsight table. */
async function persistLeadPrediction(
  prisma: any,
  entityId: string,
  tenantId: string,
  predictionType: string,
  prediction: PredictionJobResult['prediction'],
  recommendations: string[]
): Promise<void> {
  const updateData = buildPredictionUpdateData(predictionType, prediction, recommendations);

  await prisma.leadAIInsight.upsert({
    where: { leadId_tenantId: { leadId: entityId, tenantId } },
    create: {
      leadId: entityId,
      tenantId,
      engagementScore: 50,
      conversionProbability: 50,
      estimatedValue: 0,
      churnRisk: ((updateData.churnRisk as string) || 'MEDIUM') as any,
      nextBestAction: (updateData.nextBestAction as string) || 'Review prediction results',
      sentiment: 'NEUTRAL',
      sentimentTrend: 'stable',
      recommendations,
      lastEngagementDays: 0,
      icpMatch: 'Partial Match',
    },
    update: updateData,
  });

  logger.info({ entityId, predictionType }, 'Persisted prediction to LeadAIInsight');
}

/** Persist prediction to ContactAIInsight table. */
async function persistContactPrediction(
  prisma: any,
  entityId: string,
  tenantId: string,
  predictionType: string,
  prediction: PredictionJobResult['prediction'],
  recommendations: string[]
): Promise<void> {
  const updateData = buildPredictionUpdateData(predictionType, prediction, recommendations);

  await prisma.contactAIInsight.upsert({
    where: { contactId: entityId },
    create: {
      contactId: entityId,
      tenantId,
      engagementScore: 50,
      conversionProbability: 50,
      lifetimeValue: 0,
      churnRisk: ((updateData.churnRisk as string) || 'MEDIUM') as any,
      nextBestAction: (updateData.nextBestAction as string) || 'Review prediction results',
      sentiment: 'NEUTRAL',
      sentimentTrend: 'stable',
      recommendations,
      lastEngagementDays: 0,
    },
    update: updateData,
  });

  logger.info({ entityId, predictionType }, 'Persisted prediction to ContactAIInsight');
}

/**
 * Persist prediction results to entity-level insight tables.
 * Uses the same LeadAIInsight / ContactAIInsight tables as the insight job,
 * closing the loop so entity 360 pages show prediction data.
 */
async function persistPredictionResult(
  entityType: string,
  entityId: string,
  tenantId: string,
  predictionType: string,
  prediction: PredictionJobResult['prediction'],
  recommendations: string[]
): Promise<void> {
  try {
    const { prisma } = await import('@intelliflow/db');

    if (entityType === 'lead') {
      await persistLeadPrediction(
        prisma,
        entityId,
        tenantId,
        predictionType,
        prediction,
        recommendations
      );
    } else if (entityType === 'contact') {
      await persistContactPrediction(
        prisma,
        entityId,
        tenantId,
        predictionType,
        prediction,
        recommendations
      );
    } else {
      logger.info(
        { entityType, entityId, predictionType },
        'Prediction persistence skipped — no AI insight table for this entity type'
      );
      return; // no DB write — skip audit entry
    }

    // H4: emit AI_AGENT audit entry after successful DB write — non-fatal
    const resourceType = entityType === 'lead' ? 'LeadAIInsight' : 'ContactAIInsight';
    await logAIAgentAction({
      tenantId,
      agentName: 'prediction-job',
      resourceType,
      resourceId: entityId,
      action: 'UPSERT',
    }).catch((err: unknown) => {
      logger.warn({ entityId, entityType, err }, 'audit-log: logAIAgentAction failed (non-fatal)');
    });
  } catch (error) {
    logger.error(
      {
        entityType,
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to persist prediction result to DB'
    );
  }
}

// ============================================================================
// Churn Risk Notification
// ============================================================================

/** Create an in-app notification when churn risk is high. Non-blocking. */
async function notifyHighChurnRisk(
  tenantId: string,
  entityType: string,
  entityId: string,
  prediction: PredictionJobResult['prediction'],
  context?: Record<string, unknown>
): Promise<void> {
  if (prediction.confidence < 0.7) return;

  const riskLevel =
    typeof prediction.value === 'string' ? prediction.value : String(prediction.value);
  const isHighRisk =
    riskLevel === 'HIGH' ||
    riskLevel === 'CRITICAL' ||
    (typeof prediction.value === 'number' && prediction.value >= 0.7);
  if (!isHighRisk) return;

  const recipientId = context?.userId as string;
  if (!recipientId) return;

  try {
    const { prisma } = await import('@intelliflow/db');
    await prisma.notification.create({
      data: {
        tenantId,
        recipientId,
        channel: 'IN_APP',
        subject: `High churn risk: ${entityType} ${entityId}`,
        body: prediction.explanation || 'High churn risk detected — review and take action.',
        priority: 'HIGH',
        status: 'PENDING',
        category: 'ALERTS',
        sourceType: 'ai_recommendation',
        sourceId: entityId,
        metadata: {
          notificationType: 'ai_recommendation',
          predictionType: 'CHURN_RISK',
          confidence: prediction.confidence,
          riskLevel,
          actionUrl: `/${entityType}s/${entityId}`,
        },
      },
    });
  } catch {
    // Non-blocking — notification failure should not affect prediction pipeline
  }
}

// ============================================================================
// LLM Timeout Constant + Heuristic Fallbacks (H10)
// ============================================================================

/** LLM inference timeout for prediction handlers (120 s — mirrors insight job). */
const PREDICTION_LLM_TIMEOUT_MS = 120_000;

/**
 * Neutral fallback for CHURN_RISK when LLM is unavailable.
 * risk_score = 0.5 (unknown), confidence = 0.3, pure static — no LLM dependency.
 */
function churnRiskFallback(): {
  prediction: PredictionJobResult['prediction'];
  recommendations: string[];
} {
  return {
    prediction: {
      value: 0.5,
      confidence: 0.3,
      explanation: 'Heuristic fallback — LLM unavailable. Risk unknown; manual review recommended.',
    },
    recommendations: [
      'Review account activity manually',
      'Contact customer success team',
      'Check recent support tickets',
    ],
  };
}

/**
 * Neutral fallback for NEXT_BEST_ACTION when LLM is unavailable.
 * Low-priority generic recommendations — no LLM dependency.
 */
function nextBestActionFallback(): {
  prediction: PredictionJobResult['prediction'];
  recommendations: string[];
} {
  return {
    prediction: {
      value: 'FOLLOW_UP',
      confidence: 0.3,
      explanation: 'Heuristic fallback — LLM unavailable. Generic follow-up recommended.',
    },
    recommendations: ['Contact lead', 'Update contact information'],
  };
}

/**
 * Neutral fallback for QUALIFICATION when LLM is unavailable.
 * Returns NOT_QUALIFIED with low confidence — no LLM dependency.
 */
function qualificationFallback(): {
  prediction: PredictionJobResult['prediction'];
  recommendations: string[];
} {
  return {
    prediction: {
      value: 'NOT_QUALIFIED',
      confidence: 0.3,
      explanation:
        'Heuristic fallback — LLM unavailable. Qualification status unknown; manual review required.',
    },
    recommendations: [
      'Review lead manually',
      'Gather additional information',
      'Re-evaluate when LLM is available',
    ],
  };
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
  job: Job<PredictionJobData>,
  entityType: string,
  entityId: string,
  tenantId: string,
  context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  logger.info({ entityType, entityId, tenantId }, 'Processing churn risk with real AI chain');

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

    // Call the real churn risk chain (with timeout + circuit breaker)
    // Construct per-job instance with tenantId so versioned configs are resolved
    const llmStartTime = Date.now();
    const chain = new ChurnRiskChain({ tenantId });
    const churnBreaker = getLLMBreaker('scoring', 'free');
    await job.extendLock(job.token!, 300_000); // 5 minutes — prevent stall detection during LLM call
    const result = await Promise.race([
      churnBreaker.execute(() => chain.predictChurnRisk(churnInput)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM churn risk timed out after ${PREDICTION_LLM_TIMEOUT_MS}ms`)),
          PREDICTION_LLM_TIMEOUT_MS
        )
      ),
    ]);
    const llmDuration = Date.now() - llmStartTime;

    // Fix #20: log conversation record for audit trail
    logConversationRecord(logger, {
      conversationId: `churn-${entityId}-${Date.now()}`,
      model: result.modelVersion,
      tokenCountInput: result.tokenCount ?? 0,
      tokenCountOutput: 0,
      duration: llmDuration,
      chainType: 'CHURN_PREDICTION',
      tenantId,
    });

    // Fix #14: hallucination check — log warning if detected, do NOT block output
    const hallucinationResult = await hallucinationChecker.checkOutput({
      id: `churn-${entityId}`,
      model: result.modelVersion,
      inputContext: JSON.stringify(churnInput).slice(0, 500),
      output: result.explanation,
    });

    if (hallucinationResult.hallucinated) {
      logger.warn(
        {
          entityId,
          hallucinationScore: hallucinationResult.score,
          hallucinationTypes: hallucinationResult.hallucinationTypes,
        },
        'Hallucination detected in churn risk output — output not blocked, flagged for monitoring'
      );
    }

    // Fix #15: log if output requires human review
    const needsReview = requiresHumanReview(result.confidence, 'CHURN_PREDICTION');
    if (needsReview) {
      logger.info(
        { entityId, confidence: result.confidence },
        'Churn risk output is pending human review due to low confidence'
      );
    }

    return {
      prediction: {
        value: result.riskScore,
        confidence: result.confidence,
        explanation: result.explanation,
      },
      recommendations: result.recommendations,
    };
  } catch (error) {
    logger.warn(
      {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Churn risk prediction failed or timed out — using heuristic fallback'
    );
    return churnRiskFallback();
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
  job: Job<PredictionJobData>,
  entityType: string,
  entityId: string,
  tenantId: string,
  context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  logger.info({ entityType, entityId, tenantId }, 'Processing next best action with real AI agent');

  // userId is still passed via context; NBA requires it per IFC-095 P1
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

    // Enrich with existing AI insight data if entity is a lead
    if (entityType === 'lead') {
      try {
        const { prisma: rawPrisma } = await import('@intelliflow/db');
        const prisma = rawPrisma as unknown as import('@intelliflow/db').PrismaClient;
        const existingInsight = await prisma.leadAIInsight.findUnique({
          where: { leadId_tenantId: { leadId: entityId, tenantId } },
          select: {
            engagementScore: true,
            conversionProbability: true,
            churnRisk: true,
            sentiment: true,
            sentimentTrend: true,
            recommendations: true,
            lastEngagementDays: true,
            icpMatch: true,
          },
        });
        if (existingInsight) {
          nbaContext.score = existingInsight.engagementScore ?? nbaContext.score;
          nbaContext.urgencyOverride =
            nbaContext.urgencyOverride ??
            (existingInsight.churnRisk === 'HIGH' ? 'HIGH' : undefined);
        }
      } catch {
        // Non-blocking — proceed without enrichment
      }
    }

    // Call the real NBA agent (with timeout + circuit breaker)
    // M3: Pass the globally wired ragContextChain so the agent uses the
    // RetrievalService connected at startup rather than a new null-service instance.
    const agent = createNBAAgent(ragContextChain);
    const nbaBreaker = getLLMBreaker('reasoning', 'standard');
    await job.extendLock(job.token!, 300_000); // 5 minutes — prevent stall detection during agent execution
    const result = await Promise.race([
      nbaBreaker.execute(() =>
        agent.execute({
          id: `nba-job-${entityId}`,
          description: `Generate NBA for ${entityType} ${entityId}`,
          input: nbaContext,
          expectedOutput: z.any(), // Use the agent's internal schema
        })
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`NBA agent timed out after ${PREDICTION_LLM_TIMEOUT_MS}ms`)),
          PREDICTION_LLM_TIMEOUT_MS
        )
      ),
    ]);

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
    logger.warn(
      {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Next best action prediction failed or timed out — using heuristic fallback'
    );
    return nextBestActionFallback();
  }
}

/**
 * Process qualification using LeadQualificationAgent (M15 reroute).
 *
 * Previously used LeadScoringChain which returns a 0–100 numeric score and
 * required manual threshold logic to derive a status string. The agent uses
 * withStructuredOutput(qualificationOutputSchema) and returns explicit
 * qualificationLevel + recommendedActions, making the mapping direct and
 * domain-semantics-aware.
 *
 * Output mapping: agent → PredictionResult
 *   value        ← qualificationLevel   ('HIGH' | 'MEDIUM' | 'LOW' | 'UNQUALIFIED')
 *   confidence   ← calculateConfidence() applied inside agent.execute()
 *   explanation  ← output.reasoning
 *   recommendations ← output.nextSteps (+ action strings from recommendedActions)
 *
 * @param entityType - Type of entity (primarily lead)
 * @param entityId - UUID of the entity
 * @param context - Optional context data with lead information
 * @returns Prediction result with qualification level and recommendations
 */
async function processQualification(
  job: Job<PredictionJobData>,
  entityType: string,
  entityId: string,
  tenantId: string,
  context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  logger.info(
    { entityType, entityId, tenantId },
    'Processing qualification with LeadQualificationAgent'
  );

  try {
    // Build typed input for the qualification agent
    const qualInput: QualificationInput = {
      leadId: entityId,
      email: (context?.email as string) || `${entityId}@unknown.example`,
      firstName: context?.firstName as string | undefined,
      lastName: context?.lastName as string | undefined,
      company: context?.company as string | undefined,
      title: context?.title as string | undefined,
      phone: context?.phone as string | undefined,
      source: (context?.source as string) || 'unknown',
      score: context?.score as number | undefined,
      recentActivities: context?.recentActivities as string[] | undefined,
      companyData: context?.companyData as QualificationInput['companyData'],
    };

    const task = createQualificationTask(qualInput, {
      userId: context?.userId as string | undefined,
    });

    const qualBreaker = getLLMBreaker('qualification', 'free');
    await job.extendLock(job.token!, 300_000); // 5 minutes — prevent stall detection during agent execution
    const result = await Promise.race([
      qualBreaker.execute(() => qualificationAgent.execute(task)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`LeadQualificationAgent timed out after ${PREDICTION_LLM_TIMEOUT_MS}ms`)
            ),
          PREDICTION_LLM_TIMEOUT_MS
        )
      ),
    ]);

    if (!result.success || !result.output) {
      throw new Error(result.error || 'LeadQualificationAgent returned no output');
    }

    const output = result.output;

    // Hallucination check on the reasoning text — non-blocking, mirrors churn path
    const hallucinationResult = await hallucinationChecker.checkOutput({
      id: `qual-${entityId}`,
      model: 'qualification-agent',
      inputContext: JSON.stringify(qualInput).slice(0, 500),
      output: output.reasoning,
    });

    if (hallucinationResult.hallucinated) {
      logger.warn(
        {
          entityId,
          hallucinationScore: hallucinationResult.score,
          hallucinationTypes: hallucinationResult.hallucinationTypes,
        },
        'Hallucination detected in qualification output — output not blocked, flagged for monitoring'
      );
    }

    // Human-review threshold check — mirrors churn path
    // 'LEAD_SCORING' is the closest AIChainType for qualification (domain enum lacks 'QUALIFICATION').
    const needsReview = requiresHumanReview(result.confidence, 'LEAD_SCORING');
    if (needsReview) {
      logger.info(
        { entityId, confidence: result.confidence },
        'Qualification output is pending human review due to low confidence'
      );
    }

    // Map qualificationLevel → a value string the job consumer understands.
    // The agent returns 'HIGH' | 'MEDIUM' | 'LOW' | 'UNQUALIFIED'.
    // We translate to match the status vocabulary used by the scoring-chain path
    // so downstream (persistPredictionResult → buildPredictionUpdateData) is unchanged.
    const levelToStatus: Record<string, string> = {
      HIGH: 'HIGHLY_QUALIFIED',
      MEDIUM: 'QUALIFIED',
      LOW: 'NURTURE',
      UNQUALIFIED: 'NOT_QUALIFIED',
    };
    const qualificationStatus = levelToStatus[output.qualificationLevel] ?? 'NOT_QUALIFIED';

    // Build flat recommendation strings from agent's structured action list + nextSteps
    const actionStrings = output.recommendedActions.map(
      (a: { priority: string; action: string }) => `[${a.priority}] ${a.action}`
    );
    const allRecommendations = [...output.nextSteps, ...actionStrings].slice(0, 5);

    // Audit log — mirrors NBA path, non-fatal
    const { logAIAgentAction } = await import('../utils/audit-log.js');
    await logAIAgentAction({
      tenantId,
      agentName: 'LeadQualificationAgent',
      resourceType: 'Lead',
      resourceId: entityId,
      action: 'UPDATE',
    }).catch((err: unknown) => {
      logger.warn(
        { entityId, err },
        'audit-log: logAIAgentAction (qualification) failed (non-fatal)'
      );
    });

    return {
      prediction: {
        value: qualificationStatus,
        confidence: result.confidence,
        explanation: output.reasoning,
      },
      recommendations: allRecommendations,
    };
  } catch (error) {
    logger.warn(
      {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Qualification prediction failed or timed out — using heuristic fallback'
    );
    return qualificationFallback();
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
