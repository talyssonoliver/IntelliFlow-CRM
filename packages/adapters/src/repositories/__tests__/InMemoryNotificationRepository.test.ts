/**
 * InMemoryNotificationRepository Tests
 *
 * Tests the in-memory implementation of the NotificationRepository interface.
 * Coverage target: >90% for repository layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNotificationRepository } from '../InMemoryNotificationRepository';
import {
  Notification,
  NotificationId,
} from '@intelliflow/domain';

describe('InMemoryNotificationRepository', () => {
  let repo: InMemoryNotificationRepository;

  const TENANT_ID = 'tenant-1';
  const RECIPIENT_ID = 'user-1';

  function createNotification(overrides: {
    id?: string;
    tenantId?: string;
    recipientId?: string;
    channel?: 'in_app' | 'email' | 'sms' | 'push' | 'webhook';
    priority?: 'high' | 'normal' | 'low';
    subject?: string;
    scheduledAt?: Date;
  } = {}): Notification {
    return Notification.create({
      id: NotificationId.create(overrides.id ?? `notif-${Math.random().toString(36).slice(2, 8)}`),
      tenantId: overrides.tenantId ?? TENANT_ID,
      recipientId: overrides.recipientId ?? RECIPIENT_ID,
      channel: overrides.channel ?? 'in_app',
      subject: overrides.subject ?? 'Test Notification',
      body: 'Test notification body',
      priority: overrides.priority ?? 'normal',
      scheduledAt: overrides.scheduledAt,
    });
  }

  beforeEach(() => {
    repo = new InMemoryNotificationRepository();
  });

  // ==========================================================
  // save() & findById()
  // ==========================================================
  describe('save() and findById()', () => {
    it('should save and retrieve a notification', async () => {
      const notif = createNotification({ id: 'n-1' });
      await repo.save(notif);

      const found = await repo.findById(NotificationId.create('n-1'));
      expect(found).not.toBeNull();
      expect(found!.subject).toBe('Test Notification');
    });

    it('should return null for non-existent notification', async () => {
      const found = await repo.findById(NotificationId.create('non-existent'));
      expect(found).toBeNull();
    });

    it('should overwrite on duplicate save', async () => {
      const notif = createNotification({ id: 'dup-1' });
      await repo.save(notif);

      // Mark as sent then save again
      notif.markAsSent('provider-msg-1');
      await repo.save(notif);

      const found = await repo.findById(NotificationId.create('dup-1'));
      expect(found!.status).toBe('sent');
    });
  });

  // ==========================================================
  // findByQuery()
  // ==========================================================
  describe('findByQuery()', () => {
    beforeEach(async () => {
      const base = new Date('2026-01-10T10:00:00Z');

      const n1 = createNotification({ id: 'q-1', channel: 'in_app', priority: 'high' });
      const n2 = createNotification({ id: 'q-2', channel: 'email', recipientId: 'user-2' });
      const n3 = createNotification({ id: 'q-3', channel: 'in_app', priority: 'low' });

      // We need to set different createdAt -- since Notification.create uses Date.now(),
      // we save them in quick succession and that's fine for ordering tests.
      await repo.save(n1);
      await repo.save(n2);
      await repo.save(n3);
    });

    it('should filter by tenantId', async () => {
      const results = await repo.findByQuery({ tenantId: TENANT_ID });
      expect(results.length).toBe(3);
    });

    it('should filter by recipientId', async () => {
      const results = await repo.findByQuery({ tenantId: TENANT_ID, recipientId: 'user-2' });
      expect(results.length).toBe(1);
    });

    it('should filter by channel', async () => {
      const results = await repo.findByQuery({ tenantId: TENANT_ID, channel: 'in_app' });
      expect(results.length).toBe(2);
    });

    it('should filter by single status', async () => {
      const results = await repo.findByQuery({ tenantId: TENANT_ID, status: 'pending' });
      expect(results.length).toBe(3); // all are pending initially
    });

    it('should filter by array of statuses', async () => {
      // Mark one as sent
      const n1 = await repo.findById(NotificationId.create('q-1'));
      n1!.markAsSent('provider-1');
      await repo.save(n1!);

      const results = await repo.findByQuery({
        tenantId: TENANT_ID,
        status: ['pending', 'sent'],
      });
      expect(results.length).toBe(3);

      const sentOnly = await repo.findByQuery({
        tenantId: TENANT_ID,
        status: ['sent'],
      });
      expect(sentOnly.length).toBe(1);
    });

    it('should filter by fromDate', async () => {
      // All notifications were created "now" so using a past date should include all
      const results = await repo.findByQuery({
        tenantId: TENANT_ID,
        fromDate: new Date('2020-01-01'),
      });
      expect(results.length).toBe(3);

      // A future date should exclude all
      const futureResults = await repo.findByQuery({
        tenantId: TENANT_ID,
        fromDate: new Date('2099-01-01'),
      });
      expect(futureResults.length).toBe(0);
    });

    it('should filter by toDate', async () => {
      // A future date should include all
      const results = await repo.findByQuery({
        tenantId: TENANT_ID,
        toDate: new Date('2099-01-01'),
      });
      expect(results.length).toBe(3);

      // A past date should exclude all
      const pastResults = await repo.findByQuery({
        tenantId: TENANT_ID,
        toDate: new Date('2020-01-01'),
      });
      expect(pastResults.length).toBe(0);
    });

    it('should sort by createdAt descending', async () => {
      const results = await repo.findByQuery({ tenantId: TENANT_ID });
      // The last saved should be first (most recent createdAt)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          results[i + 1].createdAt.getTime()
        );
      }
    });

    it('should apply offset and limit', async () => {
      const results = await repo.findByQuery({
        tenantId: TENANT_ID,
        offset: 1,
        limit: 1,
      });
      expect(results.length).toBe(1);
    });

    it('should default limit to 100 and offset to 0', async () => {
      const results = await repo.findByQuery({ tenantId: TENANT_ID });
      expect(results.length).toBe(3); // all fit in default 100 limit
    });

    it('should return empty for non-matching tenant', async () => {
      const results = await repo.findByQuery({ tenantId: 'no-tenant' });
      expect(results).toEqual([]);
    });
  });

  // ==========================================================
  // findPendingForDelivery()
  // ==========================================================
  describe('findPendingForDelivery()', () => {
    it('should return pending notifications for the tenant', async () => {
      const n1 = createNotification({ id: 'pd-1' });
      await repo.save(n1);

      const result = await repo.findPendingForDelivery(TENANT_ID);
      expect(result.length).toBe(1);
    });

    it('should exclude non-pending notifications', async () => {
      const n1 = createNotification({ id: 'pd-sent' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const result = await repo.findPendingForDelivery(TENANT_ID);
      expect(result.length).toBe(0);
    });

    it('should exclude future-scheduled notifications', async () => {
      const n1 = createNotification({
        id: 'pd-future',
        scheduledAt: new Date('2099-01-01'),
      });
      await repo.save(n1);

      const result = await repo.findPendingForDelivery(TENANT_ID);
      expect(result.length).toBe(0);
    });

    it('should include past-scheduled notifications', async () => {
      const n1 = createNotification({
        id: 'pd-past',
        scheduledAt: new Date('2020-01-01'),
      });
      await repo.save(n1);

      const result = await repo.findPendingForDelivery(TENANT_ID);
      expect(result.length).toBe(1);
    });

    it('should sort by priority then createdAt', async () => {
      const low = createNotification({ id: 'pd-low', priority: 'low' });
      const high = createNotification({ id: 'pd-high', priority: 'high' });
      const normal = createNotification({ id: 'pd-normal', priority: 'normal' });

      await repo.save(low);
      await repo.save(normal);
      await repo.save(high);

      const result = await repo.findPendingForDelivery(TENANT_ID);
      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBe('normal');
      expect(result[2].priority).toBe('low');
    });

    it('should apply limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(createNotification({ id: `pd-lim-${i}` }));
      }

      const result = await repo.findPendingForDelivery(TENANT_ID, 2);
      expect(result.length).toBe(2);
    });
  });

  // ==========================================================
  // findScheduledReadyToSend()
  // ==========================================================
  describe('findScheduledReadyToSend()', () => {
    it('should return scheduled notifications that are ready (scheduledAt <= now)', async () => {
      const n1 = createNotification({
        id: 'sched-ready',
        scheduledAt: new Date('2026-01-10T10:00:00Z'),
      });
      await repo.save(n1);

      const result = await repo.findScheduledReadyToSend(new Date('2026-01-10T12:00:00Z'));
      expect(result.length).toBe(1);
    });

    it('should exclude notifications without scheduledAt', async () => {
      const n1 = createNotification({ id: 'sched-no' }); // no scheduledAt
      await repo.save(n1);

      const result = await repo.findScheduledReadyToSend(new Date());
      expect(result.length).toBe(0);
    });

    it('should exclude notifications that are not pending', async () => {
      const n1 = createNotification({
        id: 'sched-sent',
        scheduledAt: new Date('2020-01-01'),
      });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const result = await repo.findScheduledReadyToSend(new Date());
      expect(result.length).toBe(0);
    });

    it('should sort by priority then scheduledAt', async () => {
      const low = createNotification({
        id: 'sr-low', priority: 'low',
        scheduledAt: new Date('2026-01-01'),
      });
      const high = createNotification({
        id: 'sr-high', priority: 'high',
        scheduledAt: new Date('2026-01-02'),
      });

      await repo.save(low);
      await repo.save(high);

      const result = await repo.findScheduledReadyToSend(new Date('2026-02-01'));
      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBe('low');
    });

    it('should apply limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(createNotification({
          id: `sr-lim-${i}`,
          scheduledAt: new Date('2020-01-01'),
        }));
      }

      const result = await repo.findScheduledReadyToSend(new Date(), 2);
      expect(result.length).toBe(2);
    });
  });

  // ==========================================================
  // findFailedForRetry()
  // ==========================================================
  describe('findFailedForRetry()', () => {
    it('should return failed notifications under max retries', async () => {
      const n1 = createNotification({ id: 'fail-1' });
      n1.markAsFailed('timeout');
      await repo.save(n1);

      const result = await repo.findFailedForRetry(3);
      expect(result.length).toBe(1);
    });

    it('should exclude notifications at or above max retries', async () => {
      const n1 = createNotification({ id: 'fail-max' });
      // Fail 3 times
      n1.markAsFailed('error 1');
      n1.resetForRetry();
      n1.markAsFailed('error 2');
      n1.resetForRetry();
      n1.markAsFailed('error 3');

      await repo.save(n1);

      const result = await repo.findFailedForRetry(3);
      expect(result.length).toBe(0);
    });

    it('should exclude non-failed notifications', async () => {
      const n1 = createNotification({ id: 'fail-pend' });
      await repo.save(n1); // pending, not failed

      const result = await repo.findFailedForRetry(3);
      expect(result.length).toBe(0);
    });

    it('should sort by priority then failedAt', async () => {
      const low = createNotification({ id: 'fr-low', priority: 'low' });
      low.markAsFailed('err');
      await repo.save(low);

      const high = createNotification({ id: 'fr-high', priority: 'high' });
      high.markAsFailed('err');
      await repo.save(high);

      const result = await repo.findFailedForRetry(5);
      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBe('low');
    });

    it('should apply limit', async () => {
      for (let i = 0; i < 5; i++) {
        const n = createNotification({ id: `fr-lim-${i}` });
        n.markAsFailed('err');
        await repo.save(n);
      }

      const result = await repo.findFailedForRetry(3, 2);
      expect(result.length).toBe(2);
    });
  });

  // ==========================================================
  // countUnread()
  // ==========================================================
  describe('countUnread()', () => {
    it('should return 0 when no notifications exist', async () => {
      const count = await repo.countUnread(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });

    it('should count in_app notifications that are sent or delivered and not read', async () => {
      const n1 = createNotification({ id: 'ur-1', channel: 'in_app' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const n2 = createNotification({ id: 'ur-2', channel: 'in_app' });
      n2.markAsSent('p-2');
      n2.markAsDelivered();
      await repo.save(n2);

      // Read one
      const n3 = createNotification({ id: 'ur-3', channel: 'in_app' });
      n3.markAsSent('p-3');
      n3.markAsDelivered();
      n3.markAsRead();
      await repo.save(n3);

      const count = await repo.countUnread(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(2);
    });

    it('should not count email notifications', async () => {
      const n1 = createNotification({ id: 'ur-email', channel: 'email' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const count = await repo.countUnread(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });

    it('should not count pending notifications', async () => {
      const n1 = createNotification({ id: 'ur-pend', channel: 'in_app' });
      await repo.save(n1); // still pending

      const count = await repo.countUnread(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });

    it('should scope by tenantId and recipientId', async () => {
      const n1 = createNotification({ id: 'ur-other', channel: 'in_app', recipientId: 'user-other' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const count = await repo.countUnread(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });
  });

  // ==========================================================
  // getRecentForRecipient()
  // ==========================================================
  describe('getRecentForRecipient()', () => {
    it('should return notifications for the given channel and recipient', async () => {
      const n1 = createNotification({ id: 'rr-1', channel: 'in_app' });
      const n2 = createNotification({ id: 'rr-2', channel: 'email' });
      const n3 = createNotification({ id: 'rr-3', channel: 'in_app' });

      await repo.save(n1);
      await repo.save(n2);
      await repo.save(n3);

      const result = await repo.getRecentForRecipient(TENANT_ID, RECIPIENT_ID, 'in_app');
      expect(result.length).toBe(2);
    });

    it('should sort by createdAt desc', async () => {
      const n1 = createNotification({ id: 'rr-sort-1', channel: 'in_app' });
      const n2 = createNotification({ id: 'rr-sort-2', channel: 'in_app' });

      await repo.save(n1);
      await repo.save(n2);

      const result = await repo.getRecentForRecipient(TENANT_ID, RECIPIENT_ID, 'in_app');
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          result[i + 1].createdAt.getTime()
        );
      }
    });

    it('should apply limit', async () => {
      for (let i = 0; i < 10; i++) {
        await repo.save(createNotification({ id: `rr-lim-${i}`, channel: 'in_app' }));
      }

      const result = await repo.getRecentForRecipient(TENANT_ID, RECIPIENT_ID, 'in_app', 3);
      expect(result.length).toBe(3);
    });

    it('should scope by tenantId', async () => {
      const n1 = createNotification({ id: 'rr-t1', channel: 'in_app', tenantId: 'other' });
      await repo.save(n1);

      const result = await repo.getRecentForRecipient(TENANT_ID, RECIPIENT_ID, 'in_app');
      expect(result.length).toBe(0);
    });
  });

  // ==========================================================
  // markAllAsRead()
  // ==========================================================
  describe('markAllAsRead()', () => {
    it('should mark all unread in_app sent/delivered notifications as read', async () => {
      const n1 = createNotification({ id: 'mar-1', channel: 'in_app' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const n2 = createNotification({ id: 'mar-2', channel: 'in_app' });
      n2.markAsSent('p-2');
      n2.markAsDelivered();
      await repo.save(n2);

      const count = await repo.markAllAsRead(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(2);

      // Verify they are now read
      const unread = await repo.countUnread(TENANT_ID, RECIPIENT_ID);
      expect(unread).toBe(0);
    });

    it('should not mark email notifications', async () => {
      const n1 = createNotification({ id: 'mar-email', channel: 'email' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const count = await repo.markAllAsRead(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });

    it('should not mark already-read notifications', async () => {
      const n1 = createNotification({ id: 'mar-already', channel: 'in_app' });
      n1.markAsSent('p-1');
      n1.markAsDelivered();
      n1.markAsRead();
      await repo.save(n1);

      const count = await repo.markAllAsRead(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });

    it('should not mark pending notifications', async () => {
      const n1 = createNotification({ id: 'mar-pend', channel: 'in_app' });
      await repo.save(n1);

      const count = await repo.markAllAsRead(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });

    it('should scope by tenantId and recipientId', async () => {
      const n1 = createNotification({ id: 'mar-other', channel: 'in_app', recipientId: 'user-other' });
      n1.markAsSent('p-1');
      await repo.save(n1);

      const count = await repo.markAllAsRead(TENANT_ID, RECIPIENT_ID);
      expect(count).toBe(0);
    });
  });

  // ==========================================================
  // deleteOlderThan()
  // ==========================================================
  describe('deleteOlderThan()', () => {
    it('should delete old notifications with eligible statuses', async () => {
      const n1 = createNotification({ id: 'del-1', channel: 'in_app' });
      n1.markAsSent('p-1');
      n1.markAsDelivered();
      n1.markAsRead();
      await repo.save(n1);

      // The createdAt is "now" so we delete older than "future"
      const count = await repo.deleteOlderThan(new Date('2099-01-01'));
      expect(count).toBe(1);
      expect(repo.count()).toBe(0);
    });

    it('should only delete read, delivered, or bounced notifications', async () => {
      // pending - should NOT be deleted
      const n1 = createNotification({ id: 'del-pend' });
      await repo.save(n1);

      // sent - should NOT be deleted
      const n2 = createNotification({ id: 'del-sent' });
      n2.markAsSent('p-1');
      await repo.save(n2);

      // delivered - SHOULD be deleted
      const n3 = createNotification({ id: 'del-delivered' });
      n3.markAsSent('p-2');
      n3.markAsDelivered();
      await repo.save(n3);

      const count = await repo.deleteOlderThan(new Date('2099-01-01'));
      expect(count).toBe(1);
      expect(repo.count()).toBe(2);
    });

    it('should not delete if createdAt is after the cutoff date', async () => {
      const n1 = createNotification({ id: 'del-new' });
      n1.markAsSent('p-1');
      n1.markAsDelivered();
      n1.markAsRead();
      await repo.save(n1);

      const count = await repo.deleteOlderThan(new Date('2020-01-01'));
      expect(count).toBe(0);
      expect(repo.count()).toBe(1);
    });

    it('should return 0 when repository is empty', async () => {
      const count = await repo.deleteOlderThan(new Date('2099-01-01'));
      expect(count).toBe(0);
    });
  });

  // ==========================================================
  // exists()
  // ==========================================================
  describe('exists()', () => {
    it('should return true for existing notification', async () => {
      const n1 = createNotification({ id: 'ex-1' });
      await repo.save(n1);

      const exists = await repo.exists(NotificationId.create('ex-1'));
      expect(exists).toBe(true);
    });

    it('should return false for non-existing notification', async () => {
      const exists = await repo.exists(NotificationId.create('nope'));
      expect(exists).toBe(false);
    });
  });

  // ==========================================================
  // Test helper methods
  // ==========================================================
  describe('test helpers', () => {
    it('clear() should empty the repository', async () => {
      await repo.save(createNotification({ id: 'h-1' }));
      expect(repo.count()).toBe(1);

      repo.clear();
      expect(repo.count()).toBe(0);
    });

    it('getAll() should return all notifications', async () => {
      await repo.save(createNotification({ id: 'h-1' }));
      await repo.save(createNotification({ id: 'h-2' }));

      const all = repo.getAll();
      expect(all.length).toBe(2);
    });

    it('count() should return the number of notifications', async () => {
      expect(repo.count()).toBe(0);
      await repo.save(createNotification({ id: 'h-c1' }));
      expect(repo.count()).toBe(1);
    });
  });
});
