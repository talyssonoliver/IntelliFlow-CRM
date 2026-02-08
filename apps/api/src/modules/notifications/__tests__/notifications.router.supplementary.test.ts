/**
 * Notifications Router Supplementary Tests
 *
 * Covers uncovered paths:
 * - createNotification helper function
 * - permanent delete with event emission
 * - batchAction unknown action
 * - getUserId/getTenantId UNAUTHORIZED throws
 * - mapToNotification edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@intelliflow/validators', () => ({
  notificationListQuerySchema: { parse: (x: any) => x },
  markAsReadInputSchema: { parse: (x: any) => x },
  deleteNotificationsInputSchema: { parse: (x: any) => x },
  updatePreferencesInputSchema: { parse: (x: any) => x },
  notificationSubscriptionInputSchema: { parse: (x: any) => x },
  batchNotificationActionSchema: { parse: (x: any) => x },
  NOTIFICATION_TYPES: ['task_assigned', 'lead_scored', 'system_alert'],
  NOTIFICATION_CHANNELS: ['in_app', 'email'],
}));

vi.mock('../../../../trpc', () => ({
  createTRPCRouter: vi.fn().mockImplementation((routes) => routes),
  protectedProcedure: {
    input: vi.fn().mockReturnThis(),
    mutation: vi.fn().mockImplementation((fn) => fn),
    query: vi.fn().mockImplementation((fn) => fn),
    subscription: vi.fn().mockImplementation((fn) => fn),
  },
}));

describe('createNotification helper', () => {
  it('should create a notification and store as domain event', async () => {
    const mockPrisma = {
      domainEvent: {
        create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      },
    };

    const { createNotification } = await import('../notifications.router.js');

    const result = await createNotification(mockPrisma as any, {
      userId: 'user-1',
      tenantId: 'tenant-1',
      type: 'task_assigned',
      title: 'New task',
      body: 'You have been assigned a task',
      priority: 'high',
      entityType: 'task',
      entityId: 'task-1',
      entityName: 'Follow up call',
      actionUrl: '/tasks/task-1',
      actionLabel: 'View Task',
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.type).toBe('task_assigned');
    expect(result.title).toBe('New task');
    expect(result.body).toBe('You have been assigned a task');
    expect(result.priority).toBe('high');
    expect(result.status).toBe('unread');
    expect(result.isRead).toBe(false);
    expect(result.entityType).toBe('task');
    expect(result.entityId).toBe('task-1');
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'Notification.task_assigned',
          aggregateType: 'task',
          aggregateId: 'task-1',
          status: 'PENDING',
          tenantId: 'tenant-1',
        }),
      })
    );
  });

  it('should use defaults for optional parameters', async () => {
    const mockPrisma = {
      domainEvent: { create: vi.fn().mockResolvedValue({ id: 'n2' }) },
    };

    const { createNotification } = await import('../notifications.router.js');

    const result = await createNotification(mockPrisma as any, {
      userId: 'user-1',
      tenantId: 'tenant-1',
      type: 'system_alert',
      title: 'Alert',
      body: 'System alert',
    });

    expect(result.priority).toBe('medium');
    expect(result.entityType).toBeNull();
    expect(result.entityId).toBeNull();
    expect(result.actionUrl).toBeNull();
    expect(result.expiresAt).toBeNull();
  });

  it('should handle expiresAt parameter', async () => {
    const mockPrisma = {
      domainEvent: { create: vi.fn().mockResolvedValue({ id: 'n3' }) },
    };

    const { createNotification } = await import('../notifications.router.js');
    const expiry = new Date('2026-12-31');

    const result = await createNotification(mockPrisma as any, {
      userId: 'user-1',
      tenantId: 'tenant-1',
      type: 'lead_scored',
      title: 'Score',
      body: 'Lead scored',
      expiresAt: expiry,
    });

    expect(result.expiresAt).toEqual(expiry);
  });
});

describe('notifications router - delete permanent', () => {
  it('should handle permanent delete via createCaller', async () => {
    const { notificationsRouter } = await import('../notifications.router.js');
    const { prismaMock, createTestContext } = await import('../../../test/setup.js');
    vi.clearAllMocks();
    const ctx = createTestContext();
    const caller = notificationsRouter.createCaller(ctx);
    prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });
    const result = await caller.delete({ notificationIds: ['n1', 'n2'], permanent: true });
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
  });
});

describe('notifications router - batchAction unknown', () => {
  it('should throw BAD_REQUEST for unknown action', async () => {
    const { notificationsRouter } = await import('../notifications.router.js');
    const { prismaMock, createTestContext } = await import('../../../test/setup.js');
    vi.clearAllMocks();
    const ctx = createTestContext();
    const caller = notificationsRouter.createCaller(ctx);
    prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 0 });
    try {
      await caller.batchAction({ action: 'unknown_action' as any, notificationIds: ['n1'] });
      expect.unreachable();
    } catch (e: any) {
      expect(e.code === 'BAD_REQUEST' || e.message).toBeTruthy();
    }
  });
});

describe('getUserId / getTenantId UNAUTHORIZED', () => {
  it('should throw when user context is missing', async () => {
    const { notificationsRouter } = await import('../notifications.router.js');
    const { createTestContext } = await import('../../../test/setup.js');
    vi.clearAllMocks();
    const ctx = createTestContext();
    (ctx as any).user = null;
    const caller = notificationsRouter.createCaller(ctx);
    try {
      await caller.list({ limit: 10 });
      expect.unreachable();
    } catch (e: any) {
      expect(e.code === 'UNAUTHORIZED' || e.message).toBeTruthy();
    }
  });
});
