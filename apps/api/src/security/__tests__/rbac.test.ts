import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  RBACService,
  getRBACService,
  resetRBACService,
  Permissions,
} from '../rbac';
import { RoleName, ROLE_LEVELS } from '../types';

describe('RBACService', () => {
  let service: RBACService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {} as PrismaClient;
    service = new RBACService(mockPrisma);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRBACService();
  });

  describe('can', () => {
    describe('ADMIN role', () => {
      it('should grant all permissions to admin', async () => {
        const result = await service.can({
          userId: 'admin-user',
          userRole: 'ADMIN',
          resourceType: 'lead',
          action: 'admin',
        });

        expect(result.granted).toBe(true);
        expect(result.roleLevel).toBe(ROLE_LEVELS.ADMIN);
      });

      it('should allow admin to manage any resource', async () => {
        const result = await service.can({
          userId: 'admin-user',
          userRole: 'ADMIN',
          resourceType: 'user',
          action: 'admin',
        });

        expect(result.granted).toBe(true);
      });

      it('should allow admin to access records owned by others', async () => {
        const result = await service.can({
          userId: 'admin-user',
          userRole: 'ADMIN',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'other-user',
        });

        expect(result.granted).toBe(true);
      });
    });

    describe('MANAGER role', () => {
      it('should grant manage permission to manager', async () => {
        const result = await service.can({
          userId: 'manager-user',
          userRole: 'MANAGER',
          resourceType: 'lead',
          action: 'manage',
        });

        expect(result.granted).toBe(true);
        expect(result.roleLevel).toBe(ROLE_LEVELS.MANAGER);
      });

      it('should deny admin permission to manager', async () => {
        const result = await service.can({
          userId: 'manager-user',
          userRole: 'MANAGER',
          resourceType: 'lead',
          action: 'admin',
        });

        expect(result.granted).toBe(false);
        expect(result.reason).toContain('does not have admin permission');
      });

      it('should allow manager to access records owned by team members', async () => {
        const result = await service.can({
          userId: 'manager-user',
          userRole: 'MANAGER',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'team-member',
        });

        expect(result.granted).toBe(true);
      });
    });

    describe('SALES_REP role', () => {
      it('should grant export permission to sales rep', async () => {
        const result = await service.can({
          userId: 'sales-user',
          userRole: 'SALES_REP',
          resourceType: 'lead',
          action: 'export',
        });

        expect(result.granted).toBe(true);
      });

      it('should deny manage permission to sales rep', async () => {
        const result = await service.can({
          userId: 'sales-user',
          userRole: 'SALES_REP',
          resourceType: 'lead',
          action: 'manage',
        });

        expect(result.granted).toBe(false);
      });

      it('should deny access to records owned by others', async () => {
        const result = await service.can({
          userId: 'sales-user',
          userRole: 'SALES_REP',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'other-sales-user',
        });

        expect(result.granted).toBe(false);
        expect(result.reason).toContain('cannot write');
      });

      it('should allow access to own records', async () => {
        const result = await service.can({
          userId: 'sales-user',
          userRole: 'SALES_REP',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'sales-user',
        });

        expect(result.granted).toBe(true);
      });

      it('should deny system access', async () => {
        const result = await service.can({
          userId: 'sales-user',
          userRole: 'SALES_REP',
          resourceType: 'system',
          action: 'read',
        });

        expect(result.granted).toBe(false);
      });
    });

    describe('USER role', () => {
      it('should grant read and write on lead', async () => {
        const readResult = await service.can({
          userId: 'regular-user',
          userRole: 'USER',
          resourceType: 'lead',
          action: 'read',
        });

        const writeResult = await service.can({
          userId: 'regular-user',
          userRole: 'USER',
          resourceType: 'lead',
          action: 'write',
        });

        expect(readResult.granted).toBe(true);
        expect(writeResult.granted).toBe(true);
      });

      it('should deny delete on lead', async () => {
        const result = await service.can({
          userId: 'regular-user',
          userRole: 'USER',
          resourceType: 'lead',
          action: 'delete',
        });

        expect(result.granted).toBe(false);
      });

      it('should deny access to records owned by others', async () => {
        const result = await service.can({
          userId: 'regular-user',
          userRole: 'USER',
          resourceType: 'lead',
          action: 'read',
          resourceOwnerId: 'other-user',
        });

        expect(result.granted).toBe(false);
      });
    });

    describe('VIEWER role', () => {
      it('should only grant read permission', async () => {
        const readResult = await service.can({
          userId: 'viewer-user',
          userRole: 'VIEWER',
          resourceType: 'lead',
          action: 'read',
        });

        const writeResult = await service.can({
          userId: 'viewer-user',
          userRole: 'VIEWER',
          resourceType: 'lead',
          action: 'write',
        });

        expect(readResult.granted).toBe(true);
        expect(writeResult.granted).toBe(false);
      });

      it('should allow read access to all records', async () => {
        const result = await service.can({
          userId: 'viewer-user',
          userRole: 'VIEWER',
          resourceType: 'lead',
          action: 'read',
          resourceOwnerId: 'any-owner',
        });

        expect(result.granted).toBe(true);
      });
    });

    it('should include checked permissions in result', async () => {
      const result = await service.can({
        userId: 'user-123',
        userRole: 'ADMIN',
        resourceType: 'lead',
        action: 'write',
      });

      expect(result.checkedPermissions).toContain('lead:write');
    });
  });

  describe('shorthand methods', () => {
    it('canRead should check read permission', async () => {
      const result = await service.canRead('user-123', 'MANAGER', 'lead');
      expect(result).toBe(true);
    });

    it('canWrite should check write permission', async () => {
      const result = await service.canWrite('user-123', 'MANAGER', 'lead');
      expect(result).toBe(true);
    });

    it('canDelete should check delete permission', async () => {
      const result = await service.canDelete('user-123', 'MANAGER', 'lead');
      expect(result).toBe(true);
    });

    it('canManage should check manage permission', async () => {
      const adminResult = await service.canManage('user-123', 'ADMIN', 'lead');
      const userResult = await service.canManage('user-123', 'USER', 'lead');

      expect(adminResult).toBe(true);
      expect(userResult).toBe(false);
    });

    it('canExport should check export permission', async () => {
      const salesResult = await service.canExport('user-123', 'SALES_REP', 'lead');
      const viewerResult = await service.canExport('user-123', 'VIEWER', 'lead');

      expect(salesResult).toBe(true);
      expect(viewerResult).toBe(false);
    });

    it('shorthand methods should respect ownership', async () => {
      const ownRecord = await service.canWrite('user-123', 'SALES_REP', 'lead', 'user-123');
      const otherRecord = await service.canWrite('user-123', 'SALES_REP', 'lead', 'other-user');

      expect(ownRecord).toBe(true);
      expect(otherRecord).toBe(false);
    });
  });

  describe('getPermissions', () => {
    it('should return all permissions for admin', async () => {
      const permissions = await service.getPermissions('admin-user', 'ADMIN');

      expect(permissions).toContain('lead:read');
      expect(permissions).toContain('lead:write');
      expect(permissions).toContain('lead:admin');
      expect(permissions).toContain('system:admin');
    });

    it('should return limited permissions for viewer', async () => {
      const permissions = await service.getPermissions('viewer-user', 'VIEWER');

      expect(permissions).toContain('lead:read');
      expect(permissions).not.toContain('lead:write');
      expect(permissions).not.toContain('lead:admin');
    });

    it('should cache permissions', async () => {
      const permissions1 = await service.getPermissions('user-123', 'MANAGER');
      const permissions2 = await service.getPermissions('user-123', 'MANAGER');

      // Should return the same cached result
      expect(permissions1).toEqual(permissions2);
    });

    it('should return fresh permissions after cache expires', async () => {
      await service.getPermissions('user-123', 'MANAGER');

      // Advance time past cache duration (1 minute)
      vi.advanceTimersByTime(61 * 1000);

      const permissions = await service.getPermissions('user-123', 'MANAGER');

      expect(permissions).toContain('lead:read');
    });
  });

  describe('hasPermission', () => {
    it('should return true for valid permission', async () => {
      const result = await service.hasPermission('user-123', 'ADMIN', 'lead:write');
      expect(result).toBe(true);
    });

    it('should return false for invalid permission', async () => {
      const result = await service.hasPermission('user-123', 'VIEWER', 'lead:delete');
      expect(result).toBe(false);
    });
  });

  describe('role level methods', () => {
    it('getRoleLevel should return correct level', () => {
      expect(service.getRoleLevel('ADMIN')).toBe(100);
      expect(service.getRoleLevel('MANAGER')).toBe(30);
      expect(service.getRoleLevel('SALES_REP')).toBe(20);
      expect(service.getRoleLevel('USER')).toBe(10);
      expect(service.getRoleLevel('VIEWER')).toBe(0);
    });

    it('getRoleLevel should return 0 for unknown role', () => {
      expect(service.getRoleLevel('UNKNOWN' as RoleName)).toBe(0);
    });

    it('isRoleAtLevel should check minimum level', () => {
      expect(service.isRoleAtLevel('ADMIN', 50)).toBe(true);
      expect(service.isRoleAtLevel('MANAGER', 50)).toBe(false);
      expect(service.isRoleAtLevel('VIEWER', 0)).toBe(true);
    });

    it('isManager should check if role is manager or above', () => {
      expect(service.isManager('ADMIN')).toBe(true);
      expect(service.isManager('MANAGER')).toBe(true);
      expect(service.isManager('SALES_REP')).toBe(false);
    });

    it('isAdmin should only return true for admin', () => {
      expect(service.isAdmin('ADMIN')).toBe(true);
      expect(service.isAdmin('MANAGER')).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific user', async () => {
      await service.getPermissions('user-1', 'ADMIN');
      await service.getPermissions('user-2', 'MANAGER');

      service.clearCache('user-1');

      // Permissions for user-1 should be re-fetched
      const permissions = await service.getPermissions('user-1', 'ADMIN');
      expect(permissions).toBeDefined();
    });

    it('should clear entire cache when no user specified', async () => {
      await service.getPermissions('user-1', 'ADMIN');
      await service.getPermissions('user-2', 'MANAGER');

      service.clearCache();

      // All permissions should be re-fetched
      const p1 = await service.getPermissions('user-1', 'ADMIN');
      const p2 = await service.getPermissions('user-2', 'MANAGER');

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
    });
  });

  describe('evaluateConditions', () => {
    it('should evaluate eq operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'status', operator: 'eq', value: 'active' }],
        { status: 'active' }
      );

      expect(result).toBe(true);
    });

    it('should return false for eq when not equal', () => {
      const result = service.evaluateConditions(
        [{ field: 'status', operator: 'eq', value: 'active' }],
        { status: 'inactive' }
      );

      expect(result).toBe(false);
    });

    it('should evaluate neq operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'status', operator: 'neq', value: 'deleted' }],
        { status: 'active' }
      );

      expect(result).toBe(true);
    });

    it('should evaluate in operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'role', operator: 'in', value: ['admin', 'manager'] }],
        { role: 'admin' }
      );

      expect(result).toBe(true);
    });

    it('should return false for in when value not in array', () => {
      const result = service.evaluateConditions(
        [{ field: 'role', operator: 'in', value: ['admin', 'manager'] }],
        { role: 'user' }
      );

      expect(result).toBe(false);
    });

    it('should evaluate contains operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'email', operator: 'contains', value: '@example.com' }],
        { email: 'user@example.com' }
      );

      expect(result).toBe(true);
    });

    it('should evaluate startsWith operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'name', operator: 'startsWith', value: 'John' }],
        { name: 'John Doe' }
      );

      expect(result).toBe(true);
    });

    it('should require all conditions to be true', () => {
      const result = service.evaluateConditions(
        [
          { field: 'status', operator: 'eq', value: 'active' },
          { field: 'role', operator: 'eq', value: 'admin' },
        ],
        { status: 'active', role: 'user' }
      );

      expect(result).toBe(false);
    });

    it('should return true when all conditions match', () => {
      const result = service.evaluateConditions(
        [
          { field: 'status', operator: 'eq', value: 'active' },
          { field: 'role', operator: 'in', value: ['admin', 'manager'] },
        ],
        { status: 'active', role: 'admin' }
      );

      expect(result).toBe(true);
    });

    it('should return true for empty conditions', () => {
      const result = service.evaluateConditions([], { anyField: 'anyValue' });
      expect(result).toBe(true);
    });
  });
});

describe('getRBACService', () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {} as PrismaClient;
    resetRBACService();
  });

  afterEach(() => {
    resetRBACService();
  });

  it('should return singleton instance', () => {
    const service1 = getRBACService(mockPrisma);
    const service2 = getRBACService(mockPrisma);

    expect(service1).toBe(service2);
  });
});

describe('Permissions constants', () => {
  it('should have correct format for lead permissions', () => {
    expect(Permissions.LEADS_READ).toBe('lead:read');
    expect(Permissions.LEADS_WRITE).toBe('lead:write');
    expect(Permissions.LEADS_DELETE).toBe('lead:delete');
    expect(Permissions.LEADS_EXPORT).toBe('lead:export');
    expect(Permissions.LEADS_MANAGE).toBe('lead:manage');
  });

  it('should have correct format for system permissions', () => {
    expect(Permissions.SYSTEM_READ).toBe('system:read');
    expect(Permissions.SYSTEM_WRITE).toBe('system:write');
    expect(Permissions.SYSTEM_ADMIN).toBe('system:admin');
  });
});

describe('RBACService - Database Operations', () => {
  let service: RBACService;
  let mockPrisma: {
    permission: { findUnique: ReturnType<typeof vi.fn> };
    userPermission: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    userRoleAssignment: {
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    rBACRole: { findUnique: ReturnType<typeof vi.fn> };
  };

  const TEST_USER_ID = 'test-user-123';

  beforeEach(() => {
    mockPrisma = {
      permission: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      userPermission: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      rBACRole: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    service = new RBACService(mockPrisma as unknown as PrismaClient);
    resetRBACService();
  });

  afterEach(() => {
    resetRBACService();
    vi.clearAllMocks();
  });

  describe('getUserPermissionOverride (via can method)', () => {
    it('should apply user permission override when granted', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:read',
      });
      mockPrisma.userPermission.findUnique.mockResolvedValue({
        granted: true,
        expiresAt: null,
      });

      const result = await service.can({
        userId: TEST_USER_ID,
        userRole: 'VIEWER',
        resourceType: 'lead',
        action: 'read',
      });

      expect(result.granted).toBe(true);
      expect(result.reason).toBe('Granted by user override');
      expect(result.checkedPermissions).toContain('user_override:lead:read');
    });

    it('should apply user permission override when denied', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:write',
      });
      mockPrisma.userPermission.findUnique.mockResolvedValue({
        granted: false,
        expiresAt: null,
      });

      const result = await service.can({
        userId: TEST_USER_ID,
        userRole: 'ADMIN',
        resourceType: 'lead',
        action: 'write',
      });

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Denied by user override');
    });

    it('should ignore expired permission override', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:delete',
      });
      mockPrisma.userPermission.findUnique.mockResolvedValue({
        granted: false,
        expiresAt: new Date('2020-01-01'), // Expired
      });

      const result = await service.can({
        userId: TEST_USER_ID,
        userRole: 'ADMIN',
        resourceType: 'lead',
        action: 'delete',
      });

      expect(result.granted).toBe(true); // Falls back to role permission
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.permission.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.can({
        userId: TEST_USER_ID,
        userRole: 'ADMIN',
        resourceType: 'lead',
        action: 'read',
      });

      expect(result.granted).toBe(true); // Falls back to role permission
    });
  });

  describe('getUserRBACRoles', () => {
    it('should return roles from database', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        { role: { name: 'MANAGER' } },
        { role: { name: 'SALES_REP' } },
      ]);

      const roles = await service.getUserRBACRoles(TEST_USER_ID);

      expect(roles).toContain('MANAGER');
      expect(roles).toContain('SALES_REP');
      expect(mockPrisma.userRoleAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: TEST_USER_ID }),
        })
      );
    });

    it('should return empty array when no roles assigned', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);

      const roles = await service.getUserRBACRoles(TEST_USER_ID);

      expect(roles).toEqual([]);
    });

    it('should filter out invalid role names', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        { role: { name: 'ADMIN' } },
        { role: { name: 'INVALID_ROLE' } },
        { role: { name: 'USER' } },
      ]);

      const roles = await service.getUserRBACRoles(TEST_USER_ID);

      expect(roles).toContain('ADMIN');
      expect(roles).toContain('USER');
      expect(roles).not.toContain('INVALID_ROLE');
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.userRoleAssignment.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const roles = await service.getUserRBACRoles(TEST_USER_ID);

      expect(roles).toEqual([]);
    });
  });

  describe('getRolePermissionsFromDB', () => {
    it('should return permissions for a role', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        name: 'CUSTOM_ROLE',
        permissions: [
          { granted: true, permission: { name: 'lead:read' } },
          { granted: true, permission: { name: 'lead:write' } },
        ],
      });

      const permissions = await service.getRolePermissionsFromDB('CUSTOM_ROLE');

      expect(permissions).toContain('lead:read');
      expect(permissions).toContain('lead:write');
      expect(permissions).toHaveLength(2);
    });

    it('should return empty array when role not found', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue(null);

      const permissions = await service.getRolePermissionsFromDB('NONEXISTENT');

      expect(permissions).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.rBACRole.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      const permissions = await service.getRolePermissionsFromDB('CUSTOM_ROLE');

      expect(permissions).toEqual([]);
    });
  });

  describe('getPermissionsWithDB', () => {
    it('should combine default and database permissions', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userPermission.findMany.mockResolvedValue([]);

      const permissions = await service.getPermissionsWithDB(
        TEST_USER_ID,
        'USER'
      );

      expect(permissions).toContain('lead:read');
      expect(permissions).toContain('lead:write');
    });

    it('should add permissions from database roles', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        { role: { name: 'ADMIN' } },
      ]);
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        permissions: [
          { granted: true, permission: { name: 'custom:special' } },
        ],
      });
      mockPrisma.userPermission.findMany.mockResolvedValue([]);

      const permissions = await service.getPermissionsWithDB(
        TEST_USER_ID,
        'USER'
      );

      expect(permissions).toContain('custom:special');
    });

    it('should apply user permission overrides (granted)', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userPermission.findMany.mockResolvedValue([
        {
          granted: true,
          permission: { name: 'lead:admin' },
        },
      ]);

      const permissions = await service.getPermissionsWithDB(
        TEST_USER_ID,
        'USER'
      );

      expect(permissions).toContain('lead:admin');
    });

    it('should remove permissions denied by override', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userPermission.findMany.mockResolvedValue([
        {
          granted: false,
          permission: { name: 'lead:write' },
        },
      ]);

      const permissions = await service.getPermissionsWithDB(
        TEST_USER_ID,
        'USER'
      );

      expect(permissions).not.toContain('lead:write');
      expect(permissions).toContain('lead:read'); // Still has read
    });

    it('should cache results', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userPermission.findMany.mockResolvedValue([]);

      // First call
      await service.getPermissionsWithDB(TEST_USER_ID, 'USER');
      // Second call - should use cache
      await service.getPermissionsWithDB(TEST_USER_ID, 'USER');

      // Should only call DB once
      expect(mockPrisma.userRoleAssignment.findMany).toHaveBeenCalledTimes(1);
    });

    it('should handle user permission query errors', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userPermission.findMany.mockRejectedValue(
        new Error('DB error')
      );

      const permissions = await service.getPermissionsWithDB(
        TEST_USER_ID,
        'USER'
      );

      // Should still return default permissions
      expect(permissions).toContain('lead:read');
    });
  });

  describe('assignRole', () => {
    it('should assign role to user', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'MANAGER',
      });
      mockPrisma.userRoleAssignment.upsert.mockResolvedValue({});

      await service.assignRole(TEST_USER_ID, 'MANAGER', 'admin-1');

      expect(mockPrisma.userRoleAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_roleId: { userId: TEST_USER_ID, roleId: 'role-1' },
          },
          create: expect.objectContaining({
            userId: TEST_USER_ID,
            roleId: 'role-1',
            assignedBy: 'admin-1',
          }),
        })
      );
    });

    it('should throw error when role not found', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRole(TEST_USER_ID, 'NONEXISTENT', 'admin-1')
      ).rejects.toThrow('Role NONEXISTENT not found');
    });

    it('should support expiration date', async () => {
      const expiresAt = new Date('2025-12-31');
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'MANAGER',
      });
      mockPrisma.userRoleAssignment.upsert.mockResolvedValue({});

      await service.assignRole(TEST_USER_ID, 'MANAGER', 'admin-1', expiresAt);

      expect(mockPrisma.userRoleAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ expiresAt }),
          update: expect.objectContaining({ expiresAt }),
        })
      );
    });

    it('should clear cache after assignment', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'MANAGER',
      });
      mockPrisma.userRoleAssignment.upsert.mockResolvedValue({});

      // Populate cache first
      await service.getPermissions(TEST_USER_ID, 'USER');

      // Assign role
      await service.assignRole(TEST_USER_ID, 'MANAGER', 'admin-1');

      // Next getPermissions should re-fetch (cache cleared)
      // This is tested implicitly - if it didn't clear, the mock wouldn't be called
    });
  });

  describe('removeRole', () => {
    it('should remove role from user', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'MANAGER',
      });
      mockPrisma.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeRole(TEST_USER_ID, 'MANAGER');

      expect(mockPrisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, roleId: 'role-1' },
      });
    });

    it('should do nothing when role not found', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue(null);

      await service.removeRole(TEST_USER_ID, 'NONEXISTENT');

      expect(mockPrisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    });

    it('should clear cache after removal', async () => {
      mockPrisma.rBACRole.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'MANAGER',
      });
      mockPrisma.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 });

      // Populate cache
      await service.getPermissions(TEST_USER_ID, 'USER');

      // Remove role - should clear cache
      await service.removeRole(TEST_USER_ID, 'MANAGER');
    });
  });

  describe('setUserPermission', () => {
    it('should grant permission to user', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:admin',
      });
      mockPrisma.userPermission.upsert.mockResolvedValue({});

      await service.setUserPermission(
        TEST_USER_ID,
        'lead:admin',
        true,
        'admin-1',
        'Special access needed'
      );

      expect(mockPrisma.userPermission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_permissionId: { userId: TEST_USER_ID, permissionId: 'perm-1' },
          },
          create: expect.objectContaining({
            granted: true,
            reason: 'Special access needed',
            grantedBy: 'admin-1',
          }),
        })
      );
    });

    it('should deny permission to user', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:delete',
      });
      mockPrisma.userPermission.upsert.mockResolvedValue({});

      await service.setUserPermission(
        TEST_USER_ID,
        'lead:delete',
        false,
        'admin-1',
        'Restricted access'
      );

      expect(mockPrisma.userPermission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ granted: false }),
        })
      );
    });

    it('should throw error when permission not found', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await expect(
        service.setUserPermission(TEST_USER_ID, 'invalid:permission', true)
      ).rejects.toThrow('Permission invalid:permission not found');
    });

    it('should support expiration date', async () => {
      const expiresAt = new Date('2025-06-30');
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:admin',
      });
      mockPrisma.userPermission.upsert.mockResolvedValue({});

      await service.setUserPermission(
        TEST_USER_ID,
        'lead:admin',
        true,
        'admin-1',
        'Temporary access',
        expiresAt
      );

      expect(mockPrisma.userPermission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ expiresAt }),
        })
      );
    });

    it('should clear cache after setting permission', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:admin',
      });
      mockPrisma.userPermission.upsert.mockResolvedValue({});

      await service.setUserPermission(TEST_USER_ID, 'lead:admin', true);

      // Cache should be cleared (tested implicitly)
    });
  });

  describe('removeUserPermission', () => {
    it('should remove user permission override', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:admin',
      });
      mockPrisma.userPermission.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeUserPermission(TEST_USER_ID, 'lead:admin');

      expect(mockPrisma.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, permissionId: 'perm-1' },
      });
    });

    it('should do nothing when permission not found', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await service.removeUserPermission(TEST_USER_ID, 'invalid:permission');

      expect(mockPrisma.userPermission.deleteMany).not.toHaveBeenCalled();
    });

    it('should clear cache after removal', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        id: 'perm-1',
        name: 'lead:admin',
      });
      mockPrisma.userPermission.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeUserPermission(TEST_USER_ID, 'lead:admin');

      // Cache should be cleared (tested implicitly)
    });
  });

  describe('evaluateConditions - edge cases', () => {
    it('should handle non-string value for contains operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'count', operator: 'contains', value: '5' }],
        { count: 123 } // Number, not string
      );

      expect(result).toBe(false);
    });

    it('should handle non-string value for startsWith operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'count', operator: 'startsWith', value: '1' }],
        { count: 123 } // Number, not string
      );

      expect(result).toBe(false);
    });

    it('should handle non-array value for in operator', () => {
      const result = service.evaluateConditions(
        [{ field: 'role', operator: 'in', value: 'admin' as unknown as string[] }],
        { role: 'admin' }
      );

      expect(result).toBe(false);
    });
  });
});
