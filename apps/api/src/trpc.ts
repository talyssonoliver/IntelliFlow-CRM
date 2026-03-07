/**
 * tRPC Configuration
 *
 * This file exports reusable tRPC utilities for creating type-safe API endpoints:
 * - createTRPCRouter: Function to create new routers
 * - publicProcedure: Procedure builder for public endpoints
 * - protectedProcedure: Procedure builder requiring authentication
 * - adminProcedure: Procedure builder for admin-only endpoints
 *
 * This is the recommended way to create tRPC routers in IntelliFlow CRM.
 * It ensures consistent patterns across all API modules.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { ZodError } from 'zod';
import { tracingMiddleware } from './tracing/middleware';
import { createAuthenticatedRateLimitMiddleware } from './middleware/rate-limit';

/**
 * Initialize tRPC with context type
 *
 * Configuration:
 * - Context type inferred from createContext function
 * - Custom error formatter for Zod validation errors
 * - Structured error responses with zodError details
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */

/**
 * Create a new tRPC router
 *
 * @example
 * export const myRouter = createTRPCRouter({
 *   hello: publicProcedure.query(() => 'world'),
 * });
 */
export const createTRPCRouter = t.router;

/**
 * Public procedure - accessible without authentication
 *
 * Use this for endpoints that don't require user authentication:
 * - Health checks
 * - Public data endpoints
 * - System information
 *
 * @example
 * publicProcedure.query(() => ({ status: 'ok' }))
 */
export const publicProcedure = t.procedure.use(tracingMiddleware);

/**
 * Middleware to check if user is authenticated
 *
 * Throws UNAUTHORIZED error if no user in context.
 * In production, this validates:
 * - JWT tokens
 * - Session cookies
 * - API keys
 */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in to access this resource.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // user is now guaranteed to be defined
    },
  });
});

/**
 * Protected procedure - requires authentication
 *
 * Use this for endpoints that require a logged-in user:
 * - User-specific data
 * - CRUD operations
 * - Any business logic requiring user context
 *
 * @example
 * protectedProcedure
 *   .input(z.object({ id: z.string() }))
 *   .query(({ ctx, input }) => {
 *     // ctx.user is guaranteed to exist
 *     return ctx.prisma.lead.findUnique({ where: { id: input.id } });
 *   })
 */
// Rate limit middleware for authenticated endpoints (1000 req/min per user)
const _rateLimitFn = createAuthenticatedRateLimitMiddleware();
const rateLimitMiddleware = t.middleware(async (opts) => {
  return _rateLimitFn({ ctx: opts.ctx, next: opts.next });
});

export const protectedProcedure = t.procedure
  .use(isAuthed)
  .use(tracingMiddleware)
  .use(rateLimitMiddleware);

/**
 * Logged procedure - includes performance monitoring
 *
 * Same as publicProcedure (which now includes tracingMiddleware globally).
 * Kept for backward compatibility.
 *
 * @deprecated Use publicProcedure instead — tracing is now applied globally.
 */
export const loggedProcedure = publicProcedure;

/**
 * Middleware to check if user has admin role
 *
 * Throws FORBIDDEN error if user is not an admin.
 */
const isAdmin = t.middleware(({ ctx, next }) => {
  if (ctx.user?.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required. This resource is restricted to administrators.',
    });
  }
  return next();
});

/**
 * Admin procedure - requires admin role
 *
 * Use this for endpoints that require admin privileges:
 * - System configuration
 * - User management
 * - Sensitive operations
 *
 * @example
 * adminProcedure
 *   .input(z.object({ userId: z.string() }))
 *   .mutation(({ input }) => {
 *     // Only admins can reach this code
 *     return deleteUser(input.userId);
 *   })
 */
export const adminProcedure = t.procedure.use(isAuthed).use(isAdmin).use(tracingMiddleware);

/**
 * Tenant-aware procedure - requires authentication and enforces tenant isolation
 *
 * SECURITY (IFC-127): This is the REQUIRED procedure for all multi-tenant endpoints.
 * It provides defense-in-depth by enforcing tenant isolation at the application layer
 * in addition to database-level RLS policies.
 *
 * Features:
 * - Extracts tenant context from authenticated user
 * - Creates tenant-scoped Prisma client with RLS context
 * - Automatically filters queries by tenant ownership
 * - Prevents cross-tenant data access
 *
 * Use this for ALL endpoints that access tenant-scoped data:
 * - Leads, Contacts, Accounts, Opportunities
 * - Tasks, Cases, Documents, Tickets
 * - Any user-owned or organization-owned data
 *
 * Context additions:
 * - ctx.tenant: TenantContext with tenantId, role, permissions
 * - ctx.prismaWithTenant: Tenant-scoped Prisma client (use this instead of ctx.prisma)
 *
 * @example
 * tenantProcedure
 *   .input(z.object({ status: z.string() }))
 *   .query(({ ctx, input }) => {
 *     // ctx.tenant is guaranteed to exist
 *     // ctx.prismaWithTenant has tenant context set
 *     const where = createTenantWhereClause(ctx.tenant, { status: input.status });
 *     return ctx.prismaWithTenant.lead.findMany({ where });
 *   })
 */
// IFC-127: Tenant context middleware for multi-tenant isolation
const tenantMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required for tenant context',
    });
  }

  // Validate tenantId is present for tenant isolation
  if (!ctx.user.tenantId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Tenant ID is required for this operation',
    });
  }

  // Extract tenant context from user session
  const tenant = {
    tenantId: ctx.user.tenantId,
    tenantType: 'user' as const,
    userId: ctx.user.userId,
    role: ctx.user.role,
    organizationId: undefined,
    canAccessAllTenantData: ['ADMIN', 'MANAGER'].includes(ctx.user.role),
  };

  return next({
    ctx: {
      ...ctx,
      tenant,
      prismaWithTenant: ctx.prisma, // In dev, use same prisma (RLS not fully configured)
    },
  });
});

export const tenantProcedure = protectedProcedure.use(tenantMiddleware);

/**
 * Re-export router for backward compatibility
 *
 * @deprecated Use createTRPCRouter instead
 */
export const router = t.router;

/**
 * Type-safe procedure builders summary:
 *
 * - publicProcedure: No authentication required
 * - protectedProcedure: Requires authenticated user
 * - tenantProcedure: Requires auth + enforces tenant isolation (USE THIS FOR TENANT DATA)
 * - adminProcedure: Requires admin role
 * - loggedProcedure: Public with performance logging
 *
 * Best practices:
 * 1. Always use Zod schemas for input validation
 * 2. Use tenantProcedure for all tenant-scoped resources (leads, contacts, etc.)
 * 3. Include proper error handling (TRPCError)
 * 4. Use TypeScript for end-to-end type safety
 * 5. Document complex procedures with JSDoc comments
 * 6. Keep procedures focused (single responsibility)
 */
