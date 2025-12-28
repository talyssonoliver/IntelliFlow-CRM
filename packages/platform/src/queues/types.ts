/**
 * BullMQ Queue Types for IntelliFlow CRM
 *
 * Defines type-safe job data structures and queue configurations
 * for async job processing (AI scoring, notifications, etc.)
 */

import { z } from 'zod';

// ============================================================================
// Job Data Schemas
// ============================================================================

/**
 * AI Lead Scoring Job Data
 */
export const aiScoringJobDataSchema = z.object({
  leadId: z.string().uuid(),
  userId: z.string().uuid(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  metadata: z
    .object({
      source: z.string().optional(),
      requestedAt: z.string().datetime(),
      retryCount: z.number().int().min(0).default(0),
    })
    .optional(),
});

export type AIScoringJobData = z.infer<typeof aiScoringJobDataSchema>;

/**
 * AI Scoring Result
 */
export const aiScoringResultSchema = z.object({
  leadId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  factors: z.record(z.string(), z.number()),
  modelVersion: z.string(),
  processingTimeMs: z.number(),
  scoredAt: z.string().datetime(),
});

export type AIScoringResult = z.infer<typeof aiScoringResultSchema>;

/**
 * Email Notification Job Data
 */
export const emailNotificationJobDataSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  template: z.string(),
  data: z.record(z.string(), z.unknown()),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export type EmailNotificationJobData = z.infer<typeof emailNotificationJobDataSchema>;

/**
 * Webhook Delivery Job Data
 */
export const webhookDeliveryJobDataSchema = z.object({
  url: z.string().url(),
  payload: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.string()).optional(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  timeout: z.number().int().min(1000).max(30000).default(10000),
});

export type WebhookDeliveryJobData = z.infer<typeof webhookDeliveryJobDataSchema>;

// ============================================================================
// Queue Configuration Types
// ============================================================================

/**
 * Retry backoff configuration
 */
export interface RetryBackoffConfig {
  /** Backoff strategy: 'fixed' or 'exponential' */
  type: 'fixed' | 'exponential';
  /** Base delay in milliseconds */
  delay: number;
  /** Maximum delay in milliseconds (for exponential backoff) */
  maxDelay?: number;
  /** Jitter factor (0-1) to add randomness to delays */
  jitter?: number;
}

/**
 * Queue-level configuration
 */
export interface QueueConfig {
  /** Queue name */
  name: string;
  /** Default job options */
  defaultJobOptions: {
    /** Maximum number of retry attempts */
    attempts: number;
    /** Backoff configuration */
    backoff: RetryBackoffConfig;
    /** Remove completed jobs after this many milliseconds */
    removeOnComplete: number | boolean;
    /** Remove failed jobs after this many milliseconds */
    removeOnFail: number | boolean;
  };
  /** Rate limiting configuration */
  rateLimiter?: {
    /** Maximum jobs per duration */
    max: number;
    /** Duration in milliseconds */
    duration: number;
  };
  /** Concurrency - number of parallel workers */
  concurrency: number;
}

/**
 * Job metrics snapshot
 */
export interface JobMetrics {
  queueName: string;
  timestamp: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  processingRates: {
    completedPerMinute: number;
    failedPerMinute: number;
  };
  latency: {
    averageWaitTimeMs: number;
    averageProcessTimeMs: number;
    p95WaitTimeMs: number;
    p95ProcessTimeMs: number;
  };
}

/**
 * Job event for metrics tracking
 */
export interface JobEvent {
  jobId: string;
  queueName: string;
  eventType: 'added' | 'active' | 'completed' | 'failed' | 'stalled' | 'progress';
  timestamp: string;
  duration?: number;
  error?: string;
  returnValue?: unknown;
}

// ============================================================================
// Queue Names (Constants)
// ============================================================================

export const QUEUE_NAMES = {
  AI_SCORING: 'intelliflow:ai-scoring',
  EMAIL_NOTIFICATIONS: 'intelliflow:email-notifications',
  WEBHOOK_DELIVERY: 'intelliflow:webhook-delivery',
  DATA_SYNC: 'intelliflow:data-sync',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_QUEUE_CONFIGS: Record<string, QueueConfig> = {
  [QUEUE_NAMES.AI_SCORING]: {
    name: QUEUE_NAMES.AI_SCORING,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
        maxDelay: 60000,
        jitter: 0.1,
      },
      removeOnComplete: 86400000, // 24 hours
      removeOnFail: 604800000, // 7 days
    },
    rateLimiter: {
      max: 100,
      duration: 60000, // 100 jobs per minute
    },
    concurrency: 5,
  },
  [QUEUE_NAMES.EMAIL_NOTIFICATIONS]: {
    name: QUEUE_NAMES.EMAIL_NOTIFICATIONS,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
        maxDelay: 30000,
      },
      removeOnComplete: 3600000, // 1 hour
      removeOnFail: 259200000, // 3 days
    },
    rateLimiter: {
      max: 50,
      duration: 60000, // 50 emails per minute
    },
    concurrency: 3,
  },
  [QUEUE_NAMES.WEBHOOK_DELIVERY]: {
    name: QUEUE_NAMES.WEBHOOK_DELIVERY,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
        maxDelay: 300000, // 5 minutes max
        jitter: 0.2,
      },
      removeOnComplete: 86400000, // 24 hours
      removeOnFail: 604800000, // 7 days
    },
    concurrency: 10,
  },
};
