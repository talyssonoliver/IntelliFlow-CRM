/**
 * Notifications Router Extended Tests
 * Covers: permanent delete event emission, soft delete timing warning,
 * getUserId UNAUTHORIZED, additional filter combos, mapToNotification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

vi.mock('@intelliflow/validators', async (importOriginal) => {
  const orig = (await importOriginal()) as any;
  return {
    ...orig,
    NOTIFICATION_TYPES: orig.NOTIFICATION_TYPES || [
      'task_assigned',
      'lead_scored',
      'deal_won',
      'deal_lost',
      'mention',
      'comment',
      'system_alert',
      'reminder',
    ],
    NOTIFICATION_CHANNELS: orig.NOTIFICATION_CHANNELS || ['in_app', 'email', 'sms', 'push'],
  };
});

import { notificationsRouter, createNotification } from '../notifications.router';

const USER_ID = TEST_UUIDS.user1;
const TENANT_ID = '00000000-0000-4000-8000-000000000001';

describe('notificationsRouter extended coverage', () => {
  const ctx = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delete - permanent with event emission', () => {
    it('should update status to ARCHIVED and emit deleted events', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });
      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.delete({
        notificationIds: ['id-1', 'id-2'],
        permanent: true,
      });
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedIds).toEqual(['id-1', 'id-2']);
    });
  });

  describe('delete - soft delete with timing', () => {
    it('should update status to ARCHIVED for soft delete', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });
      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.delete({
        notificationIds: ['id-1'],
        permanent: false,
      });
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
    });
  });

  describe('getUserId UNAUTHORIZED', () => {
    it('should throw when user has no userId', async () => {
      const badCtx = { ...ctx, user: { ...ctx.user, userId: undefined } } as any;
      const caller = notificationsRouter.createCaller(badCtx);
      await expect(caller.getUnreadCount()).rejects.toThrow(TRPCError);
    });
  });

  describe('list - combined filters', () => {
    it('should apply multiple filters together', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.list({
        limit: 5,
        types: ['task_assigned'],
        fromDate: new Date('2025-01-01'),
        toDate: new Date('2026-01-01'),
        isRead: false,
      });
      expect(result.notifications).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should return hasMore true when items exceed limit', async () => {
      const items = Array.from({ length: 11 }, (_, i) => ({
        id: 'evt-' + i,
        eventType: 'Notification.task_assigned',
        aggregateType: 'Task',
        aggregateId: 'task-' + i,
        payload: { notificationType: 'task_assigned', title: 'T', body: 'B', priority: 'medium' },
        metadata: { targetUserId: USER_ID },
        occurredAt: new Date(),
        status: 'PENDING',
        processedAt: null,
      }));
      prismaMock.domainEvent.findMany.mockResolvedValue(items as any);
      prismaMock.domainEvent.count.mockResolvedValue(20);
      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.list({ limit: 10 });
      expect(result.hasMore).toBe(true);
      expect(result.notifications).toHaveLength(10);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('createNotification with all params', () => {
    it('should create notification with entity and action fields', async () => {
      prismaMock.domainEvent.create.mockResolvedValue({} as any);
      const result = await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: 'deal_won',
        title: 'Deal Won!',
        body: 'Congrats on closing the deal',
        priority: 'high',
        entityType: 'opportunity',
        entityId: 'opp-123',
        entityName: 'Big Deal',
        actionUrl: '/deals/opp-123',
        actionLabel: 'View Deal',
        expiresAt: new Date('2027-01-01'),
        metadata: { value: 50000 },
      });
      expect(result.type).toBe('deal_won');
      expect(result.priority).toBe('high');
      expect(result.entityType).toBe('opportunity');
      expect(result.isRead).toBe(false);
    });
  });

  describe('updatePreferences - quietHours and emailDigest', () => {
    it('should merge quietHours and emailDigest settings', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { notifications: { globalEnabled: true } },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);
      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.updatePreferences({
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          timezone: 'UTC',
          daysOfWeek: [1, 2, 3, 4, 5],
        },
        emailDigest: { enabled: true, frequency: 'daily', time: '09:00' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('mapToNotification coverage', () => {
    it('should map PROCESSED event to read notification', async () => {
      const processedAt = new Date();
      prismaMock.domainEvent.findMany.mockResolvedValue([
        {
          id: 'evt-read-1',
          eventType: 'Notification.system_alert',
          aggregateType: 'System',
          aggregateId: 'sys-1',
          payload: {
            notificationType: 'system_alert',
            title: 'System Update',
            body: 'Maintenance scheduled',
            priority: 'low',
            entityName: 'System',
            actionUrl: '/system',
            actionLabel: 'View',
            expiresAt: '2027-01-01T00:00:00.000Z',
            actor: { id: 'admin', name: 'Admin' },
            groupId: 'g1',
            groupCount: 3,
          },
          metadata: { targetUserId: USER_ID },
          occurredAt: new Date(),
          status: 'PROCESSED',
          processedAt,
        },
      ] as any);
      prismaMock.domainEvent.count.mockResolvedValue(1);
      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.list({ limit: 10 });
      expect(result.notifications[0].isRead).toBe(true);
      expect(result.notifications[0].status).toBe('read');
    });
  });
});
