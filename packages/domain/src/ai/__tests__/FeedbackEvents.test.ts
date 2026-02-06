/**
 * FeedbackEvents Tests
 *
 * Tests for AI feedback domain events ensuring proper
 * construction, property access, and payload serialization.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import {
  ScoreFeedbackSubmittedEvent,
  RetrainingRecommendedEvent,
  TrainingDataExportedEvent,
  FeedbackAnalyticsGeneratedEvent,
} from '../FeedbackEvents';

describe('ScoreFeedbackSubmittedEvent', () => {
  const createEvent = (overrides?: Partial<{
    feedbackId: string;
    leadId: string;
    feedbackType: 'THUMBS_UP' | 'THUMBS_DOWN' | 'SCORE_CORRECTION';
    originalScore: number;
    correctedScore: number | null;
    correctionMagnitude: number | null;
    correctionCategory: 'SCORE_TOO_HIGH' | 'SCORE_TOO_LOW' | 'WRONG_FACTORS' | 'MISSING_CONTEXT' | 'DATA_QUALITY' | 'OTHER' | null;
    modelVersion: string;
    userId: string;
    tenantId: string;
  }>) => {
    return new ScoreFeedbackSubmittedEvent(
      overrides?.feedbackId ?? 'feedback-001',
      overrides?.leadId ?? 'lead-123',
      overrides?.feedbackType ?? 'THUMBS_DOWN',
      overrides?.originalScore ?? 85,
      overrides?.correctedScore ?? 60,
      overrides?.correctionMagnitude ?? 25,
      overrides?.correctionCategory ?? 'SCORE_TOO_HIGH',
      overrides?.modelVersion ?? 'v1.0.0',
      overrides?.userId ?? 'user-456',
      overrides?.tenantId ?? 'tenant-789'
    );
  };

  it('should create event with correct eventType', () => {
    const event = createEvent();
    expect(event.eventType).toBe('ai.score_feedback.submitted');
  });

  it('should have unique eventId (UUID)', () => {
    const event1 = createEvent();
    const event2 = createEvent();
    expect(event1.eventId).toBeDefined();
    expect(event2.eventId).toBeDefined();
    expect(event1.eventId).not.toBe(event2.eventId);
  });

  it('should set occurredAt to a recent Date', () => {
    const before = new Date();
    const event = createEvent();
    const after = new Date();
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should expose all constructor properties', () => {
    const event = createEvent();
    expect(event.feedbackId).toBe('feedback-001');
    expect(event.leadId).toBe('lead-123');
    expect(event.feedbackType).toBe('THUMBS_DOWN');
    expect(event.originalScore).toBe(85);
    expect(event.correctedScore).toBe(60);
    expect(event.correctionMagnitude).toBe(25);
    expect(event.correctionCategory).toBe('SCORE_TOO_HIGH');
    expect(event.modelVersion).toBe('v1.0.0');
    expect(event.userId).toBe('user-456');
    expect(event.tenantId).toBe('tenant-789');
  });

  it('should handle THUMBS_UP feedback with null corrected values', () => {
    const event = new ScoreFeedbackSubmittedEvent(
      'feedback-001', 'lead-123', 'THUMBS_UP', 85,
      null, null, null,
      'v1.0.0', 'user-456', 'tenant-789'
    );
    expect(event.feedbackType).toBe('THUMBS_UP');
    expect(event.correctedScore).toBeNull();
    expect(event.correctionMagnitude).toBeNull();
    expect(event.correctionCategory).toBeNull();
  });

  it('should handle SCORE_CORRECTION feedback', () => {
    const event = createEvent({
      feedbackType: 'SCORE_CORRECTION',
      correctedScore: 40,
      correctionMagnitude: 45,
      correctionCategory: 'MISSING_CONTEXT',
    });
    expect(event.feedbackType).toBe('SCORE_CORRECTION');
    expect(event.correctedScore).toBe(40);
    expect(event.correctionMagnitude).toBe(45);
    expect(event.correctionCategory).toBe('MISSING_CONTEXT');
  });

  it('should serialize to payload with all fields', () => {
    const event = createEvent();
    const payload = event.toPayload();

    expect(payload).toEqual({
      feedbackId: 'feedback-001',
      leadId: 'lead-123',
      feedbackType: 'THUMBS_DOWN',
      originalScore: 85,
      correctedScore: 60,
      correctionMagnitude: 25,
      correctionCategory: 'SCORE_TOO_HIGH',
      modelVersion: 'v1.0.0',
      userId: 'user-456',
      tenantId: 'tenant-789',
    });
  });

  it('should serialize to payload with null corrected values', () => {
    const event = new ScoreFeedbackSubmittedEvent(
      'feedback-001', 'lead-123', 'THUMBS_DOWN', 85,
      null, null, null,
      'v1.0.0', 'user-456', 'tenant-789'
    );
    const payload = event.toPayload();

    expect(payload.correctedScore).toBeNull();
    expect(payload.correctionMagnitude).toBeNull();
    expect(payload.correctionCategory).toBeNull();
  });

  it('should handle edge case: zero original score', () => {
    const event = createEvent({ originalScore: 0 });
    expect(event.originalScore).toBe(0);
    expect(event.toPayload().originalScore).toBe(0);
  });

  it('should handle edge case: max score (100)', () => {
    const event = createEvent({ originalScore: 100, correctedScore: 100 });
    expect(event.originalScore).toBe(100);
    expect(event.toPayload().correctedScore).toBe(100);
  });

  it('should handle empty string values', () => {
    const event = createEvent({
      feedbackId: '',
      leadId: '',
      modelVersion: '',
    });
    expect(event.feedbackId).toBe('');
    expect(event.leadId).toBe('');
    expect(event.modelVersion).toBe('');
  });
});

describe('RetrainingRecommendedEvent', () => {
  it('should create event with correct eventType', () => {
    const event = new RetrainingRecommendedEvent(
      'v1.0.0',
      'High negative feedback ratio',
      150,
      0.35,
      22.5
    );
    expect(event.eventType).toBe('ai.model.retraining_recommended');
  });

  it('should expose all constructor properties', () => {
    const event = new RetrainingRecommendedEvent(
      'v2.1.0',
      'Excessive correction magnitudes',
      200,
      0.40,
      30.0
    );
    expect(event.modelVersion).toBe('v2.1.0');
    expect(event.reason).toBe('Excessive correction magnitudes');
    expect(event.feedbackCount).toBe(200);
    expect(event.negativeRatio).toBe(0.40);
    expect(event.avgCorrectionMagnitude).toBe(30.0);
  });

  it('should set recommendedAt to default Date when not provided', () => {
    const before = new Date();
    const event = new RetrainingRecommendedEvent('v1.0', 'reason', 100, 0.3, 20);
    const after = new Date();
    expect(event.recommendedAt).toBeInstanceOf(Date);
    expect(event.recommendedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.recommendedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should accept custom recommendedAt date', () => {
    const customDate = new Date('2025-06-15T10:00:00Z');
    const event = new RetrainingRecommendedEvent(
      'v1.0', 'reason', 100, 0.3, 20, customDate
    );
    expect(event.recommendedAt).toBe(customDate);
  });

  it('should have unique eventId', () => {
    const event1 = new RetrainingRecommendedEvent('v1', 'r', 1, 0, 0);
    const event2 = new RetrainingRecommendedEvent('v1', 'r', 1, 0, 0);
    expect(event1.eventId).not.toBe(event2.eventId);
  });

  it('should serialize to payload correctly', () => {
    const customDate = new Date('2025-07-01T12:00:00Z');
    const event = new RetrainingRecommendedEvent(
      'v3.0.0',
      'Too many corrections',
      300,
      0.45,
      28.3,
      customDate
    );
    const payload = event.toPayload();

    expect(payload).toEqual({
      modelVersion: 'v3.0.0',
      reason: 'Too many corrections',
      feedbackCount: 300,
      negativeRatio: 0.45,
      avgCorrectionMagnitude: 28.3,
      recommendedAt: '2025-07-01T12:00:00.000Z',
    });
  });

  it('should serialize recommendedAt as ISO string', () => {
    const event = new RetrainingRecommendedEvent('v1', 'r', 1, 0, 0);
    const payload = event.toPayload();
    expect(typeof payload.recommendedAt).toBe('string');
    // Verify it parses back to a valid date
    expect(new Date(payload.recommendedAt as string).toISOString()).toBe(payload.recommendedAt);
  });

  it('should handle edge case: zero feedback count', () => {
    const event = new RetrainingRecommendedEvent('v1', 'no feedback', 0, 0, 0);
    expect(event.feedbackCount).toBe(0);
    expect(event.toPayload().feedbackCount).toBe(0);
  });

  it('should handle edge case: 100% negative ratio', () => {
    const event = new RetrainingRecommendedEvent('v1', 'all bad', 50, 1.0, 40);
    expect(event.negativeRatio).toBe(1.0);
  });
});

describe('TrainingDataExportedEvent', () => {
  const dateFrom = new Date('2025-01-01T00:00:00Z');
  const dateTo = new Date('2025-01-31T23:59:59Z');

  it('should create event with correct eventType', () => {
    const event = new TrainingDataExportedEvent('v1.0', 500, dateFrom, dateTo, 'admin-001');
    expect(event.eventType).toBe('ai.training_data.exported');
  });

  it('should expose all constructor properties', () => {
    const event = new TrainingDataExportedEvent('v2.0', 1000, dateFrom, dateTo, 'admin-002');
    expect(event.modelVersion).toBe('v2.0');
    expect(event.recordCount).toBe(1000);
    expect(event.dateFrom).toBe(dateFrom);
    expect(event.dateTo).toBe(dateTo);
    expect(event.exportedBy).toBe('admin-002');
  });

  it('should have unique eventId', () => {
    const event1 = new TrainingDataExportedEvent('v1', 1, dateFrom, dateTo, 'a');
    const event2 = new TrainingDataExportedEvent('v1', 1, dateFrom, dateTo, 'a');
    expect(event1.eventId).not.toBe(event2.eventId);
  });

  it('should set occurredAt to current time', () => {
    const before = new Date();
    const event = new TrainingDataExportedEvent('v1', 1, dateFrom, dateTo, 'a');
    const after = new Date();
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should serialize to payload with ISO date strings', () => {
    const event = new TrainingDataExportedEvent('v1.5', 750, dateFrom, dateTo, 'exporter-1');
    const payload = event.toPayload();

    expect(payload).toEqual({
      modelVersion: 'v1.5',
      recordCount: 750,
      dateFrom: '2025-01-01T00:00:00.000Z',
      dateTo: '2025-01-31T23:59:59.000Z',
      exportedBy: 'exporter-1',
    });
  });

  it('should handle edge case: zero record count', () => {
    const event = new TrainingDataExportedEvent('v1', 0, dateFrom, dateTo, 'a');
    expect(event.recordCount).toBe(0);
    expect(event.toPayload().recordCount).toBe(0);
  });

  it('should handle same dateFrom and dateTo', () => {
    const sameDate = new Date('2025-06-15T12:00:00Z');
    const event = new TrainingDataExportedEvent('v1', 10, sameDate, sameDate, 'a');
    const payload = event.toPayload();
    expect(payload.dateFrom).toBe(payload.dateTo);
  });
});

describe('FeedbackAnalyticsGeneratedEvent', () => {
  const periodStart = new Date('2025-06-01T00:00:00Z');
  const periodEnd = new Date('2025-06-07T23:59:59Z');

  it('should create event with correct eventType', () => {
    const event = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 500, 0.75, 12.5, false
    );
    expect(event.eventType).toBe('ai.feedback_analytics.generated');
  });

  it('should expose all constructor properties', () => {
    const event = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 1000, 0.65, 18.3, true
    );
    expect(event.periodStart).toBe(periodStart);
    expect(event.periodEnd).toBe(periodEnd);
    expect(event.totalFeedback).toBe(1000);
    expect(event.positiveRatio).toBe(0.65);
    expect(event.avgCorrectionMagnitude).toBe(18.3);
    expect(event.retrainingRecommended).toBe(true);
  });

  it('should have unique eventId', () => {
    const event1 = new FeedbackAnalyticsGeneratedEvent(periodStart, periodEnd, 1, 0, 0, false);
    const event2 = new FeedbackAnalyticsGeneratedEvent(periodStart, periodEnd, 1, 0, 0, false);
    expect(event1.eventId).not.toBe(event2.eventId);
  });

  it('should set occurredAt to current time', () => {
    const before = new Date();
    const event = new FeedbackAnalyticsGeneratedEvent(periodStart, periodEnd, 1, 0, 0, false);
    const after = new Date();
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should serialize to payload with ISO date strings', () => {
    const event = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 250, 0.80, 10.0, false
    );
    const payload = event.toPayload();

    expect(payload).toEqual({
      periodStart: '2025-06-01T00:00:00.000Z',
      periodEnd: '2025-06-07T23:59:59.000Z',
      totalFeedback: 250,
      positiveRatio: 0.80,
      avgCorrectionMagnitude: 10.0,
      retrainingRecommended: false,
    });
  });

  it('should serialize retrainingRecommended=true correctly', () => {
    const event = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 500, 0.55, 25.0, true
    );
    const payload = event.toPayload();
    expect(payload.retrainingRecommended).toBe(true);
  });

  it('should handle edge case: zero total feedback', () => {
    const event = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 0, 0, 0, false
    );
    expect(event.totalFeedback).toBe(0);
    expect(event.toPayload().totalFeedback).toBe(0);
  });

  it('should handle edge case: positive ratio at boundaries', () => {
    const eventZero = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 100, 0, 30, true
    );
    expect(eventZero.positiveRatio).toBe(0);

    const eventOne = new FeedbackAnalyticsGeneratedEvent(
      periodStart, periodEnd, 100, 1.0, 0, false
    );
    expect(eventOne.positiveRatio).toBe(1.0);
  });
});

describe('FeedbackEvents - Common DomainEvent behavior', () => {
  it('all event types should extend DomainEvent (have eventId, occurredAt, toPayload)', () => {
    const events = [
      new ScoreFeedbackSubmittedEvent('f1', 'l1', 'THUMBS_UP', 50, null, null, null, 'v1', 'u1', 't1'),
      new RetrainingRecommendedEvent('v1', 'reason', 100, 0.3, 20),
      new TrainingDataExportedEvent('v1', 100, new Date(), new Date(), 'admin'),
      new FeedbackAnalyticsGeneratedEvent(new Date(), new Date(), 100, 0.8, 10, false),
    ];

    for (const event of events) {
      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe('string');
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(typeof event.toPayload()).toBe('object');
      expect(event.toPayload()).not.toBeNull();
    }
  });

  it('toPayload should return a Record<string, unknown>', () => {
    const event = new ScoreFeedbackSubmittedEvent(
      'f1', 'l1', 'THUMBS_UP', 50, null, null, null, 'v1', 'u1', 't1'
    );
    const payload = event.toPayload();
    expect(typeof payload).toBe('object');
    expect(payload).not.toBeNull();
    // Verify it has string keys
    for (const key of Object.keys(payload)) {
      expect(typeof key).toBe('string');
    }
  });
});
