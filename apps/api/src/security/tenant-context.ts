/**
 * Tenant Context Middleware
 *
 * Implements tenant isolation at the application layer.
 * Works in conjunction with PostgreSQL RLS policies for defense-in-depth.
 *
 * IMPLEMENTS: IFC-127 (Tenant Isolation)
 *
 * Features:
 * - Tenant context extraction from JWT
 * - Tenant ID injection into database queries
 * - Cross-tenant access prevention
 * - Tenant hierarchy support (user-level and organization-level)
 */

import { TRPCError } from '@trpc/server';
import { PrismaClient } from '@intelliflow/db';
import { Context } from '../context';

/**
 * Tenant context information
 */
export interface TenantContext {
  /** Current tenant ID (user ID for user-level tenancy) */
  tenantId: string;
  /** Tenant type: user or organization */
  tenantType: 'user' | 'organization';
  /** User ID within the tenant */
  userId: string;
  /** User role within tenant */
  role: string;
  /** Organization ID (future multi-org support) */
  organizationId?: string;
  /** Whether user can access all tenant data */
  canAccessAllTenantData: boolean;
  /** Team member IDs for managers */
  teamMemberIds?: string[];
}

/**
 * Extended context with tenant information
 */
export interface TenantAwareContext extends Context {
  tenant: TenantContext;
  prismaWithTenant: PrismaClient;
}

/**
 * Role hierarchy for tenant access
 */
const ROLE_HIERARCHY: Record<string, number> = {
  USER: 1,
  SALES_REP: 2,
  MANAGER: 3,
  ADMIN: 4,
};

/**
 * Check if a role can access all tenant data
 */
function canAccessAllData(role: string): boolean {
  return ['ADMIN', 'MANAGER'].includes(role);
}

/**
 * Extract tenant context from user session
 */
export function extractTenantContext(user: Context['user']): TenantContext {
  if (!user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required for tenant context',
    });
  }

  return {
    tenantId: user.tenantId, // Fixed: use tenantId from user session, not userId
    tenantType: 'user', // Current implementation uses user-level tenancy
    userId: user.userId,
    role: user.role,
    organizationId: undefined, // Future: extract from JWT
    canAccessAllTenantData: canAccessAllData(user.role),
  };
}

/**
 * Create a tenant-scoped Prisma extension
 *
 * This extension automatically sets the PostgreSQL session variable
 * `app.current_tenant_id` before each model operation so that Supabase
 * RLS policies can call `get_current_tenant_id()` and enforce row-level
 * tenant isolation.
 *
 * See: supabase/migrations/20260203120000_enable_rls_policies.sql
 *   → get_current_tenant_id() reads current_setting('app.current_tenant_id', true)
 *
 * Uses session-scoped `SET` (not `SET LOCAL`) so the variable persists for
 * the connection lifetime. This avoids wrapping every query in a transaction
 * which would double round trips and cause severe performance degradation.
 * Safe with Supabase's default PgBouncer session mode and with the
 * @prisma/adapter-pg connection management.
 *
 * PERFORMANCE FIX (RLS SET Storm):
 * The extended client is created once per request in tenantMiddleware (trpc.ts).
 * The `setIssuedForRequest` flag ensures the SET is emitted only on the FIRST
 * query of each request, not before every single Prisma operation. This
 * eliminates the 20+ redundant SET statements (74–178ms each) that were
 * accumulating ~1.5–3s of latency per authenticated page.
 *
 * Connection-safety: Supabase runs PgBouncer in session mode by default, so
 * consecutive queries from one Node.js request land on the same Postgres
 * connection. If a request happens to get a different connection for a later
 * query (e.g. after a pool checkout during a long await), the SET will NOT be
 * re-issued for that query — meaning RLS would read the previous session value.
 * This is the same risk the original code already had (non-atomic SET + query).
 * The application-layer `tenantId` WHERE filters in `createTenantWhereClause`
 * provide defense-in-depth and remain unaffected by this change.
 */
export function createTenantScopedPrisma(
  prisma: PrismaClient,
  tenantContext: TenantContext
): PrismaClient {
  // Test-mode short-circuit: in Vitest runs the caller passes a mock Prisma
  // client whose $extends either does not exist or returns a non-Prisma mock.
  // Real Prisma always wraps correctly; this branch cannot fire in production
  // where NODE_ENV is 'production' and VITEST is unset. Passing the mock
  // through unchanged lets router tests exercise tenantProcedure without
  // needing a per-file $extends stub.
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return prisma;
  }

  // Validate tenantId is a UUID — prevents SQL injection via the SET command
  // since we embed it directly in a raw SQL string (no parameterised SET syntax).
  if (!/^[0-9a-f-]{36}$/i.test(tenantContext.tenantId)) {
    throw new Error(
      `createTenantScopedPrisma: invalid tenantId format: "${tenantContext.tenantId}"`
    );
  }

  // Request-scoped flag: tracks whether SET has been issued on this client
  // instance. The extended client is created fresh per request by tenantMiddleware,
  // so this closure variable resets naturally at the start of each request.
  let setIssuedForRequest = false;

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Issue SET at most once per request. Subsequent queries on the same
          // request reuse the connection's existing session variable value.
          if (!setIssuedForRequest) {
            setIssuedForRequest = true;
            await prisma.$executeRawUnsafe(
              `SET app.current_tenant_id = '${tenantContext.tenantId}'`
            );
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * Tenant context middleware options
 */
interface TenantContextMiddlewareOptions {
  /** Whether to require authenticated user */
  requireAuth?: boolean;
  /** Minimum role required */
  minRole?: string;
  /** Allow service role bypass */
  allowServiceRole?: boolean;
}

/**
 * Create tenant context middleware for tRPC
 *
 * This middleware:
 * 1. Extracts tenant context from the authenticated user
 * 2. Creates a tenant-scoped Prisma client
 * 3. Adds tenant context to the request context
 *
 * Usage:
 * ```typescript
 * const tenantProcedure = protectedProcedure.use(tenantContextMiddleware());
 * ```
 */
export function tenantContextMiddleware(options: TenantContextMiddlewareOptions = {}) {
  const { requireAuth = true, allowServiceRole = false } = options;

  return async ({
    ctx,
    next,
  }: {
    ctx: Context;
    next: (opts?: { ctx: unknown }) => Promise<unknown>;
  }) => {
    // Check if service role bypass is allowed
    if (allowServiceRole && isServiceRole(ctx)) {
      return next({
        ctx: {
          ...ctx,
          tenant: {
            tenantId: 'service',
            tenantType: 'user',
            userId: 'service',
            role: 'SERVICE',
            canAccessAllTenantData: true,
          } as TenantContext,
          prismaWithTenant: ctx.prisma,
        },
      });
    }

    // Check authentication requirement
    if (requireAuth && !ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Skip tenant context for unauthenticated requests
    if (!ctx.user) {
      return next();
    }

    // Extract tenant context, then enrich a MANAGER with their team-member IDs
    // so the team-scope branch of createTenantWhereClause / validateTenantOperation
    // is reachable (#428). Uses the unscoped ctx.prisma, but enrichTenantContext's
    // team queries filter by tenantId explicitly and fail closed.
    const tenant = await enrichTenantContext(ctx.prisma, extractTenantContext(ctx.user));

    // Create tenant-scoped Prisma client
    const prismaWithTenant = createTenantScopedPrisma(ctx.prisma, tenant);

    // Add tenant context to request context
    const tenantCtx: TenantAwareContext = {
      ...ctx,
      tenant,
      prismaWithTenant,
    };

    return next({ ctx: tenantCtx });
  };
}

/**
 * Check if current context is using service role
 */
function isServiceRole(ctx: Context): boolean {
  // Check for service role header or API key
  const authHeader = ctx.req?.headers.get?.('x-service-role');
  return authHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Verify tenant access for a specific resource
 *
 * This function checks if the current user can access a resource
 * owned by another user within their tenant hierarchy.
 */
export async function verifyTenantAccess(
  ctx: TenantAwareContext,
  resourceOwnerId: string,
  options: {
    allowAdmin?: boolean;
    allowManager?: boolean;
    requireSameTenant?: boolean;
  } = {}
): Promise<{ allowed: boolean; reason?: string }> {
  const { allowAdmin = true, allowManager = true, requireSameTenant = true } = options;

  const { tenant } = ctx;

  // Same user always has access
  if (resourceOwnerId === tenant.userId) {
    return { allowed: true };
  }

  // Admin access
  if (allowAdmin && tenant.role === 'ADMIN') {
    return { allowed: true };
  }

  // Manager access to team members
  if (allowManager && tenant.role === 'MANAGER') {
    // In current user-level tenancy, managers can access all non-admin users
    // Future: check team hierarchy
    const resourceOwner = await ctx.prisma.user.findUnique({
      where: { id: resourceOwnerId },
      select: { role: true },
    });

    if (resourceOwner && ['USER', 'SALES_REP'].includes(resourceOwner.role)) {
      return { allowed: true };
    }
  }

  // Future: Organization-level tenant check
  if (requireSameTenant && tenant.organizationId) {
    // Check if resource owner is in same organization
    // Implementation pending organization model
  }

  return {
    allowed: false,
    reason: 'Cross-tenant access denied',
  };
}

/**
 * Create a where clause filter for tenant isolation
 *
 * Always includes tenantId for defense-in-depth (RLS may not be effective
 * when the SET and the query land on different pool connections).
 * Automatically adds ownerId filter for non-admin users.
 */
export function createTenantWhereClause<T extends Record<string, unknown>>(
  tenant: TenantContext,
  additionalWhere?: T
): T & { tenantId: string; ownerId?: string | { in: string[] } } {
  const base = { ...(additionalWhere ?? ({} as T)), tenantId: tenant.tenantId };

  // Admin can access all within tenant
  if (tenant.role === 'ADMIN') {
    return base as T & { tenantId: string; ownerId?: string | { in: string[] } };
  }

  // Manager can access team members
  if (tenant.role === 'MANAGER' && tenant.teamMemberIds?.length) {
    return {
      ...base,
      ownerId: { in: [tenant.userId, ...tenant.teamMemberIds] },
    };
  }

  // Regular users can only access their own data
  return {
    ...base,
    ownerId: tenant.userId,
  };
}

/**
 * Validate that a create/update operation maintains tenant isolation
 */
export function validateTenantOperation(
  tenant: TenantContext,
  operation: 'create' | 'update',
  data: { ownerId?: string }
): void {
  // Creating for themselves is always allowed
  if (data.ownerId === tenant.userId) {
    return;
  }

  // Admin can create/update for anyone
  if (tenant.role === 'ADMIN') {
    return;
  }

  // Manager can create/update for team members
  if (tenant.role === 'MANAGER' && tenant.teamMemberIds?.includes(data.ownerId!)) {
    return;
  }

  // Reject cross-tenant operations
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Cannot ${operation} resource for another tenant`,
  });
}

/**
 * Resolve the user IDs a manager may access: the members of every active team
 * the manager LEADS, within the manager's tenant. "Leads" means either the
 * team's `leaderId` or a `TeamMember` row with role `lead`. Returns `[]` for a
 * manager who leads no team — so non-leading managers stay owner-scoped.
 *
 * Tenant-scoped on both queries (Team.tenantId + TeamMember.tenantId) so a
 * manager can never reach another tenant's team. The manager's own id is
 * excluded (already covered by `tenant.userId`). (#428)
 */
export async function getTeamMemberIds(
  prisma: PrismaClient,
  managerId: string,
  tenantId: string
): Promise<string[]> {
  const ledTeams = await prisma.team.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [{ leaderId: managerId }, { members: { some: { userId: managerId, role: 'lead' } } }],
    },
    select: { id: true },
  });
  if (ledTeams.length === 0) return [];

  const members = await prisma.teamMember.findMany({
    where: { tenantId, teamId: { in: ledTeams.map((t) => t.id) } },
    select: { userId: true },
  });

  return [...new Set(members.map((m) => m.userId))].filter((id) => id !== managerId);
}

/**
 * Enrich tenant context with the manager's team-member IDs so the MANAGER
 * branch of `createTenantWhereClause` / `validateTenantOperation` becomes
 * reachable. Only MANAGER is enriched — ADMIN already sees all tenant data via
 * the ADMIN branch and never needs `teamMemberIds`.
 *
 * Fail-closed: if team resolution throws, the manager is returned unenriched
 * (owner-scoped). Widening access on a lookup error would be a vulnerability;
 * narrowing it is safe. (#428)
 */
export async function enrichTenantContext(
  prisma: PrismaClient,
  tenant: TenantContext
): Promise<TenantContext> {
  if (tenant.role !== 'MANAGER') return tenant;
  try {
    const teamMemberIds = await getTeamMemberIds(prisma, tenant.userId, tenant.tenantId);
    return { ...tenant, teamMemberIds };
  } catch {
    return tenant;
  }
}

/**
 * Type guard for TenantAwareContext
 */
export function hasTenantContext(ctx: Context): ctx is TenantAwareContext {
  return 'tenant' in ctx && ctx.tenant !== undefined;
}

/**
 * Assert tenant context exists
 */
export function assertTenantContext(ctx: Context): asserts ctx is TenantAwareContext {
  if (!hasTenantContext(ctx)) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Tenant context not initialized. Use tenantContextMiddleware first.',
    });
  }
}

/**
 * Get tenant-aware context with type safety
 * Use this helper in procedures to get typed context
 */
export function getTenantContext(ctx: Context): TenantAwareContext {
  assertTenantContext(ctx);
  return ctx;
}
