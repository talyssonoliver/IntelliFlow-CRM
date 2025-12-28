/**
 * BullMQ Queue Infrastructure Tests
 *
 * Tests for job queue types, retry strategies, and metrics collection.
 * Note: Full queue integration tests require a running Redis instance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Types and schemas
  aiScoringJobDataSchema,
  aiScoringResultSchema,
  emailNotificationJobDataSchema,
  webhookDeliveryJobDataSchema,
  QUEUE_NAMES,
  DEFAULT_QUEUE_CONFIGS,
  // Connection
  getDefaultConnectionConfig,
  getBullMQConnectionOptions,
  // Retry strategy
  calculateBackoffDelay,
  categorizeError,
  shouldRetry,
  RetryBudgetTracker,
  ErrorCategory,
  BACKOFF_PRESETS,
  // Metrics
  JobMetricsCollector,
  AggregateMetricsCollector,
  // Bull Board
  getDashboardInfo,
  getBullBoardScreenshotDescription,
} from './index';

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Job Data Schemas', () => {
  describe('aiScoringJobDataSchema', () => {
    it('validates correct AI scoring job data', () => {
      const validData = {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        priority: 'high',
        metadata: {
          source: 'web-form',
          requestedAt: '2025-12-28T10:00:00.000Z',
          retryCount: 0,
        },
      };

      const result = aiScoringJobDataSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID for leadId', () => {
      const invalidData = {
        leadId: 'not-a-uuid',
        userId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = aiScoringJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('uses default priority when not specified', () => {
      const minimalData = {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = aiScoringJobDataSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('normal');
      }
    });
  });

  describe('aiScoringResultSchema', () => {
    it('validates correct scoring result', () => {
      const validResult = {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        score: 85,
        confidence: 0.92,
        factors: {
          engagement: 0.8,
          company_fit: 0.9,
          timing: 0.75,
        },
        modelVersion: 'v1.2.0',
        processingTimeMs: 1234,
        scoredAt: '2025-12-28T10:00:00.000Z',
      };

      const result = aiScoringResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('rejects score outside valid range', () => {
      const invalidResult = {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        score: 150, // Invalid: > 100
        confidence: 0.5,
        factors: {},
        modelVersion: 'v1.0',
        processingTimeMs: 100,
        scoredAt: '2025-12-28T10:00:00.000Z',
      };

      const result = aiScoringResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });
  });

  describe('emailNotificationJobDataSchema', () => {
    it('validates correct email notification data', () => {
      const validData = {
        to: 'test@example.com',
        subject: 'Welcome to IntelliFlow',
        template: 'welcome-email',
        data: { name: 'John Doe', companyName: 'Acme Corp' },
        priority: 'high',
      };

      const result = emailNotificationJobDataSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email address', () => {
      const invalidData = {
        to: 'not-an-email',
        subject: 'Test',
        template: 'test',
        data: {},
      };

      const result = emailNotificationJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('webhookDeliveryJobDataSchema', () => {
    it('validates correct webhook delivery data', () => {
      const validData = {
        url: 'https://api.example.com/webhooks',
        payload: { event: 'lead.scored', leadId: '123' },
        headers: { 'X-Webhook-Secret': 'secret123' },
        method: 'POST',
        timeout: 5000,
      };

      const result = webhookDeliveryJobDataSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('uses default timeout when not specified', () => {
      const minimalData = {
        url: 'https://api.example.com/webhooks',
        payload: {},
      };

      const result = webhookDeliveryJobDataSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeout).toBe(10000);
      }
    });
  });
});

// ============================================================================
// Queue Configuration Tests
// ============================================================================

describe('Queue Configuration', () => {
  describe('QUEUE_NAMES', () => {
    it('defines all required queue names', () => {
      expect(QUEUE_NAMES.AI_SCORING).toBe('intelliflow:ai-scoring');
      expect(QUEUE_NAMES.EMAIL_NOTIFICATIONS).toBe('intelliflow:email-notifications');
      expect(QUEUE_NAMES.WEBHOOK_DELIVERY).toBe('intelliflow:webhook-delivery');
    });
  });

  describe('DEFAULT_QUEUE_CONFIGS', () => {
    it('provides configuration for AI scoring queue', () => {
      const config = DEFAULT_QUEUE_CONFIGS[QUEUE_NAMES.AI_SCORING];
      expect(config).toBeDefined();
      expect(config.concurrency).toBe(5);
      expect(config.defaultJobOptions.attempts).toBe(5);
      expect(config.defaultJobOptions.backoff.type).toBe('exponential');
    });

    it('provides rate limiting for email notifications', () => {
      const config = DEFAULT_QUEUE_CONFIGS[QUEUE_NAMES.EMAIL_NOTIFICATIONS];
      expect(config.rateLimiter).toBeDefined();
      expect(config.rateLimiter?.max).toBe(50);
      expect(config.rateLimiter?.duration).toBe(60000);
    });
  });
});

// ============================================================================
// Connection Tests
// ============================================================================

describe('Connection Configuration', () => {
  describe('getDefaultConnectionConfig', () => {
    it('returns default configuration when no env vars set', () => {
      const config = getDefaultConnectionConfig();
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(6379);
      expect(config.db).toBe(0);
    });
  });

  describe('getBullMQConnectionOptions', () => {
    it('returns BullMQ-compatible options', () => {
      const options = getBullMQConnectionOptions() as Record<string, unknown>;
      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.maxRetriesPerRequest).toBeNull(); // Required by BullMQ
    });

    it('allows custom configuration override', () => {
      const options = getBullMQConnectionOptions({
        host: 'redis.example.com',
        port: 6380,
      }) as Record<string, unknown>;
      expect(options.host).toBe('redis.example.com');
      expect(options.port).toBe(6380);
    });
  });
});

// ============================================================================
// Retry Strategy Tests
// ============================================================================

describe('Retry Strategy', () => {
  describe('calculateBackoffDelay', () => {
    it('calculates fixed delay correctly', () => {
      const config = { type: 'fixed' as const, delay: 1000 };

      expect(calculateBackoffDelay(1, config)).toBe(1000);
      expect(calculateBackoffDelay(5, config)).toBe(1000);
    });

    it('calculates exponential backoff correctly', () => {
      const config = { type: 'exponential' as const, delay: 1000 };

      expect(calculateBackoffDelay(1, config)).toBe(1000);  // 1000 * 2^0
      expect(calculateBackoffDelay(2, config)).toBe(2000);  // 1000 * 2^1
      expect(calculateBackoffDelay(3, config)).toBe(4000);  // 1000 * 2^2
      expect(calculateBackoffDelay(4, config)).toBe(8000);  // 1000 * 2^3
    });

    it('respects maximum delay cap', () => {
      const config = { type: 'exponential' as const, delay: 1000, maxDelay: 5000 };

      expect(calculateBackoffDelay(1, config)).toBe(1000);
      expect(calculateBackoffDelay(4, config)).toBe(5000); // Capped at maxDelay
      expect(calculateBackoffDelay(10, config)).toBe(5000); // Still capped
    });

    it('applies jitter within expected range', () => {
      const config = { type: 'exponential' as const, delay: 1000, jitter: 0.1 };

      // Run multiple times to check jitter is applied
      const results = Array.from({ length: 100 }, () =>
        calculateBackoffDelay(2, config)
      );

      // With 10% jitter on 2000ms, range should be ~1800-2200
      const min = Math.min(...results);
      const max = Math.max(...results);

      expect(min).toBeGreaterThanOrEqual(1800);
      expect(max).toBeLessThanOrEqual(2200);
      // Should have some variance (not all the same)
      expect(max - min).toBeGreaterThan(0);
    });
  });

  describe('categorizeError', () => {
    it('categorizes network errors as transient', () => {
      expect(categorizeError(new Error('ECONNRESET'))).toBe(ErrorCategory.TRANSIENT);
      expect(categorizeError(new Error('ECONNREFUSED'))).toBe(ErrorCategory.TRANSIENT);
      expect(categorizeError(new Error('ETIMEDOUT'))).toBe(ErrorCategory.TRANSIENT);
      expect(categorizeError(new Error('socket hang up'))).toBe(ErrorCategory.TRANSIENT);
    });

    it('categorizes rate limit errors correctly', () => {
      expect(categorizeError(new Error('Rate limit exceeded'))).toBe(ErrorCategory.RATE_LIMITED);
      expect(categorizeError(new Error('429 Too Many Requests'))).toBe(ErrorCategory.RATE_LIMITED);
    });

    it('categorizes client errors correctly', () => {
      expect(categorizeError(new Error('400 Bad Request'))).toBe(ErrorCategory.CLIENT_ERROR);
      expect(categorizeError(new Error('401 Unauthorized'))).toBe(ErrorCategory.CLIENT_ERROR);
      expect(categorizeError(new Error('404 Not Found'))).toBe(ErrorCategory.CLIENT_ERROR);
    });

    it('categorizes server errors correctly', () => {
      expect(categorizeError(new Error('500 Internal Server Error'))).toBe(ErrorCategory.SERVER_ERROR);
      expect(categorizeError(new Error('502 Bad Gateway'))).toBe(ErrorCategory.SERVER_ERROR);
      expect(categorizeError(new Error('503 Service Unavailable'))).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('categorizes unknown errors', () => {
      expect(categorizeError(new Error('Something weird happened'))).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe('shouldRetry', () => {
    it('retries transient errors', () => {
      expect(shouldRetry(new Error('ECONNRESET'), 1, 5)).toBe(true);
      expect(shouldRetry(new Error('ECONNRESET'), 4, 5)).toBe(true);
    });

    it('does not retry when max attempts reached', () => {
      expect(shouldRetry(new Error('ECONNRESET'), 5, 5)).toBe(false);
    });

    it('does not retry client errors', () => {
      expect(shouldRetry(new Error('404 Not Found'), 1, 5)).toBe(false);
    });

    it('retries unknown errors up to half max attempts', () => {
      expect(shouldRetry(new Error('weird error'), 1, 4)).toBe(true);
      expect(shouldRetry(new Error('weird error'), 2, 4)).toBe(false);
    });
  });

  describe('RetryBudgetTracker', () => {
    let tracker: RetryBudgetTracker;

    beforeEach(() => {
      tracker = new RetryBudgetTracker(10, 60000);
    });

    it('allows retries within budget', () => {
      const queueName = 'test-queue';

      expect(tracker.canRetry(queueName)).toBe(true);
      expect(tracker.consumeRetry(queueName)).toBe(true);
      expect(tracker.getBudget(queueName).remaining).toBe(9);
    });

    it('denies retries when budget exhausted', () => {
      const queueName = 'test-queue';

      // Exhaust budget
      for (let i = 0; i < 10; i++) {
        tracker.consumeRetry(queueName);
      }

      expect(tracker.canRetry(queueName)).toBe(false);
      expect(tracker.consumeRetry(queueName)).toBe(false);
    });

    it('resets budget on reset()', () => {
      const queueName = 'test-queue';

      tracker.consumeRetry(queueName);
      tracker.consumeRetry(queueName);
      tracker.reset();

      expect(tracker.getBudget(queueName).remaining).toBe(10);
    });

    it('tracks separate budgets per queue', () => {
      tracker.consumeRetry('queue-a');
      tracker.consumeRetry('queue-a');

      expect(tracker.getBudget('queue-a').remaining).toBe(8);
      expect(tracker.getBudget('queue-b').remaining).toBe(10);
    });
  });

  describe('BACKOFF_PRESETS', () => {
    it('provides standard presets', () => {
      expect(BACKOFF_PRESETS.aggressive).toBeDefined();
      expect(BACKOFF_PRESETS.standard).toBeDefined();
      expect(BACKOFF_PRESETS.conservative).toBeDefined();
      expect(BACKOFF_PRESETS.fixed).toBeDefined();
    });

    it('aggressive preset has shorter delays', () => {
      expect(BACKOFF_PRESETS.aggressive.delay).toBeLessThan(BACKOFF_PRESETS.standard.delay);
    });

    it('conservative preset has longer max delay', () => {
      expect(BACKOFF_PRESETS.conservative.maxDelay).toBeGreaterThan(
        BACKOFF_PRESETS.standard.maxDelay!
      );
    });
  });
});

// ============================================================================
// Metrics Collector Tests
// ============================================================================

describe('Metrics Collector', () => {
  describe('JobMetricsCollector', () => {
    let collector: JobMetricsCollector;

    beforeEach(() => {
      collector = new JobMetricsCollector('test-queue', 60000, 100);
    });

    it('records job events and updates counts', () => {
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'added',
        timestamp: new Date().toISOString(),
      });

      const metrics = collector.getMetrics();
      expect(metrics.counts.waiting).toBe(1);
    });

    it('tracks job lifecycle correctly', () => {
      // Job added
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'added',
        timestamp: new Date().toISOString(),
      });

      // Job becomes active
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'active',
        timestamp: new Date().toISOString(),
      });

      let metrics = collector.getMetrics();
      expect(metrics.counts.waiting).toBe(0);
      expect(metrics.counts.active).toBe(1);

      // Job completes
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'completed',
        timestamp: new Date().toISOString(),
        duration: 500,
      });

      metrics = collector.getMetrics();
      expect(metrics.counts.active).toBe(0);
      expect(metrics.counts.completed).toBe(1);
    });

    it('calculates latency metrics', () => {
      collector.recordProcessTime(100);
      collector.recordProcessTime(200);
      collector.recordProcessTime(150);

      const metrics = collector.getMetrics();
      expect(metrics.latency.averageProcessTimeMs).toBe(150);
    });

    it('tracks errors by category', () => {
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'failed',
        timestamp: new Date().toISOString(),
        error: 'Connection timeout',
      });

      collector.recordEvent({
        jobId: '2',
        queueName: 'test-queue',
        eventType: 'failed',
        timestamp: new Date().toISOString(),
        error: '429 rate limit exceeded',
      });

      const errors = collector.getErrorBreakdown();
      expect(errors['timeout']).toBe(1);
      expect(errors['rate_limit']).toBe(1);
    });

    it('exports metrics as JSON', () => {
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'completed',
        timestamp: new Date().toISOString(),
      });

      const json = collector.toJSON() as any;
      expect(json.queueName).toBe('test-queue');
      expect(json.metrics).toBeDefined();
      expect(json.collectedAt).toBeDefined();
    });

    it('resets all metrics', () => {
      collector.recordEvent({
        jobId: '1',
        queueName: 'test-queue',
        eventType: 'completed',
        timestamp: new Date().toISOString(),
      });

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.counts.completed).toBe(0);
    });
  });

  describe('AggregateMetricsCollector', () => {
    let aggregator: AggregateMetricsCollector;

    beforeEach(() => {
      aggregator = new AggregateMetricsCollector();
    });

    it('manages collectors for multiple queues', () => {
      const collector1 = aggregator.getCollector('queue-a');
      const collector2 = aggregator.getCollector('queue-b');

      expect(collector1).not.toBe(collector2);
    });

    it('returns same collector for same queue', () => {
      const collector1 = aggregator.getCollector('queue-a');
      const collector2 = aggregator.getCollector('queue-a');

      expect(collector1).toBe(collector2);
    });

    it('aggregates metrics from all queues', () => {
      const collector1 = aggregator.getCollector('queue-a');
      const collector2 = aggregator.getCollector('queue-b');

      collector1.recordEvent({
        jobId: '1',
        queueName: 'queue-a',
        eventType: 'completed',
        timestamp: new Date().toISOString(),
      });

      collector2.recordEvent({
        jobId: '2',
        queueName: 'queue-b',
        eventType: 'completed',
        timestamp: new Date().toISOString(),
      });

      const allMetrics = aggregator.getAllMetrics();
      expect(Object.keys(allMetrics)).toHaveLength(2);
      expect(allMetrics['queue-a'].counts.completed).toBe(1);
      expect(allMetrics['queue-b'].counts.completed).toBe(1);
    });

    it('exports all metrics to JSON', () => {
      aggregator.getCollector('queue-a');
      aggregator.getCollector('queue-b');

      const json = aggregator.exportToJSON() as any;
      expect(json.exportedAt).toBeDefined();
      expect(json.queues['queue-a']).toBeDefined();
      expect(json.queues['queue-b']).toBeDefined();
    });
  });
});

// ============================================================================
// Bull Board Tests
// ============================================================================

describe('Bull Board Integration', () => {
  describe('getDashboardInfo', () => {
    it('returns dashboard information', () => {
      const info = getDashboardInfo();

      expect(info.title).toBe('IntelliFlow CRM - Job Queue Dashboard');
      expect(info.features).toContain('Real-time job monitoring');
      expect(info.features).toContain('Job retry and removal');
    });
  });

  describe('getBullBoardScreenshotDescription', () => {
    it('returns comprehensive description for documentation', () => {
      const desc = getBullBoardScreenshotDescription();

      expect(desc.description).toContain('Bull Board Dashboard');
      expect(desc.components).toContain('Queue List Sidebar - Shows all registered queues (AI Scoring, Email Notifications, Webhook Delivery)');
      expect(desc.layout).toContain('intelliflow:ai-scoring');
    });
  });
});
