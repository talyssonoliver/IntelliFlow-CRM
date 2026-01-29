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
import { PrismaClient } from '@prisma/client';
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
 * for RLS policy evaluation before each query.
 */
export function createTenantScopedPrisma(
  prisma: PrismaClient,
  tenantContext: TenantContext
): PrismaClient {
  // Set RLS context before query execution
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          // Set JWT claims for RLS evaluation
          const claims = JSON.stringify({
            sub: tenantContext.userId,
            role: tenantContext.role,
            tenant_id: tenantContext.tenantId,
            organization_id: tenantContext.organizationId,
          });

          // Set session variable (used by RLS policies)
          await prisma.$executeRawUnsafe(
            `SET request.jwt.claims = '${claims.replace(/'/g, "''")}'`
          );

          // Execute the actual query
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

  return async ({ ctx, next }: { ctx: Context; next: (opts?: { ctx: unknown }) => Promise<unknown> }) => {
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

    // Extract tenant context
    const tenant = extractTenantContext(ctx.user);

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
 * Automatically adds ownerId filter for non-admin users.
 */
export function createTenantWhereClause<T extends Record<string, unknown>>(
  tenant: TenantContext,
  additionalWhere?: T
): T & { ownerId?: string | { in: string[] } } {
  const base = additionalWhere || ({} as T);

  // Admin can access all
  if (tenant.role === 'ADMIN') {
    return base as T & { ownerId?: string | { in: string[] } };
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
 * Get team member IDs for a manager
 *
 * Current implementation: managers can access all non-admin users
 * Future: implement proper team hierarchy
 */
export async function getTeamMemberIds(
  prisma: PrismaClient,
  managerId: string
): Promise<string[]> {
  // Check if user is a manager
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
    select: { role: true },
  });

  if (!manager || !['MANAGER', 'ADMIN'].includes(manager.role)) {
    return [];
  }

  // Get all team members (currently all non-admin users)
  const teamMembers = await prisma.user.findMany({
    where: {
      role: { in: ['USER', 'SALES_REP'] },
    },
    select: { id: true },
  });

  return teamMembers.map((m) => m.id);
}

/**
 * Enrich tenant context with team member IDs
 */
export async function enrichTenantContext(
  prisma: PrismaClient,
  tenant: TenantContext
): Promise<TenantContext> {
  if (['MANAGER', 'ADMIN'].includes(tenant.role)) {
    const teamMemberIds = await getTeamMemberIds(prisma, tenant.userId);
    return {
      ...tenant,
      teamMemberIds,
    };
  }
  return tenant;
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
