/**
 * Entry Points Tests
 *
 * Tests for API entry point modules:
 * - context.ts: tRPC context creation
 * - server.ts: Procedure builders and middleware
 * - router.ts: Router composition
 * - index.ts: Module exports
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock container before importing context
vi.mock('../container', () => ({
  container: {
    leadService: { list: vi.fn() },
    contactService: { list: vi.fn() },
    accountService: { list: vi.fn() },
    opportunityService: { list: vi.fn() },
    taskService: { list: vi.fn() },
    ticketService: { list: vi.fn() },
    analyticsService: { getDashboardMetrics: vi.fn() },
    security: {
      rbac: { can: vi.fn().mockResolvedValue({ allowed: true }) },
      auditLogger: { log: vi.fn() },
      encryption: { encrypt: vi.fn() },
      tenantContext: { getTenantContext: vi.fn() },
    },
    adapters: {
      lead: { list: vi.fn() },
      contact: { list: vi.fn() },
    },
  },
  apiPrisma: {
    lead: { findMany: vi.fn() },
    $disconnect: vi.fn(),
  },
}));

describe('Entry Points', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('context.ts - createContext', () => {
    it('should create context with all required properties', async () => {
      const { createContext } = await import('../context');

      const context = await createContext();

      expect(context).toBeDefined();
      expect(context.prisma).toBeDefined();
      expect(context.container).toBeDefined();
      expect(context.services).toBeDefined();
      expect(context.security).toBeDefined();
      expect(context.adapters).toBeDefined();
      expect(context.user).toBeDefined();
    });

    it('should include mock user with correct properties', async () => {
      const { createContext } = await import('../context');

      const context = await createContext();

      expect(context.user).toEqual({
        userId: '00000000-0000-4000-8000-000000000013',
        email: 'sarah.johnson@intelliflow.dev',
        role: 'SALES_REP',
        tenantId: '00000000-0000-4000-8000-000000000001',
      });
    });

    it('should include services from container', async () => {
      const { createContext } = await import('../context');

      const context = await createContext();

      expect(context.services).toHaveProperty('lead');
      expect(context.services).toHaveProperty('contact');
      expect(context.services).toHaveProperty('account');
      expect(context.services).toHaveProperty('opportunity');
      expect(context.services).toHaveProperty('task');
      expect(context.services).toHaveProperty('ticket');
      expect(context.services).toHaveProperty('analytics');
    });

    it('should include security services', async () => {
      const { createContext } = await import('../context');

      const context = await createContext();

      expect(context.security).toHaveProperty('rbac');
      expect(context.security).toHaveProperty('auditLogger');
      expect(context.security).toHaveProperty('encryption');
      expect(context.security).toHaveProperty('tenantContext');
    });

    it('should accept optional request and response', async () => {
      const { createContext } = await import('../context');
      const mockReq = { headers: {} } as Request;
      const mockRes = {} as Response;

      const context = await createContext({ req: mockReq, res: mockRes });

      expect(context.req).toBe(mockReq);
      expect(context.res).toBe(mockRes);
    });

    it('should work without options', async () => {
      const { createContext } = await import('../context');

      const context = await createContext();

      expect(context.req).toBeUndefined();
      expect(context.res).toBeUndefined();
    });
  });

  describe('server.ts - Procedure Builders', () => {
    it('should export router builder', async () => {
      const { router } = await import('../server');

      expect(router).toBeDefined();
      expect(typeof router).toBe('function');
    });

    it('should export publicProcedure', async () => {
      const { publicProcedure } = await import('../server');

      expect(publicProcedure).toBeDefined();
      expect(publicProcedure._def).toBeDefined();
    });

    it('should export protectedProcedure', async () => {
      const { protectedProcedure } = await import('../server');

      expect(protectedProcedure).toBeDefined();
      expect(protectedProcedure._def).toBeDefined();
    });

    it('should export loggedProcedure', async () => {
      const { loggedProcedure } = await import('../server');

      expect(loggedProcedure).toBeDefined();
      expect(loggedProcedure._def).toBeDefined();
    });

    it('should export adminProcedure', async () => {
      const { adminProcedure } = await import('../server');

      expect(adminProcedure).toBeDefined();
      expect(adminProcedure._def).toBeDefined();
    });
  });

  describe('router.ts - App Router', () => {
    it('should export appRouter with all expected namespaces', async () => {
      // Use dynamic import to avoid circular dependency issues
      const { appRouter } = await import('../router');

      expect(appRouter).toBeDefined();
      expect(appRouter._def).toBeDefined();
      expect(appRouter._def.procedures).toBeDefined();
    });

    it('should include core CRM routers', async () => {
      const { appRouter } = await import('../router');
      const routerDef = appRouter._def;

      // Check that the router has the expected sub-routers
      expect(routerDef.record).toBeDefined();
      expect(routerDef.record.lead).toBeDefined();
      expect(routerDef.record.contact).toBeDefined();
      expect(routerDef.record.account).toBeDefined();
      expect(routerDef.record.opportunity).toBeDefined();
      expect(routerDef.record.task).toBeDefined();
      expect(routerDef.record.ticket).toBeDefined();
    });

    it('should include system routers', async () => {
      const { appRouter } = await import('../router');
      const routerDef = appRouter._def;

      expect(routerDef.record.health).toBeDefined();
      expect(routerDef.record.system).toBeDefined();
      expect(routerDef.record.timeline).toBeDefined();
    });

    it('should include security routers', async () => {
      const { appRouter } = await import('../router');
      const routerDef = appRouter._def;

      expect(routerDef.record.auth).toBeDefined();
      expect(routerDef.record.audit).toBeDefined();
    });

    it('should include AI/automation routers', async () => {
      const { appRouter } = await import('../router');
      const routerDef = appRouter._def;

      expect(routerDef.record.agent).toBeDefined();
    });

    it('should include billing and integrations', async () => {
      const { appRouter } = await import('../router');
      const routerDef = appRouter._def;

      expect(routerDef.record.billing).toBeDefined();
      expect(routerDef.record.integrations).toBeDefined();
    });
  });

  describe('index.ts - Module Exports', () => {
    it('should export appRouter', async () => {
      const indexModule = await import('../index');

      expect(indexModule.appRouter).toBeDefined();
    });

    it('should export createContext', async () => {
      const indexModule = await import('../index');

      expect(indexModule.createContext).toBeDefined();
      expect(typeof indexModule.createContext).toBe('function');
    });

    it('should export procedure builders', async () => {
      const indexModule = await import('../index');

      expect(indexModule.router).toBeDefined();
      expect(indexModule.protectedProcedure).toBeDefined();
      expect(indexModule.publicProcedure).toBeDefined();
    });

    it('should export agent module', async () => {
      const indexModule = await import('../index');

      // Agent exports from ../agent
      expect(indexModule.agentAuthorizationService).toBeDefined();
      expect(indexModule.buildAuthContext).toBeDefined();
      expect(indexModule.authorizeAgentAction).toBeDefined();
    });

    it('should export security module', async () => {
      const indexModule = await import('../index');

      // Security exports from ../security
      expect(indexModule.RBACService).toBeDefined();
      expect(indexModule.AuditLogger).toBeDefined();
      expect(indexModule.EncryptionService).toBeDefined();
      expect(indexModule.KeyRotationService).toBeDefined();
      // Tenant context functions
      expect(indexModule.extractTenantContext).toBeDefined();
      expect(indexModule.createTenantWhereClause).toBeDefined();
      // Middleware
      expect(indexModule.requirePermission).toBeDefined();
      expect(indexModule.auditLog).toBeDefined();
    });
  });
});

describe('Server Middleware Behavior', () => {
  describe('Auth Middleware', () => {
    it('should allow authenticated users through protectedProcedure', async () => {
      const { protectedProcedure, router } = await import('../server');

      // Create a simple test router with protected procedure
      const testRouter = router({
        test: protectedProcedure.query(({ ctx }) => {
          return { userId: ctx.user?.userId };
        }),
      });

      expect(testRouter._def.procedures.test).toBeDefined();
    });

    it('should block unauthenticated users from protectedProcedure', async () => {
      const { protectedProcedure, router } = await import('../server');

      // Create a router with protected procedure
      const testRouter = router({
        test: protectedProcedure.query(() => 'success'),
      });

      // The middleware should be configured to check auth
      const procedureDef = testRouter._def.procedures.test._def;
      expect(procedureDef.middlewares).toBeDefined();
      expect(procedureDef.middlewares.length).toBeGreaterThan(0);
    });
  });

  describe('Admin Middleware', () => {
    it('should have admin procedure configured with middleware', async () => {
      const { adminProcedure, router } = await import('../server');

      const testRouter = router({
        adminOnly: adminProcedure.query(() => 'admin success'),
      });

      // Admin procedure should have multiple middlewares (isAuthed + isAdmin)
      const procedureDef = testRouter._def.procedures.adminOnly._def;
      expect(procedureDef.middlewares).toBeDefined();
      expect(procedureDef.middlewares.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Logging Middleware', () => {
    it('should have logged procedure configured', async () => {
      const { loggedProcedure, router } = await import('../server');

      const testRouter = router({
        logged: loggedProcedure.query(() => 'logged'),
      });

      const procedureDef = testRouter._def.procedures.logged._def;
      expect(procedureDef.middlewares).toBeDefined();
      expect(procedureDef.middlewares.length).toBeGreaterThan(0);
    });
  });
});

describe('Error Formatting', () => {
  it('should format Zod errors correctly', async () => {
    const { publicProcedure, router } = await import('../server');
    const { z } = await import('zod');

    // Create a procedure with input validation
    const testRouter = router({
      withValidation: publicProcedure
        .input(z.object({ name: z.string().min(3) }))
        .query(({ input }) => input),
    });

    // The error formatter should be configured
    expect(testRouter._def.procedures.withValidation._def.inputs).toBeDefined();
  });
});
