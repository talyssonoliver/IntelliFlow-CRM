/**
 * Audit Router Tests
 *
 * Comprehensive tests for audit router procedures:
 * - search: Search audit logs (Manager/Admin only)
 * - getByResource: Get audit trail for a specific resource
 * - getMyActivity: Get current user's activity log
 * - getSecurityEvents: Get security events (Admin only)
 * - getStats: Get audit statistics (Admin only)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { auditRouter } from '../audit.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  TEST_UUIDS,
} from '../../../test/setup';
import type { Context } from '../../../context';

describe('Audit Router', () => {
  // Create a manager context
  function createManagerContext(overrides?: Partial<Context>): Context {
    return createTestContext({
      user: {
        userId: TEST_UUIDS.user1,
        email: 'manager@example.com',
        role: 'MANAGER',
      },
      ...overrides,
    });
  }

  // Mock audit log data
  const mockAuditLog = {
    id: 'audit-log-1',
    userId: TEST_UUIDS.user1,
    action: 'CREATE',
    entityType: 'lead',
    entityId: TEST_UUIDS.lead1,
    oldValue: null,
    newValue: JSON.stringify({ name: 'New Lead' }),
    ipAddress: '192.168.1.1',
    userAgent: 'Test Agent',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    user: {
      id: TEST_UUIDS.user1,
      email: 'test@example.com',
      name: 'Test User',
    },
  };

  const mockAuditLogs = [
    mockAuditLog,
    {
      ...mockAuditLog,
      id: 'audit-log-2',
      action: 'UPDATE',
      createdAt: new Date('2025-01-15T11:00:00Z'),
    },
    {
      ...mockAuditLog,
      id: 'audit-log-3',
      action: 'DELETE',
      createdAt: new Date('2025-01-15T12:00:00Z'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search', () => {
    it('should allow manager to search audit logs', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      const result = await caller.search({ limit: 100, offset: 0 });

      expect(result.logs).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should allow admin to search audit logs', async () => {
      const caller = auditRouter.createCaller(createAdminContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      const result = await caller.search({ limit: 100, offset: 0 });

      expect(result.logs).toHaveLength(3);
    });

    it('should deny regular user access to search', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      await expect(caller.search({ limit: 100, offset: 0 })).rejects.toThrow(TRPCError);
    });

    it('should filter by resourceType', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);
      prismaMock.auditLog.count.mockResolvedValue(1);

      await caller.search({ resourceType: 'lead', limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'lead',
          }),
        })
      );
    });

    it('should filter by resourceId', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);
      prismaMock.auditLog.count.mockResolvedValue(1);

      await caller.search({ resourceId: TEST_UUIDS.lead1, limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: TEST_UUIDS.lead1,
          }),
        })
      );
    });

    it('should filter by actorId', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);
      prismaMock.auditLog.count.mockResolvedValue(1);

      await caller.search({ actorId: TEST_UUIDS.user1, limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should filter by action', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);
      prismaMock.auditLog.count.mockResolvedValue(1);

      await caller.search({ action: 'CREATE', limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'CREATE',
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      const caller = auditRouter.createCaller(createManagerContext());
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      await caller.search({ startDate, endDate, limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });

    it('should support pagination with offset', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLogs[2]]);
      prismaMock.auditLog.count.mockResolvedValue(3);

      const result = await caller.search({ limit: 1, offset: 2 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
          skip: 2,
        })
      );
      expect(result.hasMore).toBe(false);
    });

    it('should indicate hasMore when more results exist', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);
      prismaMock.auditLog.count.mockResolvedValue(10);

      const result = await caller.search({ limit: 1, offset: 0 });

      expect(result.hasMore).toBe(true);
    });

    it('should order by createdAt descending', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      await caller.search({ limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should include user information', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      await caller.search({ limit: 100, offset: 0 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        })
      );
    });
  });

  describe('getByResource', () => {
    it('should return audit trail for a specific resource', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const result = await caller.getByResource({
        resourceType: 'lead',
        resourceId: TEST_UUIDS.lead1,
      });

      expect(result).toHaveLength(3);
      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: 'lead',
            entityId: TEST_UUIDS.lead1,
          },
        })
      );
    });

    it('should respect limit parameter', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      await caller.getByResource({
        resourceType: 'lead',
        resourceId: TEST_UUIDS.lead1,
        limit: 10,
      });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should use default limit of 50', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      await caller.getByResource({
        resourceType: 'lead',
        resourceId: TEST_UUIDS.lead1,
      });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should order by createdAt descending', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      await caller.getByResource({
        resourceType: 'contact',
        resourceId: TEST_UUIDS.contact1,
      });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('getMyActivity', () => {
    it('should return current user activity log', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      const result = await caller.getMyActivity({ limit: 50, offset: 0 });

      expect(result.logs).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: TEST_UUIDS.user1,
          },
        })
      );
    });

    it('should support pagination', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue([mockAuditLog]);
      prismaMock.auditLog.count.mockResolvedValue(10);

      const result = await caller.getMyActivity({ limit: 5, offset: 5 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          skip: 5,
        })
      );
      expect(result.hasMore).toBe(true);
    });

    it('should use default limit and offset', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      await caller.getMyActivity({});

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        })
      );
    });

    it('should order by createdAt descending', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      prismaMock.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      prismaMock.auditLog.count.mockResolvedValue(3);

      await caller.getMyActivity({});

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('getSecurityEvents', () => {
    const securityLogs = [
      { ...mockAuditLog, id: 'sec-1', action: 'LOGIN' },
      { ...mockAuditLog, id: 'sec-2', action: 'LOGIN_FAILED' },
      { ...mockAuditLog, id: 'sec-3', action: 'PERMISSION_DENIED' },
    ];

    it('should return security events for admin', async () => {
      const caller = auditRouter.createCaller(createAdminContext());

      prismaMock.auditLog.findMany.mockResolvedValue(securityLogs);

      const result = await caller.getSecurityEvents({});

      expect(result).toHaveLength(3);
    });

    it('should filter by security-related actions', async () => {
      const caller = auditRouter.createCaller(createAdminContext());

      prismaMock.auditLog.findMany.mockResolvedValue(securityLogs);

      await caller.getSecurityEvents({});

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: {
              in: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_RESET', 'PERMISSION_DENIED'],
            },
          }),
        })
      );
    });

    it('should deny non-admin access', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      await expect(caller.getSecurityEvents({})).rejects.toThrow(TRPCError);
    });

    it('should deny manager access', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      await expect(caller.getSecurityEvents({})).rejects.toThrow(TRPCError);
    });

    it('should filter by date range', async () => {
      const caller = auditRouter.createCaller(createAdminContext());
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      prismaMock.auditLog.findMany.mockResolvedValue(securityLogs);

      await caller.getSecurityEvents({ startDate, endDate });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });

    it('should respect limit parameter', async () => {
      const caller = auditRouter.createCaller(createAdminContext());

      prismaMock.auditLog.findMany.mockResolvedValue(securityLogs);

      await caller.getSecurityEvents({ limit: 50 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('getStats', () => {
    const mockStats = {
      total: 100,
      byAction: [
        { action: 'CREATE', _count: 40 },
        { action: 'UPDATE', _count: 35 },
        { action: 'DELETE', _count: 25 },
      ],
      byResource: [
        { entityType: 'lead', _count: 50 },
        { entityType: 'contact', _count: 30 },
        { entityType: 'account', _count: 20 },
      ],
      byUser: [
        { userId: TEST_UUIDS.user1, _count: 60 },
        { userId: TEST_UUIDS.admin1, _count: 40 },
      ],
    };

    it('should return audit statistics for admin', async () => {
      const caller = auditRouter.createCaller(createAdminContext());

      prismaMock.auditLog.count.mockResolvedValue(mockStats.total);
      prismaMock.auditLog.groupBy.mockResolvedValueOnce(mockStats.byAction as never);
      prismaMock.auditLog.groupBy.mockResolvedValueOnce(mockStats.byResource as never);
      prismaMock.auditLog.groupBy.mockResolvedValueOnce(mockStats.byUser as never);

      const result = await caller.getStats({});

      expect(result.total).toBe(100);
      expect(result.byAction).toEqual({
        CREATE: 40,
        UPDATE: 35,
        DELETE: 25,
      });
      expect(result.byResource).toEqual({
        lead: 50,
        contact: 30,
        account: 20,
      });
      expect(result.topUsers).toHaveLength(2);
    });

    it('should deny non-admin access', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      await expect(caller.getStats({})).rejects.toThrow(TRPCError);
    });

    it('should deny manager access', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      await expect(caller.getStats({})).rejects.toThrow(TRPCError);
    });

    it('should filter by date range', async () => {
      const caller = auditRouter.createCaller(createAdminContext());
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      prismaMock.auditLog.count.mockResolvedValue(50);
      prismaMock.auditLog.groupBy.mockResolvedValue([] as never);

      await caller.getStats({ startDate, endDate });

      expect(prismaMock.auditLog.count).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    });

    it('should return top 10 users by activity', async () => {
      const caller = auditRouter.createCaller(createAdminContext());

      prismaMock.auditLog.count.mockResolvedValue(mockStats.total);
      prismaMock.auditLog.groupBy.mockResolvedValue([] as never);

      await caller.getStats({});

      // Check that groupBy for users was called with take: 10
      expect(prismaMock.auditLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['userId'],
          take: 10,
        })
      );
    });
  });

  describe('input validation', () => {
    it('should reject limit above max for search', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      await expect(caller.search({ limit: 1001, offset: 0 })).rejects.toThrow();
    });

    it('should reject limit below min for search', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      await expect(caller.search({ limit: 0, offset: 0 })).rejects.toThrow();
    });

    it('should reject negative offset', async () => {
      const caller = auditRouter.createCaller(createManagerContext());

      await expect(caller.search({ limit: 100, offset: -1 })).rejects.toThrow();
    });

    it('should reject limit above max for getByResource', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      await expect(
        caller.getByResource({
          resourceType: 'lead',
          resourceId: TEST_UUIDS.lead1,
          limit: 101,
        })
      ).rejects.toThrow();
    });

    it('should require resourceType for getByResource', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      // @ts-expect-error - Testing invalid input
      await expect(caller.getByResource({ resourceId: TEST_UUIDS.lead1 })).rejects.toThrow();
    });

    it('should require resourceId for getByResource', async () => {
      const caller = auditRouter.createCaller(createTestContext());

      // @ts-expect-error - Testing invalid input
      await expect(caller.getByResource({ resourceType: 'lead' })).rejects.toThrow();
    });
  });
});
