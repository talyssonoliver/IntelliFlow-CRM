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
const mockRBACService = {
  can: vi.fn().mockResolvedValue({ granted: true, roleLevel: 100 }),
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
    getAuditLogger: vi.fn().mockReturnValue({
      logPermissionDenied: vi.fn().mockResolvedValue('log-123'),
      logAction: vi.fn().mockResolvedValue('log-123'),
    }),
    resetAuditLogger: vi.fn(),
  };
});

describe('Security Middleware', () => {
  let mockContext: Context;
  let mockPrisma: PrismaClient;

  function createMockContext(user?: { userId: string; email: string; role: string }): Context {
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
    };
  }

  beforeEach(() => {
    mockPrisma = {} as PrismaClient;
    mockContext = createMockContext({
      userId: 'user-123',
      email: 'user@example.com',
      role: 'ADMIN',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Only clear mocks, don't restore - module-level mocks should persist
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
        expect.any(Object)
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
  });
});
