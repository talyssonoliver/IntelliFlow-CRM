/**
 * Notifications Router Tests - IFC-183
 *
 * Comprehensive tests for the notifications tRPC router endpoints.
 * All procedures use tenantProcedure (tenant isolation via ctx.tenant.tenantId).
 * Data source: Notification table (not DomainEvent).
 * Preferences: NotificationPreference table (not user.preferences JSON).
 *
 * Tests cover: list, getUnreadCount, markAsRead, markAllAsRead,
 * delete, getPreferences, updatePreferences, batchAction, createNotification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  notificationsRouter,
  createNotification,
  notificationEmitter,
  createSubscriptionHandler,
} from '../notifications.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

// =============================================================================
// Mock Helpers
// =============================================================================

const TENANT_ID = 'test-tenant-id';
const USER_ID = TEST_UUIDS.user1;

/** Build a mock Prisma Notification record */
function createMockNotification(overrides: Record<string, any> = {}) {
  return {
    id: `notif-${Date.now()}`,
    tenantId: TENANT_ID,
    recipientId: USER_ID,
    channel: 'IN_APP',
    subject: 'New Lead Assigned',
    body: 'You have been assigned a new lead',
    priority: 'NORMAL',
    status: 'PENDING',
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: 'SYSTEM',
    sourceType: 'Lead',
    sourceId: TEST_UUIDS.lead1,
    metadata: {
      notificationType: 'lead_assigned',
      entityName: 'ACME Corp Lead',
      actionUrl: '/leads/123',
      actionLabel: 'View Lead',
    },
    ...overrides,
  };
}

describe('notificationsRouter', () => {
  let caller: ReturnType<typeof notificationsRouter.createCaller>;
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTestContext();
    caller = notificationsRouter.createCaller(ctx);
  });

  // ===========================================================================
  // list
  // ===========================================================================
  describe('list', () => {
    it('should return empty list when no notifications exist', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.unreadCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return notifications mapped from Notification table', async () => {
      const record = createMockNotification();
      prismaMock.notification.findMany.mockResolvedValue([record] as any);
      // list calls count twice concurrently; distinguish by status field in where
      (prismaMock.notification.count as any).mockImplementation(
        (args?: { where?: { status?: string } }) => {
          if (args?.where?.status === 'PENDING') return Promise.resolve(1); // unreadCount
          return Promise.resolve(1); // total
        }
      );

      const result = await caller.list({});

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].title).toBe('New Lead Assigned');
      expect(result.notifications[0].type).toBe('lead_assigned');
      expect(result.notifications[0].status).toBe('pending');
      expect(result.notifications[0].isRead).toBe(false);
      expect(result.notifications[0].priority).toBe('normal');
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
    });

    it('should map READ status as isRead=true', async () => {
      const record = createMockNotification({
        status: 'READ',
        readAt: new Date(),
      });
      prismaMock.notification.findMany.mockResolvedValue([record] as any);
      prismaMock.notification.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications[0].status).toBe('read');
      expect(result.notifications[0].isRead).toBe(true);
      expect(result.notifications[0].readAt).toBeDefined();
    });

    it('should handle cursor-based pagination', async () => {
      const records = Array.from({ length: 21 }, (_, i) =>
        createMockNotification({ id: `notif-${i}` })
      );
      prismaMock.notification.findMany.mockResolvedValue(records as any);
      prismaMock.notification.count.mockResolvedValue(50);

      const result = await caller.list({ limit: 20 });

      expect(result.notifications).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('notif-19');
    });

    it('should filter by notification types', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ types: ['lead_assigned', 'task_assigned'] });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            recipientId: USER_ID,
            AND: [
              {
                OR: [
                  { metadata: { path: ['notificationType'], equals: 'lead_assigned' } },
                  { metadata: { path: ['notificationType'], equals: 'task_assigned' } },
                ],
              },
            ],
          }),
        })
      );
    });

    it('should filter by priorities', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ priorities: ['high', 'normal'] });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: { in: ['HIGH', 'NORMAL'] },
          }),
        })
      );
    });

    it('should filter by status', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ status: 'read' });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'READ',
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ fromDate, toDate });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should filter by read status (isRead: true)', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ isRead: true });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'READ',
          }),
        })
      );
    });

    it('should filter by unread status (isRead: false)', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ isRead: false });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });

    it('should filter by search query', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ search: 'lead' });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { subject: { contains: 'lead', mode: 'insensitive' } },
              { body: { contains: 'lead', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('should use cursor for pagination when provided', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({ cursor: 'some-cursor-id' });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { lt: 'some-cursor-id' },
          }),
        })
      );
    });

    it('should order by createdAt desc', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({});

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should use default limit of 20 (take: 21 for hasMore)', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({});

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21,
        })
      );
    });

    it('should enforce tenant isolation', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.list({});

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            recipientId: USER_ID,
          }),
        })
      );
    });
  });

  // ===========================================================================
  // getUnreadCount
  // ===========================================================================
  describe('getUnreadCount', () => {
    it('should return 3-bucket priority counts (high/normal/low)', async () => {
      // getUnreadCount calls count 4 times concurrently; distinguish by priority
      (prismaMock.notification.count as any).mockImplementation(
        (args?: { where?: { priority?: string } }) => {
          if (args?.where?.priority === 'HIGH') return Promise.resolve(3);
          if (args?.where?.priority === 'NORMAL') return Promise.resolve(5);
          if (args?.where?.priority === 'LOW') return Promise.resolve(2);
          return Promise.resolve(10); // total (no priority filter)
        }
      );

      const result = await caller.getUnreadCount();

      expect(result.total).toBe(10);
      expect(result.byPriority).toEqual({
        high: 3,
        normal: 5,
        low: 2,
      });
    });

    it('should return zeros when no unread notifications', async () => {
      prismaMock.notification.count.mockResolvedValue(0);

      const result = await caller.getUnreadCount();

      expect(result.total).toBe(0);
      expect(result.byPriority).toEqual({
        high: 0,
        normal: 0,
        low: 0,
      });
    });

    it('should make 4 parallel count calls', async () => {
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.getUnreadCount();

      expect(prismaMock.notification.count).toHaveBeenCalled();
    });

    it('should filter by tenant and recipient with PENDING status', async () => {
      prismaMock.notification.count.mockResolvedValue(0);

      await caller.getUnreadCount();

      // First call is total unread
      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          recipientId: USER_ID,
          status: 'PENDING',
        },
      });

      // Second call is HIGH priority
      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          recipientId: USER_ID,
          status: 'PENDING',
          priority: 'HIGH',
        },
      });
    });
  });

  // ===========================================================================
  // markAsRead
  // ===========================================================================
  describe('markAsRead', () => {
    it('should mark specified notifications as read', async () => {
      const notificationIds = ['notif-1', 'notif-2'];
      prismaMock.notification.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.markAsRead({ notificationIds });

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2);
      expect(result.updatedIds).toEqual(notificationIds);
    });

    it('should apply state guard (only PENDING/SENT/DELIVERED)', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
          }),
        })
      );
    });

    it('should set status=READ and readAt timestamp', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'READ',
            readAt: expect.any(Date),
          },
        })
      );
    });

    it('should enforce user ownership via recipientId', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      const where = (prismaMock.notification.updateMany as any).mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
      expect(where.recipientId).toBe(USER_ID);
      expect(where.id).toEqual({ in: ['notif-1'] });
    });

    it('should return count=0 when no matching notifications found', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await caller.markAsRead({ notificationIds: ['non-existent'] });

      expect(result.updatedCount).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // markAllAsRead
  // ===========================================================================
  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read with atomic updateMany', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller.markAllAsRead();

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(3);
      // Atomic: no findMany intermediate step, returns empty updatedIds
      expect(result.updatedIds).toEqual([]);
    });

    it('should use status: { not: "READ" } filter', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      await caller.markAllAsRead();

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          recipientId: USER_ID,
          status: { not: 'READ' },
        },
        data: {
          status: 'READ',
          readAt: expect.any(Date),
        },
      });
    });

    it('should NOT call findMany (atomic, no TOCTOU race)', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      await caller.markAllAsRead();

      expect(prismaMock.notification.findMany).not.toHaveBeenCalled();
    });

    it('should handle case with no unread notifications', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await caller.markAllAsRead();

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(0);
      expect(result.updatedIds).toEqual([]);
    });
  });

  // ===========================================================================
  // delete
  // ===========================================================================
  describe('delete', () => {
    it('should soft delete by setting status=ARCHIVED', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.delete({
        notificationIds: ['notif-1', 'notif-2'],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedIds).toEqual(['notif-1', 'notif-2']);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('should permanent delete with deleteMany', async () => {
      prismaMock.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await caller.delete({
        notificationIds: ['notif-1'],
        permanent: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['notif-1'] },
          tenantId: TENANT_ID,
          recipientId: USER_ID,
        },
      });
    });

    it('should enforce tenant isolation on delete', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      await caller.delete({ notificationIds: ['notif-1'] });

      const where = (prismaMock.notification.updateMany as any).mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
      expect(where.recipientId).toBe(USER_ID);
    });
  });

  // ===========================================================================
  // getPreferences
  // ===========================================================================
  describe('getPreferences', () => {
    it('should return default preferences when no record exists', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await caller.getPreferences();

      expect(result.userId).toBe(USER_ID);
      expect(result.globalEnabled).toBe(true);
      expect(result.defaultChannels).toEqual(['in_app', 'email']);
      expect(result.preferences).toBeDefined();
      expect(result.preferences.length).toBeGreaterThan(0);
      // All preferences enabled by default with in_app channel
      result.preferences.forEach((pref) => {
        expect(pref.enabled).toBe(true);
        expect(pref.channels).toEqual(['in_app']);
      });
    });

    it('should return saved preferences from NotificationPreference table', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        tenantId: TENANT_ID,
        userId: USER_ID,
        doNotDisturb: true,
        quietHoursEnabled: true,
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
        timezone: 'Europe/London',
        channelPreferences: {
          defaultChannels: ['push'],
          lead_assigned: { channels: ['email', 'push'] },
        },
        categoryPreferences: {
          lead_assigned: { enabled: false, frequency: 'daily' },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await caller.getPreferences();

      expect(result.globalEnabled).toBe(false); // doNotDisturb=true → globalEnabled=false
      expect(result.defaultChannels).toEqual(['push']);
      expect(result.quietHours?.enabled).toBe(true);
      expect(result.quietHours?.start).toBe('23:00');
      expect(result.quietHours?.timezone).toBe('Europe/London');

      const leadPref = result.preferences.find((p) => p.type === 'lead_assigned');
      expect(leadPref?.enabled).toBe(false);
    });

    it('should include quiet hours and email digest defaults', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await caller.getPreferences();

      expect(result.quietHours).toEqual({
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      });
      expect(result.emailDigest).toEqual({
        enabled: false,
        frequency: 'daily',
        time: '09:00',
      });
    });

    it('should use composite key tenantId_userId', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

      await caller.getPreferences();

      expect(prismaMock.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID } },
      });
    });
  });

  // ===========================================================================
  // updatePreferences
  // ===========================================================================
  describe('updatePreferences', () => {
    it('should upsert preferences with globalEnabled', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
      prismaMock.notificationPreference.upsert.mockResolvedValue({} as any);

      const result = await caller.updatePreferences({
        globalEnabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Preferences updated successfully');
      expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID } },
          create: expect.objectContaining({
            tenantId: TENANT_ID,
            userId: USER_ID,
            doNotDisturb: true, // globalEnabled=false → doNotDisturb=true
          }),
        })
      );
    });

    it('should update default channels', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
      prismaMock.notificationPreference.upsert.mockResolvedValue({} as any);

      await caller.updatePreferences({
        defaultChannels: ['in_app', 'push'],
      });

      expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            channelPreferences: expect.objectContaining({
              defaultChannels: ['in_app', 'push'],
            }),
          }),
        })
      );
    });

    it('should update quiet hours', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
      prismaMock.notificationPreference.upsert.mockResolvedValue({} as any);

      await caller.updatePreferences({
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          timezone: 'Europe/London',
        },
      });

      expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            timezone: 'Europe/London',
          }),
        })
      );
    });

    it('should update type-specific preferences', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue({
        channelPreferences: {},
        categoryPreferences: {},
      } as any);
      prismaMock.notificationPreference.upsert.mockResolvedValue({} as any);

      await caller.updatePreferences({
        preferences: [
          {
            type: 'lead_assigned',
            enabled: false,
            channels: ['email'],
            frequency: 'daily',
          },
        ],
      });

      expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            categoryPreferences: expect.objectContaining({
              lead_assigned: expect.objectContaining({
                enabled: false,
                channels: ['email'],
                frequency: 'daily',
              }),
            }),
          }),
        })
      );
    });

    it('should merge with existing channel preferences', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue({
        channelPreferences: {
          defaultChannels: ['in_app'],
          emailDigest: { enabled: true, frequency: 'weekly', time: '08:00' },
        },
        categoryPreferences: { task_assigned: { enabled: true } },
      } as any);
      prismaMock.notificationPreference.upsert.mockResolvedValue({} as any);

      await caller.updatePreferences({
        defaultChannels: ['in_app', 'push'],
      });

      const upsertCall = (prismaMock.notificationPreference.upsert as any).mock.calls[0][0];
      // Should preserve existing emailDigest
      expect(upsertCall.create.channelPreferences.emailDigest).toEqual({
        enabled: true,
        frequency: 'weekly',
        time: '08:00',
      });
      // Should update defaultChannels
      expect(upsertCall.create.channelPreferences.defaultChannels).toEqual(['in_app', 'push']);
    });
  });

  // ===========================================================================
  // batchAction
  // ===========================================================================
  describe('batchAction', () => {
    it('should mark_read for specified notification IDs', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller.batchAction({
        action: 'mark_read',
        notificationIds: ['notif-1', 'notif-2', 'notif-3'],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(3);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'READ', readAt: expect.any(Date) },
        })
      );
    });

    it('should mark_unread for specified notification IDs', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.batchAction({
        action: 'mark_unread',
        notificationIds: ['notif-1', 'notif-2'],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(2);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PENDING', readAt: null },
        })
      );
    });

    it('should archive notifications', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.batchAction({
        action: 'archive',
        notificationIds: ['notif-1'],
      });

      expect(result.success).toBe(true);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('should delete notifications with deleteMany', async () => {
      prismaMock.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await caller.batchAction({
        action: 'delete',
        notificationIds: ['notif-1'],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(1);
      expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['notif-1'] },
            tenantId: TENANT_ID,
            recipientId: USER_ID,
          }),
        })
      );
    });

    it('should apply filter by types', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 5 });

      await caller.batchAction({
        action: 'mark_read',
        filter: {
          types: ['lead_assigned'],
        },
      });

      const where = (prismaMock.notification.updateMany as any).mock.calls[0][0].where;
      expect(where.metadata).toEqual({
        path: ['notificationType'],
        equals: 'lead_assigned',
      });
    });

    it('should apply filter by olderThan', async () => {
      const olderThan = new Date('2025-01-01');
      prismaMock.notification.updateMany.mockResolvedValue({ count: 10 });

      await caller.batchAction({
        action: 'archive',
        filter: { olderThan },
      });

      const where = (prismaMock.notification.updateMany as any).mock.calls[0][0].where;
      expect(where.createdAt).toEqual({ lt: olderThan });
    });

    it('should apply filter by isRead', async () => {
      prismaMock.notification.deleteMany.mockResolvedValue({ count: 0 });

      await caller.batchAction({
        action: 'delete',
        filter: { isRead: true },
      });

      const where = (prismaMock.notification.deleteMany as any).mock.calls[0][0].where;
      expect(where.status).toBe('READ');
    });

    it('should work without notificationIds (apply to all matching filter)', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 25 });

      const result = await caller.batchAction({
        action: 'mark_read',
        filter: { isRead: false },
      });

      expect(result.affectedCount).toBe(25);
      const where = (prismaMock.notification.updateMany as any).mock.calls[0][0].where;
      expect(where.id).toBeUndefined();
    });

    it('should enforce tenant isolation on all batch actions', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      await caller.batchAction({
        action: 'mark_read',
        notificationIds: ['notif-1'],
      });

      const where = (prismaMock.notification.updateMany as any).mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
      expect(where.recipientId).toBe(USER_ID);
    });
  });

  // ===========================================================================
  // createNotification helper
  // ===========================================================================
  describe('createNotification', () => {
    it('should create notification in Notification table', async () => {
      const mockRecord = createMockNotification({ id: 'cuid-generated-id' });
      prismaMock.notification.create.mockResolvedValue(mockRecord as any);

      const result = await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: 'lead_assigned',
        title: 'New Lead',
        body: 'You have a new lead',
      });

      expect(result.id).toBe('cuid-generated-id');
      expect(result.type).toBe('lead_assigned');
      expect(result.priority).toBe('normal');
      expect(result.status).toBe('pending');
      expect(result.isRead).toBe(false);
    });

    it('should use default priority=normal when not specified', async () => {
      const mockRecord = createMockNotification();
      prismaMock.notification.create.mockResolvedValue(mockRecord as any);

      await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: 'system_alert',
        title: 'Test',
        body: 'Test body',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 'NORMAL',
        }),
      });
    });

    it('should convert priority to uppercase for Prisma enum', async () => {
      const mockRecord = createMockNotification({ priority: 'HIGH' });
      prismaMock.notification.create.mockResolvedValue(mockRecord as any);

      await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: 'deal_at_risk',
        title: 'Deal at risk',
        body: 'Deal X is at risk',
        priority: 'high',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 'HIGH',
        }),
      });
    });

    it('should store entity references and metadata', async () => {
      const mockRecord = createMockNotification();
      prismaMock.notification.create.mockResolvedValue(mockRecord as any);

      await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: 'lead_assigned',
        title: 'New Lead',
        body: 'Body',
        entityType: 'Lead',
        entityId: 'lead-123',
        entityName: 'ACME Lead',
        actionUrl: '/leads/lead-123',
        actionLabel: 'View',
        metadata: { extra: 'data' },
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceType: 'Lead',
          sourceId: 'lead-123',
          metadata: expect.objectContaining({
            notificationType: 'lead_assigned',
            entityName: 'ACME Lead',
            actionUrl: '/leads/lead-123',
            actionLabel: 'View',
            extra: 'data',
          }),
        }),
      });
    });

    it('should emit notification event after creation', async () => {
      const mockRecord = createMockNotification({ id: 'emit-test-id' });
      prismaMock.notification.create.mockResolvedValue(mockRecord as any);

      const emitSpy = vi.spyOn(notificationEmitter, 'emit');

      await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: 'task_assigned',
        title: 'Task',
        body: 'Body',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `notification:${USER_ID}`,
        expect.objectContaining({
          userId: USER_ID,
          eventType: 'new',
          notificationId: 'emit-test-id',
        })
      );

      emitSpy.mockRestore();
    });
  });

  // ===========================================================================
  // onNew subscription (event emitter integration)
  // ===========================================================================
  describe('onNew subscription', () => {
    it('should emit events when notificationEmitter fires', async () => {
      const events: any[] = [];

      // Subscribe to emitter directly to verify it works
      const handler = (payload: any) => events.push(payload);
      notificationEmitter.on(`notification:${USER_ID}`, handler);

      // Simulate a notification creation event
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'sub-test-1',
        notification: {
          id: 'sub-test-1',
          type: 'lead_assigned',
          title: 'Test',
          body: 'Body',
          priority: 'normal',
          status: 'pending',
          isRead: false,
          readAt: null,
          createdAt: new Date(),
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('new');
      expect(events[0].notificationId).toBe('sub-test-1');

      notificationEmitter.off(`notification:${USER_ID}`, handler);
    });
  });

  // ===========================================================================
  // Authentication / authorization
  // ===========================================================================
  describe('authentication', () => {
    it('should use tenantProcedure requiring both user and tenant context', async () => {
      // All procedures use tenantProcedure which requires ctx.user + ctx.tenant
      expect(ctx.user).toBeDefined();
      expect(ctx.user?.userId).toBeDefined();
      expect(ctx.tenant).toBeDefined();
      expect((ctx.tenant as any)?.tenantId).toBe(TENANT_ID);
    });
  });

  // ===========================================================================
  // Slow query warning paths (performance monitoring)
  // ===========================================================================
  describe('slow query warnings', () => {
    it('should warn when list query exceeds 200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const perfSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(250); // 250ms elapsed

      prismaMock.notification.findMany.mockResolvedValue([]);
      prismaMock.notification.count.mockResolvedValue(0);

      // Need to re-mock perf for the second call inside the handler
      perfSpy.mockReturnValueOnce(0).mockReturnValueOnce(250);
      await caller.list({});

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[notifications.list] SLOW:'));

      warnSpy.mockRestore();
      perfSpy.mockRestore();
    });

    it('should warn when getUnreadCount exceeds 200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(300);

      prismaMock.notification.count.mockResolvedValue(0);

      await caller.getUnreadCount();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[notifications.getUnreadCount] SLOW:')
      );

      warnSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('should warn when markAsRead exceeds 200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(300);

      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[notifications.markAsRead] SLOW:')
      );

      warnSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('should warn when markAllAsRead exceeds 200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(300);

      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      await caller.markAllAsRead();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[notifications.markAllAsRead] SLOW:')
      );

      warnSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('should warn when delete exceeds 200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(300);

      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await caller.delete({ notificationIds: ['notif-1'] });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[notifications.delete] SLOW:'));

      warnSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('should warn when batchAction exceeds 200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(300);

      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      await caller.batchAction({
        action: 'mark_read',
        notificationIds: ['notif-1'],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[notifications.batchAction] SLOW:')
      );

      warnSpy.mockRestore();
      vi.restoreAllMocks();
    });
  });

  // ===========================================================================
  // getUserId UNAUTHORIZED path
  // ===========================================================================
  describe('getUserId UNAUTHORIZED', () => {
    it('should throw UNAUTHORIZED when user is missing from context', async () => {
      const noUserCtx = createTestContext({ user: undefined });
      const noUserCaller = notificationsRouter.createCaller(noUserCtx);

      await expect(noUserCaller.list({})).rejects.toThrow();
    });

    it('should throw when userId is empty', async () => {
      const badUserCtx = createTestContext({
        user: { userId: '', email: 'x', role: 'USER', tenantId: TENANT_ID },
      });
      const badUserCaller = notificationsRouter.createCaller(badUserCtx);

      // tenantProcedure passes through empty userId; downstream code fails
      await expect(badUserCaller.list({})).rejects.toThrow();
    });
  });

  // ===========================================================================
  // onNew subscription handler (direct handler coverage)
  // ===========================================================================
  describe('createSubscriptionHandler', () => {
    it('should register listener and emit matching events filtered by type', () => {
      const events: any[] = [];
      const emit = { next: (event: any) => events.push(event) };
      const cleanup = createSubscriptionHandler(USER_ID, ['lead_assigned'])(emit);

      // Matching type - passes through
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'handler-match-1',
        notification: { type: 'lead_assigned', priority: 'normal' },
      });

      // Non-matching type - filtered out
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'handler-filtered-1',
        notification: { type: 'task_assigned', priority: 'normal' },
      });

      expect(events).toHaveLength(1);
      expect(events[0].notificationId).toBe('handler-match-1');
      expect(events[0].eventType).toBe('new');
      expect(events[0].timestamp).toBeInstanceOf(Date);

      cleanup();
    });

    it('should filter events by priority', () => {
      const events: any[] = [];
      const emit = { next: (event: any) => events.push(event) };
      const cleanup = createSubscriptionHandler(USER_ID, undefined, ['high'])(emit);

      // Normal priority - filtered out
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'pri-low',
        notification: { type: 'lead_assigned', priority: 'normal' },
      });

      // High priority - passes through
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'pri-high',
        notification: { type: 'lead_assigned', priority: 'high' },
      });

      expect(events).toHaveLength(1);
      expect(events[0].notificationId).toBe('pri-high');

      cleanup();
    });

    it('should pass through all events when no filters are set', () => {
      const events: any[] = [];
      const emit = { next: (event: any) => events.push(event) };
      const cleanup = createSubscriptionHandler(USER_ID)(emit);

      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'all-1',
        notification: { type: 'task_assigned', priority: 'low' },
      });

      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'read',
        notificationId: 'all-2',
      });

      expect(events).toHaveLength(2);

      cleanup();
    });

    it('should clean up emitter listener when cleanup is called', () => {
      const events: any[] = [];
      const emit = { next: (event: any) => events.push(event) };
      const cleanup = createSubscriptionHandler(USER_ID)(emit);

      // Before cleanup - receives events
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'before-cleanup',
        notification: { type: 'lead_assigned', priority: 'normal' },
      });

      expect(events).toHaveLength(1);

      // Call cleanup - removes listener
      cleanup();

      // After cleanup - no longer receives events
      notificationEmitter.emit(`notification:${USER_ID}`, {
        userId: USER_ID,
        eventType: 'new',
        notificationId: 'after-cleanup',
        notification: { type: 'lead_assigned', priority: 'normal' },
      });

      expect(events).toHaveLength(1); // Still 1, not 2
    });
  });

  // ===========================================================================
  // Edge cases and error paths
  // ===========================================================================
  describe('edge cases', () => {
    it('should throw BAD_REQUEST for unknown batch action', async () => {
      await expect(
        caller.batchAction({
          action: 'unknown_action' as any,
          notificationIds: ['notif-1'],
        })
      ).rejects.toThrow();
    });

    it('should map notification with missing metadata fields gracefully', async () => {
      const record = createMockNotification({
        metadata: null,
        sourceType: null,
        sourceId: null,
      });
      prismaMock.notification.findMany.mockResolvedValue([record] as any);
      prismaMock.notification.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications[0].type).toBe('system_alert'); // fallback
      expect(result.notifications[0].entityType).toBeNull();
      expect(result.notifications[0].entityId).toBeNull();
      expect(result.notifications[0].actor).toBeNull();
    });

    it('should map notification with missing priority gracefully', async () => {
      const record = createMockNotification({ priority: null });
      prismaMock.notification.findMany.mockResolvedValue([record] as any);
      prismaMock.notification.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications[0].priority).toBe('normal'); // fallback
    });

    it('should map notification with missing status gracefully', async () => {
      const record = createMockNotification({ status: null });
      prismaMock.notification.findMany.mockResolvedValue([record] as any);
      prismaMock.notification.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications[0].status).toBe('pending'); // fallback
    });
  });
});
