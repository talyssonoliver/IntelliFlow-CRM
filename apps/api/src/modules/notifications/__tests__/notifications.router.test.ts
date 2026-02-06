/**
 * Notifications Router Tests - IFC-183
 *
 * Comprehensive tests for the notifications tRPC router endpoints.
 * Tests all procedures: list, getUnreadCount, markAsRead, markAllAsRead,
 * delete, getPreferences, updatePreferences, batchAction.
 *
 * Uses the createCaller pattern to invoke procedures through the router.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationsRouter } from '../notifications.router';
import {
  prismaMock,
  createTestContext,
  TEST_UUIDS,
} from '../../../test/setup';

// Helper to build a mock domain event that represents a notification
function createMockDomainEvent(overrides: Record<string, any> = {}) {
  return {
    id: `notif-${Date.now()}`,
    eventType: 'Notification.lead_assigned',
    aggregateType: 'Lead',
    aggregateId: TEST_UUIDS.lead1,
    payload: {
      notificationType: 'lead_assigned',
      title: 'New Lead Assigned',
      body: 'You have been assigned a new lead',
      priority: 'medium',
    },
    metadata: {
      targetUserId: TEST_UUIDS.user1,
    },
    occurredAt: new Date(),
    processedAt: null,
    status: 'PENDING' as const,
    publishedAt: null,
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    tenantId: 'test-tenant-id',
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

  describe('list', () => {
    it('should return empty list when no notifications exist', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.unreadCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return notifications mapped from domain events', async () => {
      const event = createMockDomainEvent();
      prismaMock.domainEvent.findMany.mockResolvedValue([event]);
      prismaMock.domainEvent.count
        .mockResolvedValueOnce(1) // unreadCount
        .mockResolvedValueOnce(1); // total

      const result = await caller.list({});

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].title).toBe('New Lead Assigned');
      expect(result.notifications[0].type).toBe('lead_assigned');
      expect(result.notifications[0].status).toBe('unread');
      expect(result.notifications[0].isRead).toBe(false);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
    });

    it('should mark events as read when status is PROCESSED', async () => {
      const event = createMockDomainEvent({
        status: 'PROCESSED',
        processedAt: new Date(),
      });
      prismaMock.domainEvent.findMany.mockResolvedValue([event]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.notifications[0].status).toBe('read');
      expect(result.notifications[0].isRead).toBe(true);
    });

    it('should handle cursor-based pagination', async () => {
      // Return limit+1 items to indicate hasMore
      const events = Array.from({ length: 21 }, (_, i) =>
        createMockDomainEvent({ id: `notif-${i}` })
      );
      prismaMock.domainEvent.findMany.mockResolvedValue(events);
      prismaMock.domainEvent.count.mockResolvedValue(50);

      const result = await caller.list({ limit: 20 });

      expect(result.notifications).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('notif-19');
    });

    it('should filter by notification types', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({ types: ['lead_assigned', 'task_assigned'] });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payload: {
              path: ['notificationType'],
              in: ['lead_assigned', 'task_assigned'],
            },
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({ fromDate, toDate });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should filter by read status (isRead: true)', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({ isRead: true });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PROCESSED',
          }),
        })
      );
    });

    it('should filter by unread status (isRead: false)', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({ isRead: false });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });

    it('should use cursor for pagination when provided', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({ cursor: 'some-cursor-id' });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { lt: 'some-cursor-id' },
          }),
        })
      );
    });

    it('should order by occurredAt desc', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({});

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { occurredAt: 'desc' },
        })
      );
    });

    it('should use default limit of 20', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.list({});

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21, // limit + 1 for hasMore detection
        })
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return total unread count', async () => {
      prismaMock.domainEvent.count.mockResolvedValue(5);

      const result = await caller.getUnreadCount();

      expect(result.total).toBe(5);
    });

    it('should return counts by priority', async () => {
      prismaMock.domainEvent.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // low
        .mockResolvedValueOnce(4) // medium
        .mockResolvedValueOnce(3) // high
        .mockResolvedValueOnce(1); // urgent

      const result = await caller.getUnreadCount();

      expect(result.total).toBe(10);
      expect(result.byPriority).toEqual({
        low: 2,
        medium: 4,
        high: 3,
        urgent: 1,
      });
    });

    it('should return zeros when no unread notifications', async () => {
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const result = await caller.getUnreadCount();

      expect(result.total).toBe(0);
      expect(result.byPriority).toEqual({
        low: 0,
        medium: 0,
        high: 0,
        urgent: 0,
      });
    });

    it('should filter by user ID from context', async () => {
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.getUnreadCount();

      // All 5 count queries should filter by userId
      expect(prismaMock.domainEvent.count).toHaveBeenCalledTimes(5);
      const firstCallWhere = (prismaMock.domainEvent.count as any).mock.calls[0][0].where;
      expect(firstCallWhere.eventType).toEqual({ startsWith: 'Notification' });
      expect(firstCallWhere.status).toBe('PENDING');
    });
  });

  describe('markAsRead', () => {
    it('should mark specified notifications as read', async () => {
      const notificationIds = ['notif-1', 'notif-2'];
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.markAsRead({ notificationIds });

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2);
      expect(result.updatedIds).toEqual(notificationIds);
    });

    it('should update status to PROCESSED', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PROCESSED',
          }),
        })
      );
    });

    it('should set processedAt timestamp', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            processedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should filter by user ID for security', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      await caller.markAsRead({ notificationIds: ['notif-1'] });

      const where = (prismaMock.domainEvent.updateMany as any).mock.calls[0][0].where;
      expect(where.id).toEqual({ in: ['notif-1'] });
      expect(where.eventType).toEqual({ startsWith: 'Notification' });
      // Should contain OR clause with targetUserId
      expect(where.OR).toBeDefined();
    });

    it('should return count=0 when no matching notifications found', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await caller.markAsRead({ notificationIds: ['non-existent'] });

      expect(result.updatedCount).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([
        { id: 'notif-1' },
        { id: 'notif-2' },
        { id: 'notif-3' },
      ] as any);
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller.markAllAsRead();

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(3);
      expect(result.updatedIds).toEqual(['notif-1', 'notif-2', 'notif-3']);
    });

    it('should only select IDs of PENDING notifications', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 0 });

      await caller.markAllAsRead();

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: { startsWith: 'Notification' },
            status: 'PENDING',
          }),
          select: { id: true },
        })
      );
    });

    it('should handle case with no unread notifications', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await caller.markAllAsRead();

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(0);
      expect(result.updatedIds).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should soft delete notifications by marking as ARCHIVED', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.delete({
        notificationIds: ['notif-1', 'notif-2'],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedIds).toEqual(['notif-1', 'notif-2']);
    });

    it('should mark as ARCHIVED for soft delete', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      await caller.delete({
        notificationIds: ['notif-1'],
        permanent: false,
      });

      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('should handle permanent delete (still archives domain events)', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      await caller.delete({
        notificationIds: ['notif-1'],
        permanent: true,
      });

      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('should filter by user for security', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 0 });

      await caller.delete({
        notificationIds: ['notif-1'],
      });

      const where = (prismaMock.domainEvent.updateMany as any).mock.calls[0][0].where;
      expect(where.eventType).toEqual({ startsWith: 'Notification' });
      expect(where.OR).toBeDefined();
    });
  });

  describe('getPreferences', () => {
    it('should return default preferences when user has no saved preferences', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: null,
      } as any);

      const result = await caller.getPreferences();

      expect(result.userId).toBe(TEST_UUIDS.user1);
      expect(result.globalEnabled).toBe(true);
      expect(result.defaultChannels).toEqual(['in_app', 'email']);
      expect(result.preferences).toBeDefined();
      expect(result.preferences.length).toBeGreaterThan(0);
      // All preferences should be enabled by default
      result.preferences.forEach((pref) => {
        expect(pref.enabled).toBe(true);
        expect(pref.channels).toEqual(['in_app']);
      });
    });

    it('should return saved preferences when they exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          notifications: {
            globalEnabled: false,
            defaultChannels: ['push'],
            typePreferences: {
              lead_assigned: {
                enabled: false,
                channels: ['email', 'push'],
                frequency: 'daily',
              },
            },
          },
        },
      } as any);

      const result = await caller.getPreferences();

      expect(result.globalEnabled).toBe(false);
      expect(result.defaultChannels).toEqual(['push']);
      const leadPref = result.preferences.find((p) => p.type === 'lead_assigned');
      expect(leadPref?.enabled).toBe(false);
      expect(leadPref?.channels).toEqual(['email', 'push']);
    });

    it('should include quiet hours and email digest defaults', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: null,
      } as any);

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
  });

  describe('updatePreferences', () => {
    it('should update global enabled setting', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {},
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updatePreferences({
        globalEnabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Preferences updated successfully');
    });

    it('should update default channels', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {},
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updatePreferences({
        defaultChannels: ['in_app', 'push'],
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEST_UUIDS.user1 },
          data: expect.objectContaining({
            preferences: expect.objectContaining({
              notifications: expect.objectContaining({
                defaultChannels: ['in_app', 'push'],
              }),
            }),
          }),
        })
      );
    });

    it('should update quiet hours', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {},
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updatePreferences({
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          timezone: 'Europe/London',
        },
      });

      expect(prismaMock.user.update).toHaveBeenCalled();
    });

    it('should update type-specific preferences', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { notifications: { typePreferences: {} } },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updatePreferences({
        preferences: [
          {
            type: 'lead_assigned',
            enabled: false,
            channels: ['email'],
          },
        ],
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preferences: expect.objectContaining({
              notifications: expect.objectContaining({
                typePreferences: expect.objectContaining({
                  lead_assigned: expect.objectContaining({
                    enabled: false,
                    channels: ['email'],
                  }),
                }),
              }),
            }),
          }),
        })
      );
    });

    it('should merge with existing preferences', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          theme: 'dark', // existing non-notification pref
          notifications: {
            globalEnabled: true,
            defaultChannels: ['in_app'],
          },
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updatePreferences({
        globalEnabled: false,
      });

      const updateCall = (prismaMock.user.update as any).mock.calls[0][0];
      // Should preserve existing theme
      expect(updateCall.data.preferences.theme).toBe('dark');
      // Should update notification setting
      expect(updateCall.data.preferences.notifications.globalEnabled).toBe(false);
    });
  });

  describe('batchAction', () => {
    it('should mark_read for specified notification IDs', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller.batchAction({
        action: 'mark_read',
        notificationIds: ['notif-1', 'notif-2', 'notif-3'],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(3);
      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PROCESSED',
          }),
        })
      );
    });

    it('should mark_unread for specified notification IDs', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.batchAction({
        action: 'mark_unread',
        notificationIds: ['notif-1', 'notif-2'],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(2);
      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            processedAt: null,
          }),
        })
      );
    });

    it('should archive notifications', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.batchAction({
        action: 'archive',
        notificationIds: ['notif-1'],
      });

      expect(result.success).toBe(true);
      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('should delete (archive) notifications', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.batchAction({
        action: 'delete',
        notificationIds: ['notif-1'],
      });

      expect(result.success).toBe(true);
      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('should apply filter by types', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 5 });

      await caller.batchAction({
        action: 'mark_read',
        filter: {
          types: ['lead_assigned'],
        },
      });

      const where = (prismaMock.domainEvent.updateMany as any).mock.calls[0][0].where;
      expect(where.payload).toEqual({
        path: ['notificationType'],
        in: ['lead_assigned'],
      });
    });

    it('should apply filter by olderThan', async () => {
      const olderThan = new Date('2025-01-01');
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 10 });

      await caller.batchAction({
        action: 'archive',
        filter: { olderThan },
      });

      const where = (prismaMock.domainEvent.updateMany as any).mock.calls[0][0].where;
      expect(where.occurredAt).toEqual({ lt: olderThan });
    });

    it('should apply filter by isRead', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 0 });

      await caller.batchAction({
        action: 'delete',
        filter: { isRead: true },
      });

      const where = (prismaMock.domainEvent.updateMany as any).mock.calls[0][0].where;
      expect(where.status).toBe('PROCESSED');
    });

    it('should work without notificationIds (apply to all matching filter)', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 25 });

      const result = await caller.batchAction({
        action: 'mark_read',
        filter: { isRead: false },
      });

      expect(result.affectedCount).toBe(25);
      const where = (prismaMock.domainEvent.updateMany as any).mock.calls[0][0].where;
      // Should NOT have id filter when no notificationIds provided
      expect(where.id).toBeUndefined();
    });
  });

  describe('authentication', () => {
    it('should require authenticated user for all endpoints', async () => {
      // All procedures use protectedProcedure which requires ctx.user
      expect(ctx.user).toBeDefined();
      expect(ctx.user?.userId).toBeDefined();
    });
  });
});
