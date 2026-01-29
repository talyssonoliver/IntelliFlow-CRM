/**
 * Prediction Job Handler
 *
 * BullMQ job handler for processing AI prediction requests
 * (churn risk, next best action, etc.)
 *
 * @module ai-worker/jobs/prediction
 * @task IFC-168
 */

import type { Job } from 'bullmq';
import { z } from 'zod';

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

  return jobResult;
}

// ============================================================================
// Prediction Handlers (to be implemented with real AI chains)
// ============================================================================

async function processChurnRisk(
  _entityType: string,
  _entityId: string,
  _context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  // TODO: Implement with real churn risk chain (IFC-095)
  // For now, return mock result
  return {
    prediction: {
      value: 0.35,
      confidence: 0.85,
      explanation: 'Based on engagement patterns and activity history',
    },
    recommendations: [
      'Schedule a check-in call',
      'Send personalized value proposition',
      'Review recent support tickets',
    ],
  };
}

async function processNextBestAction(
  _entityType: string,
  _entityId: string,
  _context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  // TODO: Implement with real NBA chain
  return {
    prediction: {
      value: 'FOLLOW_UP_CALL',
      confidence: 0.78,
      explanation: 'High engagement detected, opportunity for upsell',
    },
    recommendations: [
      'Call within 48 hours',
      'Prepare ROI case study',
      'Discuss expansion options',
    ],
  };
}

async function processQualification(
  _entityType: string,
  _entityId: string,
  _context?: Record<string, unknown>
): Promise<{ prediction: PredictionJobResult['prediction']; recommendations: string[] }> {
  // TODO: Integrate with qualification agent
  return {
    prediction: {
      value: 'QUALIFIED',
      confidence: 0.82,
      explanation: 'Meets BANT criteria based on available data',
    },
    recommendations: [
      'Schedule discovery call',
      'Send pricing information',
      'Assign to sales rep',
    ],
  };
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
