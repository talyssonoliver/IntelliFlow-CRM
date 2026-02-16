import { describe, it, expect } from 'vitest';
import {
  NotificationCreatedEvent,
  NotificationSentEvent,
  NotificationDeliveredEvent,
  NotificationFailedEvent,
  NotificationReadEvent,
  NotificationPreferenceUpdatedEvent,
  NotificationScheduledEvent,
  NotificationMovedToDLQEvent,
} from '../NotificationEvents';

describe('NotificationEvents', () => {
  describe('NotificationCreatedEvent', () => {
    it('should create with correct properties', () => {
      const event = new NotificationCreatedEvent('notif_1', 'tenant_1', 'user_1', 'email', 'high');
      expect(event.eventType).toBe('NotificationCreated');
      expect(event.notificationId).toBe('notif_1');
      expect(event.tenantId).toBe('tenant_1');
      expect(event.recipientId).toBe('user_1');
      expect(event.channel).toBe('email');
      expect(event.priority).toBe('high');
      expect(event.eventId).toBeDefined();
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('should serialize to payload', () => {
      const event = new NotificationCreatedEvent('n_1', 't_1', 'u_1', 'sms', 'normal');
      const payload = event.toPayload();
      expect(payload.notificationId).toBe('n_1');
      expect(payload.tenantId).toBe('t_1');
      expect(payload.recipientId).toBe('u_1');
      expect(payload.channel).toBe('sms');
      expect(payload.priority).toBe('normal');
    });
  });

  describe('NotificationSentEvent', () => {
    it('should create with correct properties', () => {
      const event = new NotificationSentEvent('n_1', 't_1', 'u_1', 'email', 'msg_123');
      expect(event.eventType).toBe('NotificationSent');
      expect(event.providerMessageId).toBe('msg_123');
    });

    it('should serialize to payload', () => {
      const payload = new NotificationSentEvent('n_1', 't_1', 'u_1', 'push', 'msg_456').toPayload();
      expect(payload.providerMessageId).toBe('msg_456');
      expect(payload.channel).toBe('push');
    });
  });

  describe('NotificationDeliveredEvent', () => {
    it('should create with correct properties', () => {
      const event = new NotificationDeliveredEvent('n_1', 't_1', 'u_1', 'in_app');
      expect(event.eventType).toBe('NotificationDelivered');
      expect(event.channel).toBe('in_app');
    });

    it('should serialize to payload', () => {
      const payload = new NotificationDeliveredEvent('n_1', 't_1', 'u_1', 'email').toPayload();
      expect(payload.notificationId).toBe('n_1');
      expect(payload.channel).toBe('email');
    });
  });

  describe('NotificationFailedEvent', () => {
    it('should create with error and retryCount', () => {
      const event = new NotificationFailedEvent('n_1', 't_1', 'u_1', 'sms', 'Provider timeout', 2);
      expect(event.eventType).toBe('NotificationFailed');
      expect(event.error).toBe('Provider timeout');
      expect(event.retryCount).toBe(2);
    });

    it('should serialize to payload', () => {
      const payload = new NotificationFailedEvent(
        'n_1',
        't_1',
        'u_1',
        'email',
        'Bounce',
        1
      ).toPayload();
      expect(payload.error).toBe('Bounce');
      expect(payload.retryCount).toBe(1);
    });
  });

  describe('NotificationReadEvent', () => {
    it('should create with correct properties', () => {
      const event = new NotificationReadEvent('n_1', 't_1', 'u_1');
      expect(event.eventType).toBe('NotificationRead');
      expect(event.notificationId).toBe('n_1');
    });

    it('should serialize to payload', () => {
      const payload = new NotificationReadEvent('n_1', 't_1', 'u_1').toPayload();
      expect(payload.notificationId).toBe('n_1');
      expect(payload.recipientId).toBe('u_1');
    });
  });

  describe('NotificationPreferenceUpdatedEvent', () => {
    it('should create with channel and enabled', () => {
      const event = new NotificationPreferenceUpdatedEvent('u_1', 't_1', 'email', true);
      expect(event.eventType).toBe('NotificationPreferenceUpdated');
      expect(event.userId).toBe('u_1');
      expect(event.channel).toBe('email');
      expect(event.enabled).toBe(true);
    });

    it('should serialize to payload', () => {
      const payload = new NotificationPreferenceUpdatedEvent(
        'u_1',
        't_1',
        'sms',
        false
      ).toPayload();
      expect(payload.channel).toBe('sms');
      expect(payload.enabled).toBe(false);
    });
  });

  describe('NotificationScheduledEvent', () => {
    it('should create with scheduledAt', () => {
      const scheduledAt = new Date('2026-01-15T10:00:00Z');
      const event = new NotificationScheduledEvent('n_1', 't_1', 'u_1', scheduledAt);
      expect(event.eventType).toBe('NotificationScheduled');
      expect(event.scheduledAt).toEqual(scheduledAt);
    });

    it('should serialize scheduledAt as ISO string', () => {
      const scheduledAt = new Date('2026-01-15T10:00:00Z');
      const payload = new NotificationScheduledEvent('n_1', 't_1', 'u_1', scheduledAt).toPayload();
      expect(payload.scheduledAt).toBe('2026-01-15T10:00:00.000Z');
    });
  });

  describe('NotificationMovedToDLQEvent', () => {
    it('should create with error and retryCount', () => {
      const event = new NotificationMovedToDLQEvent(
        'n_1',
        't_1',
        'email',
        'Max retries exceeded',
        3
      );
      expect(event.eventType).toBe('NotificationMovedToDLQ');
      expect(event.error).toBe('Max retries exceeded');
      expect(event.retryCount).toBe(3);
    });

    it('should serialize to payload', () => {
      const payload = new NotificationMovedToDLQEvent('n_1', 't_1', 'sms', 'err', 5).toPayload();
      expect(payload.channel).toBe('sms');
      expect(payload.error).toBe('err');
      expect(payload.retryCount).toBe(5);
    });
  });
});
