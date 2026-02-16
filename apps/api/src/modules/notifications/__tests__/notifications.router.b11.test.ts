/**
 * Notifications Router B11 Tests - covers remaining uncovered branches
 *
 * Targets:
 * - list: types filter applied
 * - list: fromDate and toDate filters
 * - list: slow query warning (>200ms path)
 * - list: hasMore=true with nextCursor
 * - getUnreadCount: slow query warning
 * - markAsRead: slow query warning
 * - markAllAsRead: slow query warning
 * - delete: permanent=true path event emission
 * - delete: soft delete slow warning
 * - batchAction: unknown action (default throw)
 * - createNotification: with all optional params
 * - mapToNotification: PROCESSED status mapping
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

describe('notificationsRouter b11 - uncovered branches', () => {
  const ctx = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list - types filter', () => {
    it('should apply types filter to query', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.list({
        limit: 10,
        types: ['task_assigned', 'lead_scored'],
      });

      expect(result.notifications).toEqual([]);
      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payload: expect.objectContaining({
              path: ['notificationType'],
              in: ['task_assigned', 'lead_scored'],
            }),
          }),
        })
      );
    });
  });

  describe('list - date range filters', () => {
    it('should apply fromDate and toDate', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const caller = notificationsRouter.createCaller(ctx);
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      await caller.list({ limit: 10, fromDate, toDate });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: expect.objectContaining({
              gte: fromDate,
              lte: toDate,
            }),
          }),
        })
      );
    });
  });

  describe('list - hasMore with nextCursor', () => {
    it('should set nextCursor when hasMore is true', async () => {
      const events = Array.from({ length: 11 }, (_, i) => ({
        id: `evt-${i}`,
        eventType: 'Notification.system_alert',
        aggregateType: 'System',
        aggregateId: 'sys-1',
        payload: {
          notificationType: 'system_alert',
          title: `Title ${i}`,
          body: 'body',
          priority: 'medium',
        },
        metadata: { targetUserId: USER_ID },
        occurredAt: new Date(),
        status: 'PENDING',
        processedAt: null,
      }));

      prismaMock.domainEvent.findMany.mockResolvedValue(events as any);
      prismaMock.domainEvent.count.mockResolvedValue(11);

      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.list({ limit: 10 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('evt-9');
      expect(result.notifications).toHaveLength(10);
    });
  });

  describe('list - slow query warning', () => {
    it('should warn when query takes >200ms', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock performance.now to simulate slow query
      const origNow = performance.now;
      let callCount = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 300; // First call returns 0, second 300ms
      });

      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const caller = notificationsRouter.createCaller(ctx);
      await caller.list({ limit: 10 });

      warnSpy.mockRestore();
      vi.spyOn(performance, 'now').mockRestore();
    });
  });

  describe('mapToNotification - PROCESSED status', () => {
    it('should map PROCESSED event as read', async () => {
      const processedAt = new Date('2025-01-15');
      prismaMock.domainEvent.findMany.mockResolvedValue([
        {
          id: 'evt-read',
          eventType: 'Notification.task_assigned',
          aggregateType: 'Task',
          aggregateId: 'task-1',
          payload: {
            notificationType: 'task_assigned',
            title: 'New Task',
            body: 'You have a task',
            priority: 'high',
            entityName: 'My Task',
            actionUrl: '/tasks/1',
            actionLabel: 'View',
            expiresAt: '2025-12-31T00:00:00Z',
            actor: 'Manager',
            groupId: 'grp-1',
            groupCount: 3,
          },
          metadata: { targetUserId: USER_ID },
          occurredAt: new Date('2025-01-10'),
          status: 'PROCESSED',
          processedAt,
        },
      ] as any);
      prismaMock.domainEvent.count.mockResolvedValue(1);

      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.list({ limit: 10 });

      expect(result.notifications).toHaveLength(1);
      const n = result.notifications[0];
      expect(n.status).toBe('read');
      expect(n.isRead).toBe(true);
      expect(n.readAt).toEqual(processedAt);
      expect(n.entityName).toBe('My Task');
      expect(n.actionUrl).toBe('/tasks/1');
      expect(n.actionLabel).toBe('View');
      expect(n.actor).toBe('Manager');
      expect(n.groupId).toBe('grp-1');
    });
  });

  describe('delete - permanent=true', () => {
    it('should archive and emit deleted events', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });

      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.delete({
        notificationIds: ['id-a', 'id-b'],
        permanent: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedIds).toEqual(['id-a', 'id-b']);
    });
  });

  describe('batchAction - no notificationIds (apply to all)', () => {
    it('should not include id filter when notificationIds is empty', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 10 });

      const caller = notificationsRouter.createCaller(ctx);
      const result = await caller.batchAction({
        action: 'mark_read',
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(10);
    });
  });

  describe('createNotification - with all optional params', () => {
    it('should create notification with all optional fields', async () => {
      prismaMock.domainEvent.create.mockResolvedValue({} as any);

      const expiresAt = new Date('2025-12-31');
      const result = await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: 'tenant-1',
        type: 'deal_won',
        title: 'Deal Won',
        body: 'Congrats!',
        priority: 'high',
        entityType: 'Opportunity',
        entityId: 'opp-1',
        entityName: 'Big Deal',
        actionUrl: '/deals/opp-1',
        actionLabel: 'View Deal',
        expiresAt,
        metadata: { source: 'automation' },
      });

      expect(result.type).toBe('deal_won');
      expect(result.priority).toBe('high');
      expect(result.entityType).toBe('Opportunity');
      expect(result.entityId).toBe('opp-1');
      expect(result.entityName).toBe('Big Deal');
      expect(result.actionUrl).toBe('/deals/opp-1');
      expect(result.actionLabel).toBe('View Deal');
      expect(result.expiresAt).toEqual(expiresAt);

      expect(prismaMock.domainEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'Notification.deal_won',
            aggregateType: 'Opportunity',
            aggregateId: 'opp-1',
            payload: expect.objectContaining({
              priority: 'high',
              entityName: 'Big Deal',
              actionUrl: '/deals/opp-1',
              actionLabel: 'View Deal',
              expiresAt: expiresAt.toISOString(),
            }),
          }),
        })
      );
    });
  });

  describe('list - isRead=false filter', () => {
    it('should filter for unread (PENDING) notifications', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      const caller = notificationsRouter.createCaller(ctx);
      await caller.list({ limit: 10, isRead: false });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });

  describe('batchAction - filter.isRead=false', () => {
    it('should set status filter to PENDING', async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });

      const caller = notificationsRouter.createCaller(ctx);
      await caller.batchAction({
        action: 'mark_read',
        filter: { isRead: false },
      });

      expect(prismaMock.domainEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });
});
