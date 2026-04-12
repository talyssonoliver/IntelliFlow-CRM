/**
 * ChurnRiskAssessedEvent Domain Event Tests (IFC-095)
 */

import { describe, it, expect } from 'vitest';
import { ChurnRiskAssessedEvent } from '../events/ChurnRiskAssessedEvent';

describe('ChurnRiskAssessedEvent', () => {
  const baseEventParams = {
    accountId: 'account-123',
    tenantId: 'tenant-456',
    riskLevel: 'HIGH' as const,
    confidence: 0.85,
    recommendedActions: ['CALL', 'EMAIL'] as const,
    assessedAt: new Date('2026-01-31T10:00:00Z'),
  };

  describe('constructor', () => {
    it('should create with all required fields', () => {
      const event = new ChurnRiskAssessedEvent(
        baseEventParams.accountId,
        baseEventParams.tenantId,
        45, // previousScore
        78, // newScore
        baseEventParams.riskLevel,
        baseEventParams.confidence,
        [...baseEventParams.recommendedActions],
        baseEventParams.assessedAt
      );

      expect(event.accountId).toBe('account-123');
      expect(event.tenantId).toBe('tenant-456');
      expect(event.previousScore).toBe(45);
      expect(event.newScore).toBe(78);
      expect(event.riskLevel).toBe('HIGH');
      expect(event.confidence).toBe(0.85);
      expect(event.recommendedActions).toEqual(['CALL', 'EMAIL']);
      expect(event.assessedAt).toEqual(baseEventParams.assessedAt);
    });

    it('should have event type CHURN_RISK_ASSESSED', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.7,
        [],
        new Date()
      );
      expect(event.eventType).toBe('CHURN_RISK_ASSESSED');
    });

    it('should generate unique event ID', () => {
      const event1 = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.7,
        [],
        new Date()
      );
      const event2 = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.7,
        [],
        new Date()
      );
      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should set occurredAt automatically', () => {
      const beforeCreation = new Date();
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.7,
        [],
        new Date()
      );
      const afterCreation = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it('should accept previousScore as number', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        30,
        50,
        'MEDIUM',
        0.7,
        [],
        new Date()
      );
      expect(event.previousScore).toBe(30);
    });

    it('should accept previousScore as null', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.7,
        [],
        new Date()
      );
      expect(event.previousScore).toBeNull();
    });
  });

  describe('riskIncreased', () => {
    it('should return true when new score is higher', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        40,
        60,
        'HIGH',
        0.8,
        [],
        new Date()
      );
      expect(event.riskIncreased).toBe(true);
    });

    it('should return false when new score is lower', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        60,
        40,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.riskIncreased).toBe(false);
    });

    it('should return false when scores are equal', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        50,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.riskIncreased).toBe(false);
    });

    it('should return false when no previous score', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.riskIncreased).toBe(false);
    });
  });

  describe('riskDecreased', () => {
    it('should return true when new score is lower', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        60,
        40,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.riskDecreased).toBe(true);
    });

    it('should return false when new score is higher', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        40,
        60,
        'HIGH',
        0.8,
        [],
        new Date()
      );
      expect(event.riskDecreased).toBe(false);
    });

    it('should return false when no previous score', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.riskDecreased).toBe(false);
    });
  });

  describe('scoreChange', () => {
    it('should return positive change when risk increased', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        40,
        60,
        'HIGH',
        0.8,
        [],
        new Date()
      );
      expect(event.scoreChange).toBe(20);
    });

    it('should return negative change when risk decreased', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        60,
        40,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.scoreChange).toBe(-20);
    });

    it('should return 0 when scores are equal', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        50,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.scoreChange).toBe(0);
    });

    it('should return null when no previous score', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.scoreChange).toBeNull();
    });
  });

  describe('isFirstAssessment', () => {
    it('should return true when previousScore is null', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.isFirstAssessment).toBe(true);
    });

    it('should return false when previousScore exists', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        30,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.isFirstAssessment).toBe(false);
    });

    it('should return false when previousScore is 0', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        0,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );
      expect(event.isFirstAssessment).toBe(false);
    });
  });

  describe('toPayload', () => {
    it('should return complete payload with all fields', () => {
      const assessedAt = new Date('2026-01-31T10:00:00Z');
      const event = new ChurnRiskAssessedEvent(
        'account-123',
        'tenant-456',
        45,
        78,
        'HIGH',
        0.85,
        ['CALL', 'EMAIL'],
        assessedAt
      );

      const payload = event.toPayload();

      expect(payload.eventId).toBeDefined();
      expect(payload.eventType).toBe('CHURN_RISK_ASSESSED');
      expect(payload.occurredAt).toBeDefined();
      expect(payload.accountId).toBe('account-123');
      expect(payload.tenantId).toBe('tenant-456');
      expect(payload.previousScore).toBe(45);
      expect(payload.newScore).toBe(78);
      expect(payload.riskLevel).toBe('HIGH');
      expect(payload.confidence).toBe(0.85);
      expect(payload.recommendedActions).toEqual(['CALL', 'EMAIL']);
      expect(payload.assessedAt).toBe('2026-01-31T10:00:00.000Z');
      expect(payload.riskIncreased).toBe(true);
      expect(payload.riskDecreased).toBe(false);
      expect(payload.scoreChange).toBe(33);
      expect(payload.isFirstAssessment).toBe(false);
    });

    it('should handle first assessment correctly', () => {
      const event = new ChurnRiskAssessedEvent(
        'acc-1',
        'tenant-1',
        null,
        50,
        'MEDIUM',
        0.8,
        [],
        new Date()
      );

      const payload = event.toPayload();

      expect(payload.previousScore).toBeNull();
      expect(payload.isFirstAssessment).toBe(true);
      expect(payload.scoreChange).toBeNull();
      expect(payload.riskIncreased).toBe(false);
      expect(payload.riskDecreased).toBe(false);
    });
  });
});
