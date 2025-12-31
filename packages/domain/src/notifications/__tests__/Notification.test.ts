/**
 * Notification Entity Tests
 * @see IFC-157: Notification service MVP
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Notification, NotificationChannel, NotificationStatus, NotificationPriority } from '../Notification';
import { NotificationId } from '../NotificationId';
import {
  NotificationCreatedEvent,
  NotificationSentEvent,
  NotificationFailedEvent,
  NotificationReadEvent,
} from '../NotificationEvents';

describe('Notification', () => {
  const createTestNotification = (overrides?: Partial<{
    id: NotificationId;
    tenantId: string;
    recipientId: string;
    channel: NotificationChannel;
    subject: string;
    body: string;
    priority: NotificationPriority;
    templateId: string;
  }>) => {
    return Notification.create({
      id: overrides?.id ?? NotificationId.generate(),
      tenantId: overrides?.tenantId ?? 'tenant-123',
      recipientId: overrides?.recipientId ?? 'user-456',
      channel: overrides?.channel ?? 'in_app',
      subject: overrides?.subject ?? 'Test Notification',
      body: overrides?.body ?? 'This is a test notification',
      priority: overrides?.priority ?? 'normal',
      templateId: overrides?.templateId,
    });
  };

  describe('create', () => {
    it('should create a notification with required fields', () => {
      const notification = createTestNotification();

      expect(notification.tenantId).toBe('tenant-123');
      expect(notification.recipientId).toBe('user-456');
      expect(notification.channel).toBe('in_app');
      expect(notification.subject).toBe('Test Notification');
      expect(notification.body).toBe('This is a test notification');
      expect(notification.priority).toBe('normal');
      expect(notification.status).toBe('pending');
    });

    it('should emit NotificationCreatedEvent on creation', () => {
      const notification = createTestNotification();
      const events = notification.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationCreatedEvent);
      expect((events[0] as NotificationCreatedEvent).notificationId).toBe(notification.id.value);
    });

    it('should set createdAt timestamp', () => {
      const before = new Date();
      const notification = createTestNotification();
      const after = new Date();

      expect(notification.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(notification.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should support all channels', () => {
      const channels: NotificationChannel[] = ['in_app', 'email', 'sms', 'push', 'webhook'];

      channels.forEach(channel => {
        const notification = createTestNotification({ channel });
        expect(notification.channel).toBe(channel);
      });
    });

    it('should support all priorities', () => {
      const priorities: NotificationPriority[] = ['high', 'normal', 'low'];

      priorities.forEach(priority => {
        const notification = createTestNotification({ priority });
        expect(notification.priority).toBe(priority);
      });
    });
  });

  describe('markAsSent', () => {
    it('should change status to sent', () => {
      const notification = createTestNotification();
      notification.clearDomainEvents(); // Clear creation event

      notification.markAsSent('provider-msg-123');

      expect(notification.status).toBe('sent');
      expect(notification.providerMessageId).toBe('provider-msg-123');
      expect(notification.sentAt).toBeDefined();
    });

    it('should emit NotificationSentEvent', () => {
      const notification = createTestNotification();
      notification.clearDomainEvents();

      notification.markAsSent('provider-msg-123');
      const events = notification.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationSentEvent);
    });

    it('should throw if already sent', () => {
      const notification = createTestNotification();
      notification.markAsSent('msg-1');

      expect(() => notification.markAsSent('msg-2')).toThrow('Cannot send notification that is not pending');
    });
  });

  describe('markAsDelivered', () => {
    it('should change status to delivered', () => {
      const notification = createTestNotification();
      notification.markAsSent('msg-123');

      notification.markAsDelivered();

      expect(notification.status).toBe('delivered');
      expect(notification.deliveredAt).toBeDefined();
    });

    it('should throw if not sent first', () => {
      const notification = createTestNotification();

      expect(() => notification.markAsDelivered()).toThrow('Cannot deliver notification that was not sent');
    });
  });

  describe('markAsFailed', () => {
    it('should change status to failed with error', () => {
      const notification = createTestNotification();
      notification.clearDomainEvents();

      notification.markAsFailed('Connection timeout');

      expect(notification.status).toBe('failed');
      expect(notification.error).toBe('Connection timeout');
      expect(notification.failedAt).toBeDefined();
    });

    it('should emit NotificationFailedEvent', () => {
      const notification = createTestNotification();
      notification.clearDomainEvents();

      notification.markAsFailed('Error message');
      const events = notification.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationFailedEvent);
      expect((events[0] as NotificationFailedEvent).error).toBe('Error message');
    });

    it('should increment retry count', () => {
      const notification = createTestNotification();
      expect(notification.retryCount).toBe(0);

      notification.markAsFailed('Error 1');
      expect(notification.retryCount).toBe(1);

      // Reset to pending to allow another failure
      notification.resetForRetry();
      notification.markAsFailed('Error 2');
      expect(notification.retryCount).toBe(2);
    });
  });

  describe('markAsRead', () => {
    it('should change status to read for in_app notifications', () => {
      const notification = createTestNotification({ channel: 'in_app' });
      notification.markAsSent('msg-123');
      notification.markAsDelivered();
      notification.clearDomainEvents();

      notification.markAsRead();

      expect(notification.status).toBe('read');
      expect(notification.readAt).toBeDefined();
    });

    it('should emit NotificationReadEvent', () => {
      const notification = createTestNotification({ channel: 'in_app' });
      notification.markAsSent('msg-123');
      notification.markAsDelivered();
      notification.clearDomainEvents();

      notification.markAsRead();
      const events = notification.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationReadEvent);
    });

    it('should throw if not delivered first', () => {
      const notification = createTestNotification();

      expect(() => notification.markAsRead()).toThrow('Cannot mark as read a notification that was not delivered');
    });
  });

  describe('resetForRetry', () => {
    it('should reset status to pending after failure', () => {
      const notification = createTestNotification();
      notification.markAsFailed('Temporary error');

      notification.resetForRetry();

      expect(notification.status).toBe('pending');
    });

    it('should throw if not in failed status', () => {
      const notification = createTestNotification();

      expect(() => notification.resetForRetry()).toThrow('Can only retry failed notifications');
    });
  });

  describe('canRetry', () => {
    it('should return true if retry count is below max', () => {
      const notification = createTestNotification();
      notification.markAsFailed('Error');

      expect(notification.canRetry(3)).toBe(true);
    });

    it('should return false if retry count equals max', () => {
      const notification = createTestNotification();

      // Simulate 3 failures
      for (let i = 0; i < 3; i++) {
        notification.markAsFailed('Error');
        if (i < 2) notification.resetForRetry();
      }

      expect(notification.canRetry(3)).toBe(false);
    });

    it('should return false if status is not failed', () => {
      const notification = createTestNotification();
      notification.markAsSent('msg-123');

      expect(notification.canRetry(3)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize notification to plain object', () => {
      const notification = createTestNotification({
        subject: 'Test Subject',
        body: 'Test Body',
      });
      notification.markAsSent('msg-123');

      const json = notification.toJSON();

      expect(json.id).toBe(notification.id.value);
      expect(json.tenantId).toBe('tenant-123');
      expect(json.recipientId).toBe('user-456');
      expect(json.channel).toBe('in_app');
      expect(json.subject).toBe('Test Subject');
      expect(json.body).toBe('Test Body');
      expect(json.status).toBe('sent');
      expect(json.providerMessageId).toBe('msg-123');
    });
  });
});
