/**
 * Feedback Analytics Job Handler
 *
 * BullMQ cron job that runs daily at 02:00 UTC on the `ai-feedback-analytics`
 * queue.  It delegates to `runFeedbackAnalytics()` — the pure function
 * extracted from the original offline script — and writes an
 * AIMonitoringEvent with eventType `retraining_trigger` whenever a threshold
 * is breached (ADR-043 pipeline).
 *
 * Prometheus counter: `intelliflow_ai_retraining_triggers_total`
 *
 * @module ai-worker/jobs/feedback-analytics
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import {
  runFeedbackAnalytics,
  type FeedbackRecord,
} from '../analytics/feedback-analytics-generator';
import { incrementRetrainingTriggers } from '../metrics/prometheus-exporter';

const logger = pino({
  name: 'feedback-analytics-job',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Constants
// ============================================================================

/** Queue name for feedback analytics cron jobs */
export const FEEDBACK_ANALYTICS_QUEUE = 'ai-feedback-analytics';

/** Daily at 02:00 UTC */
export const FEEDBACK_ANALYTICS_CRON = '0 2 * * *';

// ============================================================================
// Schemas
// ============================================================================

/** Job data — no required fields for the cron case; tenantId/periodDays optional for manual triggers */
export const FeedbackAnalyticsJobDataSchema = z.object({
  /** Optional: restrict analysis to a single tenant (omit for global sweep) */
  tenantId: z.string().uuid().optional(),
  /** Rolling window in days (default: 30) */
  periodDays: z.number().int().positive().default(30),
  /** Write result file to disk (default: false for cron; true for CLI) */
  save: z.boolean().default(false),
  correlationId: z.string().optional(),
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type FeedbackAnalyticsJobData = z.infer<typeof FeedbackAnalyticsJobDataSchema>;

export const FeedbackAnalyticsJobResultSchema = z.object({
  retrainingNeeded: z.boolean(),
  urgency: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  feedbackCount: z.number(),
  processingTimeMs: z.number(),
  processedAt: z.string(),
  monitoringEventId: z.string().optional(),
});

export type FeedbackAnalyticsJobResult = z.infer<typeof FeedbackAnalyticsJobResultSchema>;

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Process a feedback analytics cron job.
 *
 * 1. Loads FeedbackRecord rows from the DB (or uses [] when the DB is
 *    unavailable — production will always have Prisma wired).
 * 2. Delegates to `runFeedbackAnalytics()` for pure computation.
 * 3. When a retraining threshold is breached:
 *    - Writes an AIMonitoringEvent with eventType `retraining_trigger`.
 *    - Increments the Prometheus counter `intelliflow_ai_retraining_triggers_total`.
 */
export async function processFeedbackAnalyticsJob(
  job: Job<FeedbackAnalyticsJobData>
): Promise<FeedbackAnalyticsJobResult> {
  const startTime = Date.now();
  const validatedData = FeedbackAnalyticsJobDataSchema.parse(job.data);
  const { tenantId, periodDays, save } = validatedData;

  logger.info({ jobId: job.id, tenantId, periodDays }, 'Processing feedback analytics job');

  // ── Load records from DB ────────────────────────────────────────────────────
  let records: FeedbackRecord[] = [];
  let prisma: any = null;

  try {
    const db = await import('@intelliflow/db');
    prisma = db.prisma;

    const whereClause: Record<string, unknown> = tenantId ? { tenantId } : {};
    const rawRecords = await prisma.leadFeedback.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });

    records = rawRecords as FeedbackRecord[];

    logger.info({ jobId: job.id, recordCount: records.length }, 'Loaded feedback records from DB');
  } catch (dbError) {
    logger.warn(
      { jobId: job.id, error: dbError instanceof Error ? dbError.message : String(dbError) },
      'Could not load feedback records from DB — running analysis with empty dataset'
    );
  }

  await job.updateProgress(30);

  // ── Run analytics ───────────────────────────────────────────────────────────
  const analytics = await runFeedbackAnalytics(records, periodDays, save);

  await job.updateProgress(70);

  const { retrainingStatus } = analytics;
  const retrainingNeeded = retrainingStatus.needed;
  let monitoringEventId: string | undefined;

  // ── Persist monitoring event + increment Prometheus counter on breach ───────
  if (retrainingNeeded && prisma) {
    try {
      const event = await prisma.aIMonitoringEvent.create({
        data: {
          eventType: 'retraining_trigger',
          model: retrainingStatus.modelVersion ?? null,
          metric: 'retraining_recommendation',
          value: retrainingStatus.metrics.negativeRatio,
          flagged: true,
          severity: retrainingStatus.urgency,
          payload: {
            reasons: retrainingStatus.reasons,
            metrics: retrainingStatus.metrics,
            recommendation: retrainingStatus.recommendation,
            correlationId: validatedData.correlationId,
          },
          tenantId: tenantId ?? null,
          recordedAt: new Date(),
        },
      });

      monitoringEventId = (event as { id: string }).id;

      logger.warn(
        {
          jobId: job.id,
          urgency: retrainingStatus.urgency,
          reasons: retrainingStatus.reasons,
          monitoringEventId,
        },
        'Retraining threshold breached — AIMonitoringEvent written'
      );
    } catch (writeError) {
      logger.error(
        {
          jobId: job.id,
          error: writeError instanceof Error ? writeError.message : String(writeError),
        },
        'Failed to write retraining_trigger AIMonitoringEvent'
      );
    }

    // Increment Prometheus counter regardless of DB write success
    incrementRetrainingTriggers({ urgency: retrainingStatus.urgency });
  }

  await job.updateProgress(100);

  const processingTimeMs = Date.now() - startTime;

  logger.info(
    {
      jobId: job.id,
      retrainingNeeded,
      urgency: retrainingStatus.urgency,
      feedbackCount: retrainingStatus.metrics.feedbackCount,
      processingTimeMs,
    },
    'Feedback analytics job completed'
  );

  return {
    retrainingNeeded,
    urgency: retrainingStatus.urgency,
    feedbackCount: retrainingStatus.metrics.feedbackCount,
    processingTimeMs,
    processedAt: new Date().toISOString(),
    monitoringEventId,
  };
}

// ============================================================================
// Job Options
// ============================================================================

/** Default job options for feedback analytics cron */
export const DEFAULT_FEEDBACK_ANALYTICS_JOB_OPTIONS = {
  attempts: 2,
  backoff: {
    type: 'exponential' as const,
    delay: 10_000,
  },
  removeOnComplete: {
    count: 30,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
  },
};
