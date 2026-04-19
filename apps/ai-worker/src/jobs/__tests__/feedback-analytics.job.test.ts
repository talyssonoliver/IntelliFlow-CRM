/**
 * Feedback Analytics Job Tests
 *
 * Covers:
 * 1. Handler runs the generator (runFeedbackAnalytics is called)
 * 2. Writes AIMonitoringEvent with eventType `retraining_trigger` when threshold is breached
 * 3. Prometheus counter increments on breach
 * 4. No monitoring event / no counter increment when retraining is NOT needed
 * 5. DB error is non-fatal — job still completes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoist mocks before any imports
// ============================================================================

const mockRunFeedbackAnalytics = vi.hoisted(() => vi.fn());
const mockIncrementRetrainingTriggers = vi.hoisted(() => vi.fn());
const mockResetRetrainingTriggerCounters = vi.hoisted(() => vi.fn());
const mockAIMonitoringEventCreate = vi.hoisted(() => vi.fn());
const mockLeadFeedbackFindMany = vi.hoisted(() => vi.fn());

vi.mock('../../analytics/feedback-analytics-generator', () => ({
  runFeedbackAnalytics: mockRunFeedbackAnalytics,
}));

vi.mock('../../metrics/prometheus-exporter', () => ({
  incrementRetrainingTriggers: mockIncrementRetrainingTriggers,
  _resetRetrainingTriggerCounters: mockResetRetrainingTriggerCounters,
}));

vi.mock('@intelliflow/db', () => ({
  prisma: {
    leadFeedback: {
      findMany: mockLeadFeedbackFindMany,
    },
    aIMonitoringEvent: {
      create: mockAIMonitoringEventCreate,
    },
  },
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  processFeedbackAnalyticsJob,
  FEEDBACK_ANALYTICS_QUEUE,
  FEEDBACK_ANALYTICS_CRON,
  type FeedbackAnalyticsJobData,
} from '../feedback-analytics.job';
import type { FeedbackAnalytics } from '../../analytics/feedback-analytics-generator';

// ============================================================================
// Helpers
// ============================================================================

function makeAnalytics(retrainingNeeded: boolean, urgency = 'high'): FeedbackAnalytics {
  return {
    generatedAt: new Date().toISOString(),
    period: { start: new Date().toISOString(), end: new Date().toISOString(), days: 30 },
    summary: {
      total: 200,
      thumbsUp: 100,
      thumbsDown: 60,
      corrections: 40,
      positiveRatio: 0.5,
      negativeRatio: 0.3,
      correctionRatio: 0.2,
    },
    corrections: {
      minor: 10,
      moderate: 15,
      major: 10,
      severe: 5,
      averageMagnitude: 18.5,
      medianMagnitude: 15,
      averageDirection: 'down',
    },
    categoryAnalysis: [],
    modelPerformance: [],
    retrainingStatus: {
      needed: retrainingNeeded,
      urgency: urgency as 'none' | 'low' | 'medium' | 'high' | 'critical',
      reasons: retrainingNeeded ? ['High negative feedback ratio: 30.0% > threshold'] : [],
      metrics: {
        feedbackCount: 200,
        negativeRatio: 0.3,
        averageCorrection: 18.5,
        windowDays: 7,
      },
      modelVersion: 'v1.2.0',
      recommendation: retrainingNeeded
        ? 'Model retraining recommended within 1-2 days.'
        : 'Model is performing within acceptable parameters.',
    },
    trends: { dailyFeedbackCounts: [], weeklyAverageCorrection: [] },
    recommendations: [],
  } as unknown as FeedbackAnalytics;
}

function createMockJob(data: Partial<FeedbackAnalyticsJobData> = {}) {
  const fullData: FeedbackAnalyticsJobData = {
    periodDays: 30,
    save: false,
    correlationId: 'test-correlation-id',
    ...data,
  };
  return {
    id: 'job-test-001',
    data: fullData,
    queueName: FEEDBACK_ANALYTICS_QUEUE,
    token: 'test-token',
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe('processFeedbackAnalyticsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadFeedbackFindMany.mockResolvedValue([]);
    mockAIMonitoringEventCreate.mockResolvedValue({ id: 'event-001' });
  });

  describe('constants', () => {
    it('exports the correct queue name', () => {
      expect(FEEDBACK_ANALYTICS_QUEUE).toBe('ai-feedback-analytics');
    });

    it('exports the correct cron pattern (daily 02:00 UTC)', () => {
      expect(FEEDBACK_ANALYTICS_CRON).toBe('0 2 * * *');
    });
  });

  describe('happy path — retraining needed', () => {
    beforeEach(() => {
      mockRunFeedbackAnalytics.mockResolvedValue(makeAnalytics(true, 'high'));
    });

    it('calls runFeedbackAnalytics with the records loaded from DB', async () => {
      const job = createMockJob();
      await processFeedbackAnalyticsJob(job);

      expect(mockRunFeedbackAnalytics).toHaveBeenCalledOnce();
      expect(mockRunFeedbackAnalytics).toHaveBeenCalledWith(
        expect.any(Array), // records
        30, // periodDays
        false // save
      );
    });

    it('writes an AIMonitoringEvent with eventType retraining_trigger', async () => {
      const job = createMockJob();
      await processFeedbackAnalyticsJob(job);

      expect(mockAIMonitoringEventCreate).toHaveBeenCalledOnce();
      const callArg = mockAIMonitoringEventCreate.mock.calls[0][0];
      expect(callArg.data.eventType).toBe('retraining_trigger');
      expect(callArg.data.flagged).toBe(true);
      expect(callArg.data.model).toBe('v1.2.0');
    });

    it('increments the Prometheus counter with urgency label', async () => {
      const job = createMockJob();
      await processFeedbackAnalyticsJob(job);

      expect(mockIncrementRetrainingTriggers).toHaveBeenCalledOnce();
      expect(mockIncrementRetrainingTriggers).toHaveBeenCalledWith({ urgency: 'high' });
    });

    it('returns retrainingNeeded=true and monitoringEventId', async () => {
      const job = createMockJob();
      const result = await processFeedbackAnalyticsJob(job);

      expect(result.retrainingNeeded).toBe(true);
      expect(result.urgency).toBe('high');
      expect(result.monitoringEventId).toBe('event-001');
    });

    it('updates job progress to 100', async () => {
      const job = createMockJob();
      await processFeedbackAnalyticsJob(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });
  });

  describe('no breach — retraining NOT needed', () => {
    beforeEach(() => {
      mockRunFeedbackAnalytics.mockResolvedValue(makeAnalytics(false, 'none'));
    });

    it('does NOT write a monitoring event', async () => {
      const job = createMockJob();
      await processFeedbackAnalyticsJob(job);

      expect(mockAIMonitoringEventCreate).not.toHaveBeenCalled();
    });

    it('does NOT increment the Prometheus counter', async () => {
      const job = createMockJob();
      await processFeedbackAnalyticsJob(job);

      expect(mockIncrementRetrainingTriggers).not.toHaveBeenCalled();
    });

    it('returns retrainingNeeded=false and no monitoringEventId', async () => {
      const job = createMockJob();
      const result = await processFeedbackAnalyticsJob(job);

      expect(result.retrainingNeeded).toBe(false);
      expect(result.monitoringEventId).toBeUndefined();
    });
  });

  describe('DB error resilience', () => {
    it('still completes when DB monitoring event write fails', async () => {
      mockRunFeedbackAnalytics.mockResolvedValue(makeAnalytics(true, 'critical'));
      mockAIMonitoringEventCreate.mockRejectedValue(new Error('DB write failed'));

      const job = createMockJob();
      const result = await processFeedbackAnalyticsJob(job);

      // Job should not throw
      expect(result.retrainingNeeded).toBe(true);
      // Counter still increments even when DB write fails
      expect(mockIncrementRetrainingTriggers).toHaveBeenCalledOnce();
      // No monitoringEventId since create failed
      expect(result.monitoringEventId).toBeUndefined();
    });

    it('still completes when DB record load fails', async () => {
      mockLeadFeedbackFindMany.mockRejectedValue(new Error('Connection refused'));
      mockRunFeedbackAnalytics.mockResolvedValue(makeAnalytics(false, 'none'));

      const job = createMockJob();
      await expect(processFeedbackAnalyticsJob(job)).resolves.not.toThrow();

      // runFeedbackAnalytics is called with empty records
      expect(mockRunFeedbackAnalytics).toHaveBeenCalledWith([], 30, false);
    });
  });
});
