/**
 * PrismaNotificationRepository Tests
 * Tests for the Prisma-based notification repository implementation.
 *
 * @see IFC-157: Notification service MVP
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaNotificationRepository } from '../PrismaNotificationRepository';
import {
  Notification,
  NotificationId,
} from '@intelliflow/domain';

// ==================== Mock Setup ====================

function createMockPrisma() {
  return {
    notification: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

function createDbRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-123',
    tenantId: 'tenant-1',
    recipientId: 'user-1',
    recipientEmail: 'user@example.com',
    recipientPhone: null,
    channel: 'IN_APP' as const,
    subject: 'Test Notification',
    body: 'This is a test notification',
    htmlBody: null,
    priority: 'NORMAL' as const,
    status: 'PENDING' as const,
    templateId: null,
    templateVariables: null,
    metadata: null,
    providerMessageId: null,
    error: null,
    retryCount: 0,
    scheduledAt: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    createdAt: new Date('2025-01-15T10:00:00Z'),
    updatedAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  };
}

function createNotification(overrides: Partial<{
  id: string;
  tenantId: string;
  recipientId: string;
  channel: 'in_app' | 'email' | 'sms' | 'push' | 'webhook';
  subject: string;
  body: string;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read' | 'bounced';
  scheduledAt: Date;
}> = {}): Notification {
  return Notification.reconstitute(
    NotificationId.create(overrides.id ?? 'notif-123'),
    {
      tenantId: overrides.tenantId ?? 'tenant-1',
      recipientId: overrides.recipientId ?? 'user-1',
      recipientEmail: 'user@example.com',
      channel: overrides.channel ?? 'in_app',
      subject: overrides.subject ?? 'Test Notification',
      body: overrides.body ?? 'This is a test notification',
      priority: overrides.priority ?? 'normal',
      status: overrides.status ?? 'pending',
      retryCount: 0,
      scheduledAt: overrides.scheduledAt,
      createdAt: new Date('2025-01-15T10:00:00Z'),
      updatedAt: new Date('2025-01-15T10:00:00Z'),
    }
  );
}

// ==================== Tests ====================

describe('PrismaNotificationRepository', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let repository: PrismaNotificationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    repository = new PrismaNotificationRepository(mockPrisma as any);
  });

  describe('save', () => {
    it('should upsert a notification', async () => {
      const notification = createNotification();
      mockPrisma.notification.upsert.mockResolvedValue(createDbRecord());

      await repository.save(notification);

      expect(mockPrisma.notification.upsert).toHaveBeenCalledWith({
        where: { id: 'notif-123' },
        create: expect.objectContaining({
          id: 'notif-123',
          tenantId: 'tenant-1',
          recipientId: 'user-1',
          channel: 'IN_APP',
          subject: 'Test Notification',
          body: 'This is a test notification',
          priority: 'NORMAL',
          status: 'PENDING',
        }),
        update: expect.objectContaining({
          tenantId: 'tenant-1',
          channel: 'IN_APP',
          status: 'PENDING',
        }),
      });
    });

    it('should map all domain channels to DB channels', async () => {
      const channels = ['in_app', 'email', 'sms', 'push', 'webhook'] as const;
      const expectedDb = ['IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WEBHOOK'];

      for (let i = 0; i < channels.length; i++) {
        vi.clearAllMocks();
        const notification = createNotification({ id: `notif-${i}`, channel: channels[i] });
        mockPrisma.notification.upsert.mockResolvedValue(createDbRecord());

        await repository.save(notification);

        const createArg = mockPrisma.notification.upsert.mock.calls[0][0].create;
        expect(createArg.channel).toBe(expectedDb[i]);
      }
    });

    it('should map all domain statuses to DB statuses', async () => {
      const statuses = ['pending', 'sent', 'delivered', 'failed', 'read', 'bounced'] as const;
      const expectedDb = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ', 'BOUNCED'];

      for (let i = 0; i < statuses.length; i++) {
        vi.clearAllMocks();
        const notification = createNotification({ id: `notif-${i}`, status: statuses[i] });
        mockPrisma.notification.upsert.mockResolvedValue(createDbRecord());

        await repository.save(notification);

        const createArg = mockPrisma.notification.upsert.mock.calls[0][0].create;
        expect(createArg.status).toBe(expectedDb[i]);
      }
    });

    it('should map all domain priorities to DB priorities', async () => {
      const priorities = ['high', 'normal', 'low'] as const;
      const expectedDb = ['HIGH', 'NORMAL', 'LOW'];

      for (let i = 0; i < priorities.length; i++) {
        vi.clearAllMocks();
        const notification = createNotification({ id: `notif-${i}`, priority: priorities[i] });
        mockPrisma.notification.upsert.mockResolvedValue(createDbRecord());

        await repository.save(notification);

        const createArg = mockPrisma.notification.upsert.mock.calls[0][0].create;
        expect(createArg.priority).toBe(expectedDb[i]);
      }
    });
  });

  describe('findById', () => {
    it('should return domain entity when record found', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(createDbRecord());

      const result = await repository.findById(NotificationId.create('notif-123'));

      expect(result).not.toBeNull();
      expect(result!.id.value).toBe('notif-123');
      expect(result!.tenantId).toBe('tenant-1');
      expect(result!.recipientId).toBe('user-1');
      expect(result!.channel).toBe('in_app');
      expect(result!.status).toBe('pending');
      expect(result!.priority).toBe('normal');
      expect(result!.subject).toBe('Test Notification');
    });

    it('should return null when record not found', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(null);

      const result = await repository.findById(NotificationId.create('nonexistent'));

      expect(result).toBeNull();
    });

    it('should correctly map all DB enum values back to domain', async () => {
      const record = createDbRecord({
        channel: 'EMAIL',
        status: 'DELIVERED',
        priority: 'HIGH',
        recipientEmail: 'test@example.com',
        recipientPhone: '+1234567890',
        htmlBody: '<b>Test</b>',
        templateId: 'tmpl-1',
        templateVariables: { name: 'John' },
        metadata: { source: 'api' },
        providerMessageId: 'provider-123',
        error: 'Some error',
        sentAt: new Date('2025-01-15T10:05:00Z'),
        deliveredAt: new Date('2025-01-15T10:06:00Z'),
        readAt: new Date('2025-01-15T10:10:00Z'),
        failedAt: null,
        scheduledAt: new Date('2025-01-15T09:00:00Z'),
      });
      mockPrisma.notification.findUnique.mockResolvedValue(record);

      const result = await repository.findById(NotificationId.create('notif-123'));

      expect(result!.channel).toBe('email');
      expect(result!.status).toBe('delivered');
      expect(result!.priority).toBe('high');
      expect(result!.recipientEmail).toBe('test@example.com');
      expect(result!.recipientPhone).toBe('+1234567890');
      expect(result!.htmlBody).toBe('<b>Test</b>');
      expect(result!.templateId).toBe('tmpl-1');
      expect(result!.templateVariables).toEqual({ name: 'John' });
      expect(result!.metadata).toEqual({ source: 'api' });
      expect(result!.providerMessageId).toBe('provider-123');
      expect(result!.error).toBe('Some error');
    });

    it('should map null optional fields to undefined', async () => {
      const record = createDbRecord();
      mockPrisma.notification.findUnique.mockResolvedValue(record);

      const result = await repository.findById(NotificationId.create('notif-123'));

      expect(result!.recipientPhone).toBeUndefined();
      expect(result!.htmlBody).toBeUndefined();
      expect(result!.templateId).toBeUndefined();
      expect(result!.providerMessageId).toBeUndefined();
      expect(result!.error).toBeUndefined();
      expect(result!.scheduledAt).toBeUndefined();
      expect(result!.sentAt).toBeUndefined();
      expect(result!.deliveredAt).toBeUndefined();
      expect(result!.readAt).toBeUndefined();
      expect(result!.failedAt).toBeUndefined();
    });
  });

  describe('findByQuery', () => {
    it('should query by tenantId only', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([createDbRecord()]);

      const result = await repository.findByQuery({ tenantId: 'tenant-1' });

      expect(result).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        skip: 0,
      });
    });

    it('should query with recipientId filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', recipientId: 'user-1' });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ recipientId: 'user-1' }),
        })
      );
    });

    it('should query with channel filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', channel: 'email' });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channel: 'EMAIL' }),
        })
      );
    });

    it('should query with single status filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', status: 'pending' } as any);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        })
      );
    });

    it('should query with array status filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', status: ['pending', 'sent'] as any });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['PENDING', 'SENT'] } }),
        })
      );
    });

    it('should query with date range filter', async () => {
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-01-31');
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', fromDate, toDate });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should query with fromDate only', async () => {
      const fromDate = new Date('2025-01-01');
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', fromDate });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: fromDate },
          }),
        })
      );
    });

    it('should query with toDate only', async () => {
      const toDate = new Date('2025-01-31');
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', toDate });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: toDate },
          }),
        })
      );
    });

    it('should respect limit and offset', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findByQuery({ tenantId: 'tenant-1', limit: 50, offset: 10 });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 10,
        })
      );
    });

    it('should map multiple records to domain entities', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        createDbRecord({ id: 'notif-1' }),
        createDbRecord({ id: 'notif-2' }),
        createDbRecord({ id: 'notif-3' }),
      ]);

      const result = await repository.findByQuery({ tenantId: 'tenant-1' });

      expect(result).toHaveLength(3);
      expect(result[0].id.value).toBe('notif-1');
      expect(result[1].id.value).toBe('notif-2');
      expect(result[2].id.value).toBe('notif-3');
    });
  });

  describe('findPendingForDelivery', () => {
    it('should find pending notifications ready for delivery', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([createDbRecord()]);

      const result = await repository.findPendingForDelivery('tenant-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: 'PENDING',
          OR: [
            { scheduledAt: null },
            { scheduledAt: { lte: expect.any(Date) } },
          ],
        },
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'asc' },
        ],
        take: 100,
      });
    });

    it('should respect custom limit', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findPendingForDelivery('tenant-1', 50);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });
  });

  describe('findScheduledReadyToSend', () => {
    it('should find scheduled notifications ready to send', async () => {
      const now = new Date('2025-01-15T12:00:00Z');
      mockPrisma.notification.findMany.mockResolvedValue([
        createDbRecord({ scheduledAt: new Date('2025-01-15T11:00:00Z') }),
      ]);

      const result = await repository.findScheduledReadyToSend(now);

      expect(result).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          scheduledAt: {
            not: null,
            lte: now,
          },
        },
        orderBy: [
          { priority: 'asc' },
          { scheduledAt: 'asc' },
        ],
        take: 100,
      });
    });

    it('should respect custom limit', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findScheduledReadyToSend(new Date(), 25);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 })
      );
    });
  });

  describe('findFailedForRetry', () => {
    it('should find failed notifications with retryCount under max', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        createDbRecord({ status: 'FAILED', retryCount: 1 }),
      ]);

      const result = await repository.findFailedForRetry(3);

      expect(result).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          status: 'FAILED',
          retryCount: { lt: 3 },
        },
        orderBy: [
          { priority: 'asc' },
          { failedAt: 'asc' },
        ],
        take: 100,
      });
    });

    it('should respect custom limit', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.findFailedForRetry(3, 10);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });
  });

  describe('countUnread', () => {
    it('should count unread in-app notifications', async () => {
      mockPrisma.notification.count.mockResolvedValue(5);

      const result = await repository.countUnread('tenant-1', 'user-1');

      expect(result).toBe(5);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          recipientId: 'user-1',
          channel: 'IN_APP',
          status: { in: ['SENT', 'DELIVERED'] },
          readAt: null,
        },
      });
    });

    it('should return 0 when no unread', async () => {
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await repository.countUnread('tenant-1', 'user-1');

      expect(result).toBe(0);
    });
  });

  describe('getRecentForRecipient', () => {
    it('should get recent notifications for a recipient and channel', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        createDbRecord({ id: 'notif-1' }),
        createDbRecord({ id: 'notif-2' }),
      ]);

      const result = await repository.getRecentForRecipient('tenant-1', 'user-1', 'email');

      expect(result).toHaveLength(2);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          recipientId: 'user-1',
          channel: 'EMAIL',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should respect custom limit', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await repository.getRecentForRecipient('tenant-1', 'user-1', 'in_app', 10);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all in-app notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await repository.markAllAsRead('tenant-1', 'user-1');

      expect(result).toBe(3);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          recipientId: 'user-1',
          channel: 'IN_APP',
          status: { in: ['SENT', 'DELIVERED'] },
          readAt: null,
        },
        data: {
          status: 'READ',
          readAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should return 0 when no notifications to update', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.markAllAsRead('tenant-1', 'user-1');

      expect(result).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old processed notifications', async () => {
      const date = new Date('2024-01-01');
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 50 });

      const result = await repository.deleteOlderThan(date);

      expect(result).toBe(50);
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: date },
          status: { in: ['READ', 'DELIVERED', 'BOUNCED'] },
        },
      });
    });

    it('should return 0 when nothing to delete', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      const result = await repository.deleteOlderThan(new Date());

      expect(result).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true when notification exists', async () => {
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await repository.exists(NotificationId.create('notif-123'));

      expect(result).toBe(true);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { id: 'notif-123' },
      });
    });

    it('should return false when notification does not exist', async () => {
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await repository.exists(NotificationId.create('nonexistent'));

      expect(result).toBe(false);
    });
  });
});
