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
import { createDistributedRateLimitMiddleware, RATE_LIMIT_TIERS } from './middleware/rate-limit';
import { createTenantScopedPrisma } from './security/tenant-context';
import { runWithLogContext } from '@intelliflow/observability';

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
// Public rate limit — anonymous PUBLIC tier (100/min per client IP). Distributed
// via Redis when a managed rediss:// URL is configured (prod); pass-through in
// dev/test so the suite is unaffected. Issue #316 (caveat 3a).
const _publicRateLimitFn = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.PUBLIC, {
  fallback: 'pass-through',
});
const publicRateLimitMiddleware = t.middleware(async (opts) => {
  return _publicRateLimitFn({ ctx: opts.ctx, next: opts.next });
});

export const publicProcedure = t.procedure.use(tracingMiddleware).use(publicRateLimitMiddleware);

/**
 * Middleware that binds correlationId / tenantId / userId into pino's
 * AsyncLocalStorage so every log line inside the resolver automatically
 * carries these fields without explicit passing.
 *
 * Applied to all authenticated procedures (protectedProcedure / tenantProcedure).
 */
const logContextMiddleware = t.middleware(({ ctx, next }) => {
  return runWithLogContext(
    {
      correlationId: (ctx as Record<string, unknown>).correlationId as string | undefined,
      tenantId: ctx.user?.tenantId,
      userId: ctx.user?.userId,
    },
    () => next()
  );
});

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
 * CSRF Protection Middleware
 *
 * Enforces that mutations (state-changing operations) must either:
 * 1. Have an Origin header that matches the server Host
 * 2. Have a custom anti-CSRF header (which forces a CORS preflight)
 */
const csrfMiddleware = t.middleware(({ ctx, type, next }) => {
  if (type === 'mutation' && ctx.req) {
    const origin = ctx.req.headers.get('origin');
    const host = ctx.req.headers.get('host') || ctx.req.headers.get('x-forwarded-host');

    // 1. Origin checking (Standard Defense)
    if (origin && host) {
      let originUrl: URL;
      try {
        originUrl = new URL(origin);
      } catch {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'CSRF violation: Malformed Origin header',
        });
      }
      if (originUrl.host !== host && !host.includes('localhost')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'CSRF violation: Origin does not match Host',
        });
      }
    }

    // 2. Custom header fallback (for non-browser clients or when Origin is stripped)
    // A cross-origin request cannot easily set custom headers without CORS preflight
    const hasCustomHeader =
      ctx.req.headers.has('x-csrf-token') || ctx.req.headers.has('authorization');
    if (!origin && !hasCustomHeader) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'CSRF violation: Missing Origin or custom anti-CSRF headers',
      });
    }
  }

  return next();
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
// Rate limit middleware for authenticated endpoints (AUTHENTICATED tier,
// 1000 req/min per user) — distributed via Redis in prod, in-memory fallback.
const _rateLimitFn = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTHENTICATED, {
  fallback: 'in-memory',
});
const rateLimitMiddleware = t.middleware(async (opts) => {
  return _rateLimitFn({ ctx: opts.ctx, next: opts.next });
});

export const protectedProcedure = t.procedure
  .use(csrfMiddleware)
  .use(isAuthed)
  .use(logContextMiddleware)
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
      user: ctx.user, // Re-assert non-null type after guard
      tenant,
      prismaWithTenant: createTenantScopedPrisma(ctx.prisma, tenant),
    },
  });
});

export const tenantProcedure = protectedProcedure.use(tenantMiddleware);

// ============================================
// Email-Verification Guard (incident 2026-06-16 onboarding redesign)
// ============================================

/**
 * Assert that the authenticated user has a verified email address.
 *
 * Policy: login is NEVER blocked by email verification status.
 * However, specific SENSITIVE actions (outbound email, billing mutations,
 * team invitations) are gated until the user verifies.
 *
 * This function is exported for inline use inside procedure handlers that
 * cannot use verifiedProcedure (e.g. because they are already on tenantProcedure
 * and only some branches need the gate).
 *
 * Throws FORBIDDEN (not UNAUTHORIZED) because the user IS authenticated —
 * they simply lack a verified email.
 *
 * FAIL-CLOSED: any falsy emailVerified value (false, undefined, null) is
 * treated as unverified. Only an explicit `true` passes.
 */
export function assertEmailVerified(ctx: { user?: { emailVerified?: boolean } | null }): void {
  if (ctx.user?.emailVerified !== true) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Please verify your email to continue.',
    });
  }
}

/**
 * Middleware that enforces email verification for sensitive mutations.
 * Applied on top of protectedProcedure (auth is already guaranteed).
 */
const isEmailVerified = t.middleware(({ ctx, next }) => {
  assertEmailVerified(ctx);
  return next();
});

/**
 * Verified procedure — requires authentication AND a verified email.
 *
 * Use this for sensitive mutations that must not be accessible to
 * unverified accounts (outbound email, billing, teammate invitations).
 *
 * Chain: csrfMiddleware → isAuthed → logContext → tracing → rateLimit → isEmailVerified
 *
 * @example
 * verifiedProcedure
 *   .input(sendEmailSchema)
 *   .mutation(({ ctx, input }) => { ... })
 */
export const verifiedProcedure = protectedProcedure.use(isEmailVerified);

/**
 * Verified tenant procedure — tenant isolation + verified email.
 *
 * Use this for sensitive tenant-scoped mutations that additionally require
 * an email-verified account (billing mutations, sending receipts, etc.).
 */
export const verifiedTenantProcedure = tenantProcedure.use(isEmailVerified);

/**
 * Admin-gated tenant procedure — authenticated + admin role + tenant isolation.
 *
 * Required for mutations that change tenant-wide configuration (e.g. registering
 * custom workflow node types, custom action handlers, RBAC policies).
 *
 * Chain order matters: isAuthed → isAdmin → tenantMiddleware so the admin check
 * runs BEFORE we spin up the tenant-scoped Prisma client.
 */
export const adminTenantProcedure = t.procedure
  .use(isAuthed)
  .use(isAdmin)
  .use(tenantMiddleware)
  .use(tracingMiddleware);

/**
 * Auth procedure - applies strict rate limiting for auth endpoints (5 req/min)
 *
 * Use this for all unauthenticated auth endpoints to prevent brute-force attacks:
 * - login / signup
 * - forgotPassword / resetPassword
 *
 * Applies the AUTH tier: 5 requests per minute per IP/user key.
 *
 * @example
 * authProcedure
 *   .input(loginSchema)
 *   .mutation(({ input }) => { ... })
 */
const _authRateLimitFn = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH, {
  fallback: 'in-memory',
});
const authRateLimitMiddleware = t.middleware(async (opts) => {
  return _authRateLimitFn({ ctx: opts.ctx, next: opts.next });
});

export const authProcedure = t.procedure.use(tracingMiddleware).use(authRateLimitMiddleware);

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
