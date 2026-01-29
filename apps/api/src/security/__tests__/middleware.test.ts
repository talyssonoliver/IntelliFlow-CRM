import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@prisma/client';
import {
  createSecurityContextMiddleware,
  requirePermission,
  auditLog,
  requireAdmin,
  requireManager,
  requireRole,
  requireOwnership,
} from '../middleware';
import { resetRBACService } from '../rbac';
import { resetAuditLogger } from '../audit-logger';
import type { Context } from '../../context';

// Mock RBAC service - function must be defined outside to persist across clearAllMocks
const mockCan = vi.fn();

const mockRBACService = {
  can: mockCan,
  getRoleLevel: (role: string) => {
    const levels: Record<string, number> = {
      ADMIN: 100,
      MANAGER: 30,
      SALES_REP: 20,
      USER: 10,
      VIEWER: 0,
    };
    return levels[role] ?? 0;
  },
};

// Mock audit logger methods
const mockLogPermissionDenied = vi.fn();
const mockLogAction = vi.fn();
const mockAuditLogger = {
  logPermissionDenied: mockLogPermissionDenied,
  logAction: mockLogAction,
};

const mockGetAuditLogger = vi.fn();

vi.mock('../rbac', async () => {
  const actual = await vi.importActual('../rbac');
  return {
    ...actual,
    getRBACService: () => mockRBACService,
    resetRBACService: vi.fn(),
  };
});

vi.mock('../audit-logger', async () => {
  const actual = await vi.importActual('../audit-logger');
  return {
    ...actual,
    getAuditLogger: (...args: unknown[]) => mockGetAuditLogger(...args),
    resetAuditLogger: vi.fn(),
  };
});

// Helper to setup default mock implementations
function setupDefaultMocks() {
  vi.clearAllMocks();
  mockCan.mockResolvedValue({ granted: true, roleLevel: 100 });
  mockLogPermissionDenied.mockResolvedValue('log-123');
  mockLogAction.mockResolvedValue('log-123');
  mockGetAuditLogger.mockReturnValue(mockAuditLogger);
}

describe('Security Middleware', () => {
  let mockContext: Context;
  let mockPrisma: PrismaClient;
  const TEST_TENANT_ID = 'test-tenant-123';

  function createMockContext(user?: { userId: string; email: string; role: string; tenantId: string }): Context {
    return {
      prisma: mockPrisma,
      user,
      req: {
        headers: {
          get: vi.fn((name: string) => {
            if (name === 'x-forwarded-for') return '192.168.1.1';
            if (name === 'user-agent') return 'Test Agent';
            return null;
          }),
        },
      } as unknown as Request,
      res: undefined,
      services: {} as Context['services'],
      adapters: {} as Context['adapters'],
    };
  }

  beforeEach(() => {
    setupDefaultMocks();
    mockPrisma = {} as PrismaClient;
    mockContext = createMockContext({
      userId: 'user-123',
      email: 'user@example.com',
      role: 'ADMIN',
      tenantId: 'test-tenant-123',
    });
  });

  afterEach(() => {
    // Only clear mocks at end of test
    vi.clearAllMocks();
  });

  describe('createSecurityContextMiddleware', () => {
    it('should add security services to context', async () => {
      const middleware = createSecurityContextMiddleware();
      let capturedCtx: any;

      await middleware({
        ctx: mockContext,
        path: 'test.procedure',
        type: 'query',
        next: async (opts) => {
          capturedCtx = opts?.ctx;
          return { success: true };
        },
      });

      expect(capturedCtx.auditLogger).toBeDefined();
      expect(capturedCtx.rbac).toBeDefined();
      expect(capturedCtx.requestContext).toBeDefined();
      expect(capturedCtx.requestContext.requestId).toBeDefined();
    });

    it('should extract IP address from headers', async () => {
      const middleware = createSecurityContextMiddleware();
      let capturedCtx: any;

      await middleware({
        ctx: mockContext,
        path: 'test.procedure',
        type: 'query',
        next: async (opts) => {
          capturedCtx = opts?.ctx;
          return {};
        },
      });

      expect(capturedCtx.requestContext.ipAddress).toBe('192.168.1.1');
    });

    it('should extract user agent from headers', async () => {
      const middleware = createSecurityContextMiddleware();
      let capturedCtx: any;

      await middleware({
        ctx: mockContext,
        path: 'test.procedure',
        type: 'query',
        next: async (opts) => {
          capturedCtx = opts?.ctx;
          return {};
        },
      });

      expect(capturedCtx.requestContext.userAgent).toBe('Test Agent');
    });

    it('should extract IP from x-real-ip when x-forwarded-for is missing', async () => {
      const middleware = createSecurityContextMiddleware();
      let capturedCtx: any;

      const ctxWithRealIp = {
        ...mockContext,
        req: {
          headers: {
            get: vi.fn((name: string) => {
              if (name === 'x-forwarded-for') return null;
              if (name === 'x-real-ip') return '10.0.0.1';
              if (name === 'user-agent') return 'Test Agent';
              return null;
            }),
          },
        } as unknown as Request,
      };

      await middleware({
        ctx: ctxWithRealIp,
        path: 'test.procedure',
        type: 'query',
        next: async (opts) => {
          capturedCtx = opts?.ctx;
          return {};
        },
      });

      expect(capturedCtx.requestContext.ipAddress).toBe('10.0.0.1');
    });

    it('should handle undefined request', async () => {
      const middleware = createSecurityContextMiddleware();
      let capturedCtx: any;

      const ctxWithoutReq = {
        ...mockContext,
        req: undefined,
      };

      await middleware({
        ctx: ctxWithoutReq,
        path: 'test.procedure',
        type: 'query',
        next: async (opts) => {
          capturedCtx = opts?.ctx;
          return {};
        },
      });

      expect(capturedCtx.requestContext.ipAddress).toBeUndefined();
      expect(capturedCtx.requestContext.userAgent).toBeUndefined();
    });

    it('should handle missing headers.get method', async () => {
      const middleware = createSecurityContextMiddleware();
      let capturedCtx: any;

      const ctxWithoutGet = {
        ...mockContext,
        req: {
          headers: {},
        } as unknown as Request,
      };

      await middleware({
        ctx: ctxWithoutGet,
        path: 'test.procedure',
        type: 'query',
        next: async (opts) => {
          capturedCtx = opts?.ctx;
          return {};
        },
      });

      expect(capturedCtx.requestContext.ipAddress).toBeUndefined();
      expect(capturedCtx.requestContext.userAgent).toBeUndefined();
    });
  });

  describe('requirePermission', () => {
    it('should throw UNAUTHORIZED when no user', async () => {
      const middleware = requirePermission('lead:read');
      const ctxWithoutUser = {
        ...createMockContext(),
        auditLogger: { logPermissionDenied: vi.fn() },
        rbac: { can: vi.fn() },
        requestContext: { requestId: 'test' },
      };

      await expect(
        middleware({
          ctx: ctxWithoutUser as any,
          input: {},
          path: 'test',
          type: 'query',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should allow when permission granted', async () => {
      // The mock service is already configured with granted: true
      mockRBACService.can.mockResolvedValue({ granted: true });

      const middleware = requirePermission('lead:read');
      const securityCtx = {
        ...mockContext,
        auditLogger: { logPermissionDenied: vi.fn() },
        rbac: mockRBACService,
        requestContext: { requestId: 'test' },
      };

      const result = await middleware({
        ctx: securityCtx as any,
        input: {},
        path: 'test',
        type: 'query',
        next: async () => ({ success: true }),
      });

      expect(result).toEqual({ success: true });
    });

    it('should throw FORBIDDEN when permission denied', async () => {
      const middleware = requirePermission('lead:admin');
      const securityCtx = {
        ...mockContext,
        auditLogger: { logPermissionDenied: vi.fn().mockResolvedValue('log-123') },
        rbac: {
          can: vi.fn().mockResolvedValue({
            granted: false,
            reason: 'Insufficient permissions',
          }),
        },
        requestContext: { requestId: 'test', ipAddress: '127.0.0.1' },
      };

      await expect(
        middleware({
          ctx: securityCtx as any,
          input: {},
          path: 'test',
          type: 'mutation',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should log permission denied event', async () => {
      const logPermissionDenied = vi.fn().mockResolvedValue('log-123');
      const middleware = requirePermission({ permission: 'lead:admin', logDenied: true });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logPermissionDenied },
        rbac: {
          can: vi.fn().mockResolvedValue({
            granted: false,
            reason: 'Insufficient permissions',
          }),
        },
        requestContext: { requestId: 'test' },
      };

      try {
        await middleware({
          ctx: securityCtx as any,
          input: {},
          path: 'test',
          type: 'mutation',
          next: async () => ({}),
        });
      } catch {
        // Expected
      }

      expect(logPermissionDenied).toHaveBeenCalled();
    });

    it('should accept string or options object', async () => {
      const middleware1 = requirePermission('lead:read');
      const middleware2 = requirePermission({ permission: 'lead:read' });

      expect(middleware1).toBeDefined();
      expect(middleware2).toBeDefined();
    });

    it('should call getOwnerId when provided', async () => {
      const getOwnerId = vi.fn().mockResolvedValue('owner-123');
      mockRBACService.can.mockResolvedValue({ granted: true });

      const middleware = requirePermission({
        permission: 'lead:read',
        getOwnerId,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logPermissionDenied: vi.fn() },
        rbac: mockRBACService,
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: { id: 'lead-123' },
        path: 'test',
        type: 'query',
        next: async () => ({ success: true }),
      });

      expect(getOwnerId).toHaveBeenCalledWith(securityCtx, { id: 'lead-123' });
    });

    it('should call getResourceId when provided', async () => {
      const getResourceId = vi.fn().mockReturnValue('resource-456');
      mockRBACService.can.mockResolvedValue({ granted: true });

      const middleware = requirePermission({
        permission: 'lead:read',
        getResourceId,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logPermissionDenied: vi.fn() },
        rbac: mockRBACService,
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: { customId: 'custom-123' },
        path: 'test',
        type: 'query',
        next: async () => ({ success: true }),
      });

      expect(getResourceId).toHaveBeenCalledWith({ customId: 'custom-123' });
    });

    it('should skip logging when logDenied is false', async () => {
      const logPermissionDenied = vi.fn();
      const middleware = requirePermission({
        permission: 'lead:admin',
        logDenied: false,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logPermissionDenied },
        rbac: {
          can: vi.fn().mockResolvedValue({
            granted: false,
            reason: 'No permission',
          }),
        },
        requestContext: { requestId: 'test' },
      };

      try {
        await middleware({
          ctx: securityCtx as any,
          input: {},
          path: 'test',
          type: 'mutation',
          next: async () => ({}),
        });
      } catch {
        // Expected
      }

      expect(logPermissionDenied).not.toHaveBeenCalled();
    });
  });

  describe('auditLog', () => {
    it('should log action after successful execution', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: { id: 'lead-123' },
        path: 'lead.create',
        type: 'mutation',
        next: async () => ({ id: 'lead-123', name: 'New Lead' }),
      });

      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'lead',
        'lead-123',
        expect.any(String), // tenantId
        expect.any(Object)
      );
    });

    it('should log action even after error', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await expect(
        middleware({
          ctx: securityCtx as any,
          input: { id: 'lead-123' },
          path: 'lead.create',
          type: 'mutation',
          next: async () => {
            throw new Error('Operation failed');
          },
        })
      ).rejects.toThrow('Operation failed');

      expect(logAction).toHaveBeenCalled();
    });

    it('should skip logging when skipIf returns true', async () => {
      const logAction = vi.fn();
      const middleware = auditLog({
        action: 'READ',
        resourceType: 'lead',
        skipIf: () => true,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: {},
        path: 'lead.get',
        type: 'query',
        next: async () => ({}),
      });

      expect(logAction).not.toHaveBeenCalled();
    });

    it('should get before state for updates', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const getBeforeState = vi.fn().mockResolvedValue({ status: 'NEW' });
      const middleware = auditLog({
        action: 'UPDATE',
        resourceType: 'lead',
        getBeforeState,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: { id: 'lead-123' },
        path: 'lead.update',
        type: 'mutation',
        next: async () => ({ status: 'QUALIFIED' }),
      });

      expect(getBeforeState).toHaveBeenCalled();
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'lead',
        'lead-123',
        expect.any(String), // tenantId
        expect.objectContaining({
          beforeState: { status: 'NEW' },
        })
      );
    });

    it('should use custom getResourceId', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
        getResourceId: (result: any) => result?.customId,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: {},
        path: 'lead.create',
        type: 'mutation',
        next: async () => ({ customId: 'custom-lead-456' }),
      });

      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'lead',
        'custom-lead-456',
        expect.any(String), // tenantId
        expect.any(Object)
      );
    });

    it('should handle logging failure gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logAction = vi.fn().mockRejectedValue(new Error('Logging failed'));
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      const result = await middleware({
        ctx: securityCtx as any,
        input: { id: 'lead-123' },
        path: 'lead.create',
        type: 'mutation',
        next: async () => ({ id: 'lead-123', name: 'New Lead' }),
      });

      // Should not throw, should complete successfully
      expect(result).toEqual({ id: 'lead-123', name: 'New Lead' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AUDIT] Failed to log action:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should use getResourceName when provided', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const getResourceName = vi.fn().mockReturnValue('Test Lead Name');
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
        getResourceName,
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: { name: 'Test Lead Name' },
        path: 'lead.create',
        type: 'mutation',
        next: async () => ({ id: 'lead-123', name: 'Test Lead Name' }),
      });

      expect(getResourceName).toHaveBeenCalled();
      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'lead',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          resourceName: 'Test Lead Name',
        })
      );
    });

    it('should fallback to "unknown" resource ID when not available', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
      });
      const securityCtx = {
        ...mockContext,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: securityCtx as any,
        input: {}, // No id field
        path: 'lead.create',
        type: 'mutation',
        next: async () => ({ name: 'New Lead' }), // No id in result
      });

      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'lead',
        'unknown',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use "unknown" tenantId when user is missing', async () => {
      const logAction = vi.fn().mockResolvedValue('log-123');
      const middleware = auditLog({
        action: 'CREATE',
        resourceType: 'lead',
      });
      const ctxWithoutUser = {
        ...createMockContext(),
        user: undefined,
        auditLogger: { logAction },
        requestContext: { requestId: 'test' },
      };

      await middleware({
        ctx: ctxWithoutUser as any,
        input: { id: 'lead-123' },
        path: 'lead.create',
        type: 'mutation',
        next: async () => ({ id: 'lead-123' }),
      });

      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'lead',
        'lead-123',
        'unknown',
        expect.objectContaining({
          actorId: undefined,
          actorEmail: undefined,
          actorRole: undefined,
        })
      );
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin users', async () => {
      const middleware = requireAdmin();

      const result = await middleware({
        ctx: mockContext as any,
        path: 'admin.action',
        type: 'mutation',
        next: async () => ({ success: true }),
      });

      expect(result).toEqual({ success: true });
    });

    it('should deny non-admin users', async () => {
      const middleware = requireAdmin();
      const nonAdminCtx = createMockContext({
        userId: 'user-123',
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'test-tenant-123',
      });

      await expect(
        middleware({
          ctx: nonAdminCtx as any,
          path: 'admin.action',
          type: 'mutation',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated users', async () => {
      const middleware = requireAdmin();
      const noUserCtx = createMockContext();

      await expect(
        middleware({
          ctx: noUserCtx as any,
          path: 'admin.action',
          type: 'mutation',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('requireManager', () => {
    it('should allow admin users', async () => {
      const middleware = requireManager();

      const result = await middleware({
        ctx: mockContext as any,
        path: 'manager.action',
        type: 'mutation',
        next: async () => ({ success: true }),
      });

      expect(result).toEqual({ success: true });
    });

    it('should allow manager users', async () => {
      const middleware = requireManager();
      const managerCtx = createMockContext({
        userId: 'user-123',
        email: 'manager@example.com',
        role: 'MANAGER',
        tenantId: TEST_TENANT_ID,
      });

      const result = await middleware({
        ctx: managerCtx as any,
        path: 'manager.action',
        type: 'mutation',
        next: async () => ({ success: true }),
      });

      expect(result).toEqual({ success: true });
    });

    it('should deny sales rep users', async () => {
      const middleware = requireManager();
      const salesRepCtx = createMockContext({
        userId: 'user-123',
        email: 'sales@example.com',
        role: 'SALES_REP',
        tenantId: TEST_TENANT_ID,
      });

      await expect(
        middleware({
          ctx: salesRepCtx as any,
          path: 'manager.action',
          type: 'mutation',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('requireRole', () => {
    it('should allow users at or above minimum role', async () => {
      const middleware = requireRole('SALES_REP');
      const managerCtx = {
        ...createMockContext({
          userId: 'user-123',
          email: 'manager@example.com',
          role: 'MANAGER',
          tenantId: TEST_TENANT_ID,
        }),
        prisma: mockPrisma,
      };

      const result = await middleware({
        ctx: managerCtx as any,
        path: 'test',
        type: 'query',
        next: async () => ({ success: true }),
      });

      expect(result).toEqual({ success: true });
    });

    it('should deny users below minimum role', async () => {
      const middleware = requireRole('MANAGER');
      const userCtx = {
        ...createMockContext({
          userId: 'user-123',
          email: 'user@example.com',
          role: 'USER',
          tenantId: TEST_TENANT_ID,
        }),
        prisma: mockPrisma,
      };

      await expect(
        middleware({
          ctx: userCtx as any,
          path: 'test',
          type: 'query',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw UNAUTHORIZED when no user', async () => {
      const middleware = requireRole('USER');
      const noUserCtx = {
        ...createMockContext(),
        prisma: mockPrisma,
      };

      await expect(
        middleware({
          ctx: noUserCtx as any,
          path: 'test',
          type: 'query',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('requireOwnership', () => {
    it('should allow owner to access resource', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => 'user-123',
      });
      const userCtx = createMockContext({
        userId: 'user-123',
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'test-tenant-123',
      });

      const result = await middleware({
        ctx: userCtx as any,
        input: { id: 'resource-123' },
        path: 'resource.get',
        type: 'query',
        next: async () => ({ id: 'resource-123' }),
      });

      expect(result).toEqual({ id: 'resource-123' });
    });

    it('should deny non-owner access', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => 'other-user',
      });
      const userCtx = createMockContext({
        userId: 'user-123',
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'test-tenant-123',
      });

      await expect(
        middleware({
          ctx: userCtx as any,
          input: { id: 'resource-123' },
          path: 'resource.get',
          type: 'query',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should allow admin to access any resource', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => 'other-user',
      });

      const result = await middleware({
        ctx: mockContext as any,
        input: { id: 'resource-123' },
        path: 'resource.get',
        type: 'query',
        next: async () => ({ id: 'resource-123' }),
      });

      expect(result).toEqual({ id: 'resource-123' });
    });

    it('should allow manager to access any resource', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => 'other-user',
      });
      const managerCtx = createMockContext({
        userId: 'manager-123',
        email: 'manager@example.com',
        role: 'MANAGER',
        tenantId: 'test-tenant-123',
      });

      const result = await middleware({
        ctx: managerCtx as any,
        input: { id: 'resource-123' },
        path: 'resource.get',
        type: 'query',
        next: async () => ({ id: 'resource-123' }),
      });

      expect(result).toEqual({ id: 'resource-123' });
    });

    it('should accept custom allowed roles', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => 'other-user',
        allowRoles: ['ADMIN'], // Only admin, not manager
      });
      const managerCtx = createMockContext({
        userId: 'manager-123',
        email: 'manager@example.com',
        role: 'MANAGER',
        tenantId: 'test-tenant-123',
      });

      await expect(
        middleware({
          ctx: managerCtx as any,
          input: { id: 'resource-123' },
          path: 'resource.get',
          type: 'query',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw UNAUTHORIZED when no user', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => 'some-user',
      });
      const noUserCtx = createMockContext();

      await expect(
        middleware({
          ctx: noUserCtx as any,
          input: {},
          path: 'resource.get',
          type: 'query',
          next: async () => ({}),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should allow access when ownerId is null/undefined', async () => {
      const middleware = requireOwnership({
        getOwnerId: async () => undefined,
      });
      const userCtx = createMockContext({
        userId: 'user-123',
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'test-tenant-123',
      });

      const result = await middleware({
        ctx: userCtx as any,
        input: { id: 'resource-123' },
        path: 'resource.get',
        type: 'query',
        next: async () => ({ id: 'resource-123' }),
      });

      expect(result).toEqual({ id: 'resource-123' });
    });
  });
});
