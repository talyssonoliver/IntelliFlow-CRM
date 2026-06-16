/**
 * Tenant Context Unit Tests
 *
 * Tests for tenant isolation and multi-tenancy support
 *
 * @module @intelliflow/api/security/tests
 * @task IFC-127
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import {
  extractTenantContext,
  createTenantScopedPrisma,
  tenantContextMiddleware,
  verifyTenantAccess,
  createTenantWhereClause,
  validateTenantOperation,
  getTeamMemberIds,
  enrichTenantContext,
  hasTenantContext,
  assertTenantContext,
  getTenantContext,
  type TenantContext,
  type TenantAwareContext,
} from '../tenant-context';
import type { Context } from '../../context';

// Mock PrismaClient - $extends returns an extended client object
const createMockPrisma = () => {
  const mockClient = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
    },
    teamMember: {
      findMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
    $extends: vi.fn(),
  };
  // $extends returns a new mock that acts like an extended client
  mockClient.$extends.mockReturnValue({
    ...mockClient,
    _isExtended: true,
  });
  return mockClient;
};

let mockPrisma: ReturnType<typeof createMockPrisma>;

// Test constants
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000002';
const TEST_OTHER_USER_ID = '00000000-0000-4000-8000-000000000003';

describe('Tenant Context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);
    mockPrisma.teamMember.findMany.mockResolvedValue([]);
  });

  describe('extractTenantContext', () => {
    it('should extract context from authenticated user', () => {
      const user = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        role: 'SALES_REP',
        email: 'test@example.com',
      };

      const context = extractTenantContext(user);

      expect(context.tenantId).toBe(TEST_TENANT_ID);
      expect(context.userId).toBe(TEST_USER_ID);
      expect(context.role).toBe('SALES_REP');
      expect(context.tenantType).toBe('user');
      expect(context.canAccessAllTenantData).toBe(false);
    });

    it('should set canAccessAllTenantData true for ADMIN', () => {
      const user = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const context = extractTenantContext(user);

      expect(context.canAccessAllTenantData).toBe(true);
    });

    it('should set canAccessAllTenantData true for MANAGER', () => {
      const user = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        role: 'MANAGER',
        email: 'manager@example.com',
      };

      const context = extractTenantContext(user);

      expect(context.canAccessAllTenantData).toBe(true);
    });

    it('should throw UNAUTHORIZED for null user', () => {
      expect(() => extractTenantContext(null as any)).toThrow(TRPCError);
      expect(() => extractTenantContext(null as any)).toThrow(/Authentication required/);
    });

    it('should throw UNAUTHORIZED for undefined user', () => {
      expect(() => extractTenantContext(undefined as any)).toThrow(TRPCError);
    });
  });

  describe('createTenantScopedPrisma', () => {
    it('should return a Prisma client with extensions', () => {
      // This test asserts the production path that actually calls $extends.
      // The function has a short-circuit for VITEST/NODE_ENV=test (see
      // tenant-context.ts) so the wrapper does not crash on mock Prisma
      // clients in every router test. Temporarily un-set those to force the
      // production branch and verify $extends is invoked.
      const prevVitest = process.env.VITEST;
      const prevNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      try {
        const tenant: TenantContext = {
          tenantId: TEST_TENANT_ID,
          tenantType: 'user',
          userId: TEST_USER_ID,
          role: 'ADMIN',
          canAccessAllTenantData: true,
        };

        const scopedPrisma = createTenantScopedPrisma(
          mockPrisma as any /* test-only mock */,
          tenant
        );

        expect(mockPrisma.$extends).toHaveBeenCalled();
        expect(scopedPrisma).toBeDefined();
      } finally {
        if (prevVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = prevVitest;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
      }
    });

    it('should issue SET at most once per client instance (RLS SET storm fix)', async () => {
      // Verify the $allOperations callback only issues SET on the first query.
      // We capture the callback passed to $extends and invoke it directly,
      // simulating multiple Prisma queries within the same request.
      const prevVitest = process.env.VITEST;
      const prevNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';

      try {
        const tenant: TenantContext = {
          tenantId: TEST_TENANT_ID,
          tenantType: 'user',
          userId: TEST_USER_ID,
          role: 'ADMIN',
          canAccessAllTenantData: true,
        };

        // Capture the query extension config passed to $extends
        let capturedQueryConfig: Record<string, unknown> | null = null;
        mockPrisma.$extends.mockImplementation((config: unknown) => {
          capturedQueryConfig = (config as { query: Record<string, unknown> }).query;
          return mockPrisma; // return the mock itself as the "extended" client
        });

        createTenantScopedPrisma(mockPrisma as any, tenant);

        expect(capturedQueryConfig).not.toBeNull();

        // Extract and invoke the $allOperations callback directly
        const allModels = (capturedQueryConfig as unknown as Record<string, unknown>)[
          '$allModels'
        ] as Record<string, unknown>;
        const allOperations = allModels['$allOperations'] as (opts: {
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) => Promise<unknown>;

        const mockQuery = vi.fn().mockResolvedValue('result');
        mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

        // Simulate 3 sequential queries within the same request
        await allOperations({ args: {}, query: mockQuery });
        await allOperations({ args: {}, query: mockQuery });
        await allOperations({ args: {}, query: mockQuery });

        // SET must be issued only once — not before every query
        expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
        expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
          `SET app.current_tenant_id = '${TEST_TENANT_ID}'`
        );
        // All 3 queries must still be called
        expect(mockQuery).toHaveBeenCalledTimes(3);
      } finally {
        if (prevVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = prevVitest;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
      }
    });

    it('should reject invalid tenantId format to prevent SQL injection', () => {
      const prevVitest = process.env.VITEST;
      const prevNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      try {
        const tenant: TenantContext = {
          tenantId: "'; DROP TABLE users; --",
          tenantType: 'user',
          userId: TEST_USER_ID,
          role: 'ADMIN',
          canAccessAllTenantData: true,
        };

        expect(() => createTenantScopedPrisma(mockPrisma as any, tenant)).toThrow(
          /invalid tenantId format/
        );
      } finally {
        if (prevVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = prevVitest;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
      }
    });

    it('accepts a Prisma cuid tenantId (JIT-provisioned orgs) and issues SET with it', async () => {
      // Regression for incident 2026-06-16: Tenant.id is @default(cuid()), so a
      // per-user provisioned org has a cuid id. The prior UUID-only guard rejected
      // it and broke every tenant-scoped query ("invalid tenantId format").
      const prevVitest = process.env.VITEST;
      const prevNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      try {
        const CUID = 'cmqgpih4e000004jyh6mmv87m'; // real shape from the incident
        const tenant: TenantContext = {
          tenantId: CUID,
          tenantType: 'user',
          userId: TEST_USER_ID,
          role: 'ADMIN',
          canAccessAllTenantData: true,
        };

        let capturedQueryConfig: Record<string, unknown> | null = null;
        mockPrisma.$extends.mockImplementation((config: unknown) => {
          capturedQueryConfig = (config as { query: Record<string, unknown> }).query;
          return mockPrisma;
        });

        // A cuid must NOT throw (it did under the old UUID-only check).
        expect(() => createTenantScopedPrisma(mockPrisma as any, tenant)).not.toThrow();

        const allModels = (capturedQueryConfig as unknown as Record<string, unknown>)[
          '$allModels'
        ] as Record<string, unknown>;
        const allOperations = allModels['$allOperations'] as (opts: {
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) => Promise<unknown>;
        const mockQuery = vi.fn().mockResolvedValue('result');
        mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

        await allOperations({ args: {}, query: mockQuery });

        expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
          `SET app.current_tenant_id = '${CUID}'`
        );
      } finally {
        if (prevVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = prevVitest;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
      }
    });
  });

  describe('tenantContextMiddleware', () => {
    const createMockContext = (user: Context['user']): Context =>
      ({
        user,
        prisma: mockPrisma as any /* test-only mock */,
        req: {
          headers: {
            get: vi.fn().mockReturnValue(null),
          },
        },
      }) as any as Context;

    it('should add tenant context for authenticated user', async () => {
      const user = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        role: 'SALES_REP',
        email: 'test@example.com',
      };
      const ctx = createMockContext(user);
      const next = vi.fn().mockResolvedValue({ result: 'success' });

      const middleware = tenantContextMiddleware();
      await middleware({ ctx, next });

      expect(next).toHaveBeenCalled();
      const calledCtx = next.mock.calls[0][0].ctx;
      expect(calledCtx.tenant).toBeDefined();
      expect(calledCtx.tenant.userId).toBe(TEST_USER_ID);
      expect(calledCtx.prismaWithTenant).toBeDefined();
    });

    it('should throw UNAUTHORIZED when requireAuth and no user', async () => {
      const ctx = createMockContext(null);
      const next = vi.fn();

      const middleware = tenantContextMiddleware({ requireAuth: true });

      await expect(middleware({ ctx, next })).rejects.toThrow(TRPCError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow unauthenticated when requireAuth is false', async () => {
      const ctx = createMockContext(null);
      const next = vi.fn().mockResolvedValue({ result: 'success' });

      const middleware = tenantContextMiddleware({ requireAuth: false });
      await middleware({ ctx, next });

      expect(next).toHaveBeenCalled();
    });

    it('should allow service role bypass when enabled', async () => {
      const originalEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

      const ctx = {
        user: null,
        prisma: mockPrisma as any /* test-only mock */,
        req: {
          headers: {
            get: vi.fn().mockReturnValue('service-key'),
          },
        },
      } as any as Context;
      const next = vi.fn().mockResolvedValue({ result: 'success' });

      const middleware = tenantContextMiddleware({ allowServiceRole: true });
      await middleware({ ctx, next });

      expect(next).toHaveBeenCalled();
      const calledCtx = next.mock.calls[0][0].ctx;
      expect(calledCtx.tenant.tenantId).toBe('service');
      expect(calledCtx.tenant.role).toBe('SERVICE');
      expect(calledCtx.tenant.canAccessAllTenantData).toBe(true);

      process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv;
    });
  });

  describe('verifyTenantAccess', () => {
    const createTenantAwareContext = (tenant: Partial<TenantContext>): TenantAwareContext =>
      ({
        prisma: mockPrisma as any /* test-only mock */,
        tenant: {
          tenantId: TEST_TENANT_ID,
          tenantType: 'user',
          userId: TEST_USER_ID,
          role: 'USER',
          canAccessAllTenantData: false,
          ...tenant,
        },
      }) as TenantAwareContext;

    it('should allow access to own resources', async () => {
      const ctx = createTenantAwareContext({ userId: TEST_USER_ID });

      const result = await verifyTenantAccess(ctx, TEST_USER_ID);

      expect(result.allowed).toBe(true);
    });

    it('should allow ADMIN access to any resource', async () => {
      const ctx = createTenantAwareContext({ role: 'ADMIN' });

      const result = await verifyTenantAccess(ctx, TEST_OTHER_USER_ID);

      expect(result.allowed).toBe(true);
    });

    it('should allow MANAGER access to team members', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'SALES_REP' });
      const ctx = createTenantAwareContext({ role: 'MANAGER' });

      const result = await verifyTenantAccess(ctx, TEST_OTHER_USER_ID);

      expect(result.allowed).toBe(true);
    });

    it('should deny MANAGER access to other managers', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'MANAGER' });
      const ctx = createTenantAwareContext({ role: 'MANAGER' });

      const result = await verifyTenantAccess(ctx, TEST_OTHER_USER_ID);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cross-tenant access denied');
    });

    it('should deny USER access to other user resources', async () => {
      const ctx = createTenantAwareContext({ role: 'USER' });

      const result = await verifyTenantAccess(ctx, TEST_OTHER_USER_ID);

      expect(result.allowed).toBe(false);
    });

    it('should respect allowAdmin option', async () => {
      const ctx = createTenantAwareContext({ role: 'ADMIN' });

      const result = await verifyTenantAccess(ctx, TEST_OTHER_USER_ID, {
        allowAdmin: false,
      });

      expect(result.allowed).toBe(false);
    });

    it('should respect allowManager option', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'SALES_REP' });
      const ctx = createTenantAwareContext({ role: 'MANAGER' });

      const result = await verifyTenantAccess(ctx, TEST_OTHER_USER_ID, {
        allowManager: false,
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('createTenantWhereClause', () => {
    it('should return base clause for ADMIN', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'ADMIN',
        canAccessAllTenantData: true,
      };

      const result = createTenantWhereClause(tenant, { status: 'ACTIVE' });

      // Defense-in-depth: tenantId is always included (see function comment)
      // even for ADMIN — RLS SET may land on a different pool connection than
      // the query, so the application-layer filter is always applied.
      expect(result).toEqual({ status: 'ACTIVE', tenantId: TEST_TENANT_ID });
      expect(result.ownerId).toBeUndefined();
    });

    it('should add team member filter for MANAGER with team', () => {
      const teamMemberIds = ['member-1', 'member-2'];
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'MANAGER',
        canAccessAllTenantData: true,
        teamMemberIds,
      };

      const result = createTenantWhereClause(tenant, { status: 'ACTIVE' });

      expect(result.status).toBe('ACTIVE');
      expect(result.ownerId).toEqual({
        in: [TEST_USER_ID, 'member-1', 'member-2'],
      });
    });

    it('should add owner filter for regular USER', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'USER',
        canAccessAllTenantData: false,
      };

      const result = createTenantWhereClause(tenant, { status: 'ACTIVE' });

      expect(result.status).toBe('ACTIVE');
      expect(result.ownerId).toBe(TEST_USER_ID);
    });

    it('should handle empty additionalWhere', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      };

      const result = createTenantWhereClause(tenant);

      expect(result.ownerId).toBe(TEST_USER_ID);
    });
  });

  describe('validateTenantOperation', () => {
    it('should allow operation on own resources', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'USER',
        canAccessAllTenantData: false,
      };

      expect(() =>
        validateTenantOperation(tenant, 'create', { ownerId: TEST_USER_ID })
      ).not.toThrow();
    });

    it('should allow ADMIN to create for anyone', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'ADMIN',
        canAccessAllTenantData: true,
      };

      expect(() =>
        validateTenantOperation(tenant, 'create', {
          ownerId: TEST_OTHER_USER_ID,
        })
      ).not.toThrow();
    });

    it('should allow MANAGER to create for team members', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'MANAGER',
        canAccessAllTenantData: true,
        teamMemberIds: [TEST_OTHER_USER_ID],
      };

      expect(() =>
        validateTenantOperation(tenant, 'create', {
          ownerId: TEST_OTHER_USER_ID,
        })
      ).not.toThrow();
    });

    it('should throw for cross-tenant create by USER', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'USER',
        canAccessAllTenantData: false,
      };

      expect(() =>
        validateTenantOperation(tenant, 'create', {
          ownerId: TEST_OTHER_USER_ID,
        })
      ).toThrow(TRPCError);
    });

    it('should throw for cross-tenant update by SALES_REP', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      };

      expect(() =>
        validateTenantOperation(tenant, 'update', {
          ownerId: TEST_OTHER_USER_ID,
        })
      ).toThrow(/Cannot update resource for another tenant/);
    });
  });

  describe('getTeamMemberIds (#428)', () => {
    it('returns members of the teams the manager leads, tenant-scoped, excluding self', async () => {
      mockPrisma.team.findMany.mockResolvedValue([{ id: 'team-1' }]);
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { userId: TEST_USER_ID }, // the manager themselves — excluded
        { userId: 'member-1' },
        { userId: 'member-2' },
      ]);

      const result = await getTeamMemberIds(
        mockPrisma as any /* test-only mock */,
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      expect(result).toEqual(['member-1', 'member-2']);
      expect(mockPrisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TEST_TENANT_ID }) })
      );
      expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TEST_TENANT_ID, teamId: { in: ['team-1'] } }),
        })
      );
    });

    it('dedupes members across multiple led teams', async () => {
      mockPrisma.team.findMany.mockResolvedValue([{ id: 'team-1' }, { id: 'team-2' }]);
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { userId: 'member-1' },
        { userId: 'member-1' },
        { userId: 'member-2' },
      ]);

      const result = await getTeamMemberIds(mockPrisma as any, TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toEqual(['member-1', 'member-2']);
    });

    it('returns [] (and never queries members) when the manager leads no team', async () => {
      mockPrisma.team.findMany.mockResolvedValue([]);

      const result = await getTeamMemberIds(mockPrisma as any, TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.teamMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('enrichTenantContext (#428)', () => {
    it('adds team-member IDs for a MANAGER', async () => {
      mockPrisma.team.findMany.mockResolvedValue([{ id: 'team-1' }]);
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { userId: 'member-1' },
        { userId: 'member-2' },
      ]);

      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'MANAGER',
        canAccessAllTenantData: true,
      };

      const result = await enrichTenantContext(mockPrisma as any /* test-only mock */, tenant);

      expect(result.teamMemberIds).toEqual(['member-1', 'member-2']);
    });

    it('does NOT enrich ADMIN (sees all tenant data via the ADMIN branch)', async () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'ADMIN',
        canAccessAllTenantData: true,
      };

      const result = await enrichTenantContext(mockPrisma as any /* test-only mock */, tenant);

      expect(result.teamMemberIds).toBeUndefined();
      expect(mockPrisma.team.findMany).not.toHaveBeenCalled();
    });

    it('returns unchanged context for a regular USER', async () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'USER',
        canAccessAllTenantData: false,
      };

      const result = await enrichTenantContext(mockPrisma as any /* test-only mock */, tenant);

      expect(result).toEqual(tenant);
      expect(result.teamMemberIds).toBeUndefined();
    });

    it('fails closed: a team-lookup error leaves the manager owner-scoped', async () => {
      mockPrisma.team.findMany.mockRejectedValue(new Error('db down'));

      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'MANAGER',
        canAccessAllTenantData: true,
      };

      const result = await enrichTenantContext(mockPrisma as any /* test-only mock */, tenant);

      expect(result.teamMemberIds).toBeUndefined();
    });
  });

  describe('hasTenantContext', () => {
    it('should return true for TenantAwareContext', () => {
      const ctx = {
        prisma: mockPrisma,
        tenant: {
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
        },
      } as any as Context;

      expect(hasTenantContext(ctx)).toBe(true);
    });

    it('should return false for regular Context', () => {
      const ctx = {
        prisma: mockPrisma,
      } as any as Context;

      expect(hasTenantContext(ctx)).toBe(false);
    });

    it('should return false for undefined tenant', () => {
      const ctx = {
        prisma: mockPrisma,
        tenant: undefined,
      } as any as Context;

      expect(hasTenantContext(ctx)).toBe(false);
    });
  });

  describe('assertTenantContext', () => {
    it('should not throw for TenantAwareContext', () => {
      const ctx = {
        prisma: mockPrisma,
        tenant: {
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
        },
      } as any as Context;

      expect(() => assertTenantContext(ctx)).not.toThrow();
    });

    it('should throw for regular Context', () => {
      const ctx = {
        prisma: mockPrisma,
      } as any as Context;

      expect(() => assertTenantContext(ctx)).toThrow(TRPCError);
      expect(() => assertTenantContext(ctx)).toThrow(/Tenant context not initialized/);
    });
  });

  describe('getTenantContext', () => {
    it('should return typed context for TenantAwareContext', () => {
      const tenant: TenantContext = {
        tenantId: TEST_TENANT_ID,
        tenantType: 'user',
        userId: TEST_USER_ID,
        role: 'ADMIN',
        canAccessAllTenantData: true,
      };
      const ctx = {
        prisma: mockPrisma,
        tenant,
        prismaWithTenant: mockPrisma,
      } as any as Context;

      const result = getTenantContext(ctx);

      expect(result.tenant).toEqual(tenant);
    });

    it('should throw for regular Context', () => {
      const ctx = {
        prisma: mockPrisma,
      } as any as Context;

      expect(() => getTenantContext(ctx)).toThrow(TRPCError);
    });
  });
});
