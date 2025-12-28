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
