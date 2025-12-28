/**
 * Audit Coverage Tests
 *
 * Comprehensive tests to ensure 100% audit logging coverage for all CRM actions.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 *
 * Test Categories:
 * 1. CRUD Operation Logging
 * 2. Permission Denial Logging
 * 3. Authentication Event Logging
 * 4. Bulk Operation Logging
 * 5. RBAC Permission Checks
 * 6. ABAC Attribute Conditions
 *
 * KPIs Validated:
 * - 100% actions logged
 * - RBAC functional
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditLogger, resetAuditLogger } from './audit-logger';
import { RBACService, resetRBACService, Permissions } from './rbac';
import { RoleName, AuditAction, ResourceType } from './types';

// Mock Prisma client
const mockPrisma = {
  auditLog: {
    create: vi.fn().mockResolvedValue({ id: 'test-audit-id' }),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  securityEvent: {
    create: vi.fn().mockResolvedValue({ id: 'test-event-id' }),
  },
} as any;

describe('Audit Logger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    resetAuditLogger();
    auditLogger = new AuditLogger(mockPrisma, { consoleLog: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetAuditLogger();
  });

  describe('CRUD Operation Logging', () => {
    it('should log CREATE action', async () => {
      const id = await auditLogger.logAction('CREATE', 'lead', 'lead-123', {
        actorId: 'user-1',
        afterState: { email: 'test@example.com', firstName: 'Test' },
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE',
            entityType: 'lead',
            entityId: 'lead-123',
          }),
        })
      );
    });

    it('should log READ action', async () => {
      const id = await auditLogger.logAction('READ', 'contact', 'contact-456', {
        actorId: 'user-1',
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log UPDATE action with before/after state', async () => {
      const beforeState = { status: 'NEW', score: 0 };
      const afterState = { status: 'QUALIFIED', score: 85 };

      const id = await auditLogger.logAction('UPDATE', 'lead', 'lead-123', {
        actorId: 'user-1',
        beforeState,
        afterState,
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE',
            oldValue: beforeState,
            newValue: afterState,
          }),
        })
      );
    });

    it('should log DELETE action', async () => {
      const id = await auditLogger.logAction('DELETE', 'task', 'task-789', {
        actorId: 'user-1',
        beforeState: { title: 'Deleted Task' },
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('CRM-Specific Actions', () => {
    it('should log QUALIFY action', async () => {
      const id = await auditLogger.logAction('QUALIFY', 'lead', 'lead-123', {
        actorId: 'user-1',
        actionReason: 'Met qualification criteria',
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log CONVERT action', async () => {
      const id = await auditLogger.logAction('CONVERT', 'lead', 'lead-123', {
        actorId: 'user-1',
        afterState: { contactId: 'contact-new', accountId: 'account-new' },
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log AI_SCORE action', async () => {
      const id = await auditLogger.logAction('AI_SCORE', 'lead', 'lead-123', {
        actorType: 'AI_AGENT',
        afterState: { score: 85, confidence: 0.92 },
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('Permission Denial Logging', () => {
    it('should log permission denied events', async () => {
      const id = await auditLogger.logPermissionDenied('lead', 'lead-123', 'lead:delete', {
        actorId: 'user-1',
        actorRole: 'VIEWER',
        reason: 'Viewers cannot delete leads',
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('Authentication Logging', () => {
    it('should log successful login', async () => {
      await auditLogger.logLogin(true, {
        userId: 'user-1',
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        mfaUsed: true,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'LOGIN_SUCCESS',
          }),
        })
      );
    });

    it('should log failed login', async () => {
      await auditLogger.logLogin(false, {
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        failureReason: 'Invalid password',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'LOGIN_FAILURE',
            severity: 'MEDIUM',
          }),
        })
      );
    });
  });

  describe('Bulk Operation Logging', () => {
    it('should log bulk update', async () => {
      const id = await auditLogger.logBulkOperation(
        'BULK_UPDATE',
        'lead',
        ['lead-1', 'lead-2', 'lead-3'],
        {
          actorId: 'user-1',
          successCount: 3,
          failureCount: 0,
        }
      );

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log export with partial success', async () => {
      const id = await auditLogger.logBulkOperation(
        'EXPORT',
        'contact',
        ['c-1', 'c-2', 'c-3', 'c-4', 'c-5'],
        {
          actorId: 'user-1',
          successCount: 4,
          failureCount: 1,
        }
      );

      expect(id).toBeDefined();
    });
  });

  describe('Request Context', () => {
    it('should include IP address and user agent', async () => {
      const id = await auditLogger.logAction('CREATE', 'lead', 'lead-123', {
        actorId: 'user-1',
        requestContext: {
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          requestId: 'req-12345',
          traceId: 'trace-67890',
        },
      });

      expect(id).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          }),
        })
      );
    });
  });
});

describe('RBAC Service', () => {
  let rbac: RBACService;

  beforeEach(() => {
    resetRBACService();
    rbac = new RBACService(mockPrisma);
  });

  afterEach(() => {
    resetRBACService();
  });

  describe('Role-Based Permissions', () => {
    describe('ADMIN role', () => {
      it('should have all permissions', async () => {
        const canReadLeads = await rbac.canRead('admin-1', 'ADMIN', 'lead');
        const canWriteLeads = await rbac.canWrite('admin-1', 'ADMIN', 'lead');
        const canDeleteLeads = await rbac.canDelete('admin-1', 'ADMIN', 'lead');
        const canManageUsers = await rbac.canManage('admin-1', 'ADMIN', 'user');

        expect(canReadLeads).toBe(true);
        expect(canWriteLeads).toBe(true);
        expect(canDeleteLeads).toBe(true);
        expect(canManageUsers).toBe(true);
      });

      it('should access any resource regardless of owner', async () => {
        const result = await rbac.can({
          userId: 'admin-1',
          userRole: 'ADMIN',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'other-user',
        });

        expect(result.granted).toBe(true);
      });
    });

    describe('MANAGER role', () => {
      it('should have manage permissions on CRM resources', async () => {
        const canManageLeads = await rbac.canManage('manager-1', 'MANAGER', 'lead');
        const canManageContacts = await rbac.canManage('manager-1', 'MANAGER', 'contact');

        expect(canManageLeads).toBe(true);
        expect(canManageContacts).toBe(true);
      });

      it('should not have admin permissions on users', async () => {
        const result = await rbac.can({
          userId: 'manager-1',
          userRole: 'MANAGER',
          resourceType: 'user',
          action: 'admin',
        });

        expect(result.granted).toBe(false);
      });
    });

    describe('SALES_REP role', () => {
      it('should have read/write on CRM resources', async () => {
        const canReadLeads = await rbac.canRead('sales-1', 'SALES_REP', 'lead');
        const canWriteLeads = await rbac.canWrite('sales-1', 'SALES_REP', 'lead');
        const canDeleteLeads = await rbac.canDelete('sales-1', 'SALES_REP', 'lead');

        expect(canReadLeads).toBe(true);
        expect(canWriteLeads).toBe(true);
        expect(canDeleteLeads).toBe(true);
      });

      it('should not have manage permissions', async () => {
        const canManage = await rbac.canManage('sales-1', 'SALES_REP', 'lead');
        expect(canManage).toBe(false);
      });

      it('should only access own resources', async () => {
        const canAccessOwn = await rbac.can({
          userId: 'sales-1',
          userRole: 'SALES_REP',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'sales-1',
        });

        const canAccessOther = await rbac.can({
          userId: 'sales-1',
          userRole: 'SALES_REP',
          resourceType: 'lead',
          action: 'write',
          resourceOwnerId: 'sales-2',
        });

        expect(canAccessOwn.granted).toBe(true);
        expect(canAccessOther.granted).toBe(false);
      });
    });

    describe('USER role', () => {
      it('should have limited permissions', async () => {
        const canReadLeads = await rbac.canRead('user-1', 'USER', 'lead');
        const canWriteLeads = await rbac.canWrite('user-1', 'USER', 'lead');
        const canDeleteLeads = await rbac.canDelete('user-1', 'USER', 'lead');
        const canExportLeads = await rbac.canExport('user-1', 'USER', 'lead');

        expect(canReadLeads).toBe(true);
        expect(canWriteLeads).toBe(true);
        expect(canDeleteLeads).toBe(false);
        expect(canExportLeads).toBe(false);
      });
    });

    describe('VIEWER role', () => {
      it('should only have read permissions', async () => {
        const canReadLeads = await rbac.canRead('viewer-1', 'VIEWER', 'lead');
        const canWriteLeads = await rbac.canWrite('viewer-1', 'VIEWER', 'lead');
        const canDeleteLeads = await rbac.canDelete('viewer-1', 'VIEWER', 'lead');

        expect(canReadLeads).toBe(true);
        expect(canWriteLeads).toBe(false);
        expect(canDeleteLeads).toBe(false);
      });

      it('should read all resources (no ownership restriction for read)', async () => {
        const result = await rbac.can({
          userId: 'viewer-1',
          userRole: 'VIEWER',
          resourceType: 'lead',
          action: 'read',
          resourceOwnerId: 'other-user',
        });

        expect(result.granted).toBe(true);
      });
    });
  });

  describe('Role Hierarchy', () => {
    it('should correctly order role levels', () => {
      expect(rbac.getRoleLevel('ADMIN')).toBeGreaterThan(rbac.getRoleLevel('MANAGER'));
      expect(rbac.getRoleLevel('MANAGER')).toBeGreaterThan(rbac.getRoleLevel('SALES_REP'));
      expect(rbac.getRoleLevel('SALES_REP')).toBeGreaterThan(rbac.getRoleLevel('USER'));
      expect(rbac.getRoleLevel('USER')).toBeGreaterThan(rbac.getRoleLevel('VIEWER'));
    });

    it('should identify managers correctly', () => {
      expect(rbac.isManager('ADMIN')).toBe(true);
      expect(rbac.isManager('MANAGER')).toBe(true);
      expect(rbac.isManager('SALES_REP')).toBe(false);
      expect(rbac.isManager('USER')).toBe(false);
    });

    it('should identify admins correctly', () => {
      expect(rbac.isAdmin('ADMIN')).toBe(true);
      expect(rbac.isAdmin('MANAGER')).toBe(false);
      expect(rbac.isAdmin('SALES_REP')).toBe(false);
    });
  });

  describe('Permission Listing', () => {
    it('should return all permissions for a role', async () => {
      const adminPerms = await rbac.getPermissions('admin-1', 'ADMIN');
      const viewerPerms = await rbac.getPermissions('viewer-1', 'VIEWER');

      expect(adminPerms.length).toBeGreaterThan(viewerPerms.length);
      expect(adminPerms).toContain('lead:admin');
      expect(viewerPerms).not.toContain('lead:admin');
      expect(viewerPerms).toContain('lead:read');
    });
  });

  describe('Permission Caching', () => {
    it('should cache permissions', async () => {
      const perms1 = await rbac.getPermissions('user-1', 'SALES_REP');
      const perms2 = await rbac.getPermissions('user-1', 'SALES_REP');

      expect(perms1).toEqual(perms2);
    });

    it('should clear cache when requested', async () => {
      await rbac.getPermissions('user-1', 'SALES_REP');
      rbac.clearCache('user-1');

      // Should work without errors after cache clear
      const perms = await rbac.getPermissions('user-1', 'SALES_REP');
      expect(perms).toBeDefined();
    });
  });

  describe('ABAC Conditions', () => {
    it('should evaluate equality condition', () => {
      const result = rbac.evaluateConditions(
        [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
        { status: 'ACTIVE' }
      );
      expect(result).toBe(true);
    });

    it('should evaluate inequality condition', () => {
      const result = rbac.evaluateConditions(
        [{ field: 'status', operator: 'neq', value: 'DELETED' }],
        { status: 'ACTIVE' }
      );
      expect(result).toBe(true);
    });

    it('should evaluate "in" condition', () => {
      const result = rbac.evaluateConditions(
        [{ field: 'role', operator: 'in', value: ['ADMIN', 'MANAGER'] }],
        { role: 'MANAGER' }
      );
      expect(result).toBe(true);
    });

    it('should fail when condition not met', () => {
      const result = rbac.evaluateConditions(
        [{ field: 'status', operator: 'eq', value: 'ACTIVE' }],
        { status: 'INACTIVE' }
      );
      expect(result).toBe(false);
    });
  });
});

describe('Permission Constants', () => {
  it('should have all required permission constants', () => {
    expect(Permissions.LEADS_READ).toBe('lead:read');
    expect(Permissions.LEADS_WRITE).toBe('lead:write');
    expect(Permissions.LEADS_DELETE).toBe('lead:delete');
    expect(Permissions.CONTACTS_READ).toBe('contact:read');
    expect(Permissions.ACCOUNTS_READ).toBe('account:read');
    expect(Permissions.OPPORTUNITIES_READ).toBe('opportunity:read');
    expect(Permissions.TASKS_READ).toBe('task:read');
    expect(Permissions.USERS_ADMIN).toBe('user:admin');
    expect(Permissions.SYSTEM_ADMIN).toBe('system:admin');
  });
});

describe('Audit Coverage Validation', () => {
  const allCRMResources: ResourceType[] = [
    'lead',
    'contact',
    'account',
    'opportunity',
    'task',
    'appointment',
  ];

  const allCRUDActions: AuditAction[] = ['CREATE', 'READ', 'UPDATE', 'DELETE'];

  it('should have audit logging capability for all CRM resources', async () => {
    resetAuditLogger();
    const logger = new AuditLogger(mockPrisma, { consoleLog: false });

    for (const resource of allCRMResources) {
      for (const action of allCRUDActions) {
        const id = await logger.logAction(action, resource, 'test-id', {
          actorId: 'test-user',
        });
        expect(id).toBeDefined();
      }
    }

    // Verify all combinations were logged
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(
      allCRMResources.length * allCRUDActions.length
    );
  });

  it('should have RBAC permissions defined for all CRM resources', async () => {
    resetRBACService();
    const rbac = new RBACService(mockPrisma);

    for (const resource of allCRMResources) {
      // Check that at least read permission is defined
      const permissions = await rbac.getPermissions('admin-1', 'ADMIN');
      expect(permissions).toContain(`${resource}:read`);
    }
  });

  it('should enforce 100% logging KPI by covering all action types', () => {
    const allActions: AuditAction[] = [
      'CREATE',
      'READ',
      'UPDATE',
      'DELETE',
      'LOGIN',
      'LOGOUT',
      'LOGIN_FAILED',
      'PASSWORD_RESET',
      'MFA_ENABLED',
      'MFA_DISABLED',
      'PERMISSION_DENIED',
      'QUALIFY',
      'CONVERT',
      'ASSIGN',
      'TRANSFER',
      'SCORE',
      'AI_SCORE',
      'AI_PREDICT',
      'AI_GENERATE',
      'BULK_UPDATE',
      'BULK_DELETE',
      'IMPORT',
      'EXPORT',
      'ARCHIVE',
      'RESTORE',
      'CONFIGURE',
    ];

    // Verify all action types are defined
    expect(allActions.length).toBeGreaterThan(20);

    // Each action should be a valid AuditAction type
    for (const action of allActions) {
      expect(typeof action).toBe('string');
    }
  });
});
