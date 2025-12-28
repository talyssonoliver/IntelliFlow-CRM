/**
 * Security Middleware
 *
 * tRPC middleware for RBAC/ABAC permission checks and audit logging.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 *
 * Features:
 * - Permission checking middleware
 * - Automatic audit logging for all actions
 * - Request context capture
 * - Role-based procedure builders
 *
 * Usage:
 * ```typescript
 * // In a router
 * export const leadRouter = createTRPCRouter({
 *   create: protectedProcedure
 *     .use(requirePermission('lead:write'))
 *     .use(auditLog({ action: 'CREATE', resourceType: 'lead' }))
 *     .input(createLeadSchema)
 *     .mutation(async ({ ctx, input }) => { ... }),
 * });
 * ```
 */

import { TRPCError } from '@trpc/server';
import { Context } from '../context';
import { AuditLogger, getAuditLogger } from './audit-logger';
import { RBACService, getRBACService, Permissions } from './rbac';
import { AuditAction, ResourceType, RoleName, PermissionAction, DataClassification } from './types';

/**
 * Middleware options type
 */
interface MiddlewareOpts<TContext> {
  ctx: TContext;
  input?: unknown;
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  next: (opts?: { ctx: unknown }) => Promise<unknown>;
}

/**
 * Extended context with security services
 */
export interface SecurityContext extends Context {
  auditLogger: AuditLogger;
  rbac: RBACService;
  requestContext: {
    requestId: string;
    traceId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Create security context middleware
 *
 * Adds audit logger and RBAC service to the context.
 * This should be the first middleware in the chain.
 */
export function createSecurityContextMiddleware() {
  return async ({ ctx, next }: MiddlewareOpts<Context>) => {
    const requestId = generateRequestId();

    // Extract request context from headers
    const ipAddress = extractIpAddress(ctx.req);
    const userAgent = extractUserAgent(ctx.req);

    const securityCtx: SecurityContext = {
      ...ctx,
      auditLogger: getAuditLogger(ctx.prisma),
      rbac: getRBACService(ctx.prisma),
      requestContext: {
        requestId,
        ipAddress,
        userAgent,
      },
    };

    return next({ ctx: securityCtx });
  };
}

/**
 * Permission check options
 */
interface PermissionCheckOptions {
  /** Permission to check (e.g., 'lead:write') */
  permission: string;
  /** Optional: Resource ID getter from input */
  getResourceId?: (input: unknown) => string | undefined;
  /** Optional: Resource owner ID getter */
  getOwnerId?: (ctx: Context, input: unknown) => Promise<string | undefined>;
  /** Log permission denied events */
  logDenied?: boolean;
}

/**
 * Create permission check middleware
 *
 * @param options - Permission check options
 */
export function requirePermission(options: PermissionCheckOptions | string) {
  const opts: PermissionCheckOptions =
    typeof options === 'string' ? { permission: options } : options;

  return async ({ ctx, input, next }: MiddlewareOpts<SecurityContext>) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const [resourceType, action] = opts.permission.split(':') as [ResourceType, PermissionAction];
    const userRole = ctx.user.role as RoleName;

    // Get resource owner ID if needed
    let ownerId: string | undefined;
    if (opts.getOwnerId) {
      ownerId = await opts.getOwnerId(ctx, input);
    }

    // Check permission
    const result = await ctx.rbac.can({
      userId: ctx.user.userId,
      userRole,
      resourceType,
      action,
      resourceId: opts.getResourceId?.(input),
      resourceOwnerId: ownerId,
    });

    if (!result.granted) {
      // Log permission denied
      if (opts.logDenied !== false) {
        await ctx.auditLogger.logPermissionDenied(
          resourceType,
          opts.getResourceId?.(input) ?? 'unknown',
          opts.permission,
          {
            actorId: ctx.user.userId,
            actorEmail: ctx.user.email,
            actorRole: ctx.user.role,
            reason: result.reason,
            ipAddress: ctx.requestContext.ipAddress,
            userAgent: ctx.requestContext.userAgent,
          }
        );
      }

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: result.reason || `Permission denied: ${opts.permission}`,
      });
    }

    return next();
  };
}

/**
 * Audit log options
 */
interface AuditLogOptions {
  /** Action type */
  action: AuditAction;
  /** Resource type */
  resourceType: ResourceType;
  /** Get resource ID from result */
  getResourceId?: (result: unknown, input: unknown) => string;
  /** Get resource name */
  getResourceName?: (result: unknown, input: unknown) => string;
  /** Get before state (for updates/deletes) */
  getBeforeState?: (ctx: Context, input: unknown) => Promise<Record<string, unknown> | undefined>;
  /** Data classification */
  dataClassification?: DataClassification;
  /** Skip logging condition */
  skipIf?: (ctx: Context, input: unknown) => boolean;
}

/**
 * Create audit logging middleware
 *
 * Automatically logs actions after they complete.
 */
export function auditLog(options: AuditLogOptions) {
  return async ({ ctx, input, next }: MiddlewareOpts<SecurityContext>) => {
    // Check if we should skip logging
    if (options.skipIf?.(ctx, input)) {
      return next();
    }

    // Get before state if needed (for updates/deletes)
    const beforeState = options.getBeforeState
      ? await options.getBeforeState(ctx, input)
      : undefined;

    // Execute the procedure
    let result: unknown;
    let error: Error | null = null;

    try {
      result = await next();
    } catch (err) {
      error = err as Error;
    }

    // Log the action
    try {
      const resourceId = options.getResourceId
        ? options.getResourceId(result, input)
        : ((input as { id?: string })?.id ?? 'unknown');

      await ctx.auditLogger.logAction(options.action, options.resourceType, resourceId, {
        actorId: ctx.user?.userId,
        actorEmail: ctx.user?.email,
        actorRole: ctx.user?.role,
        resourceName: options.getResourceName?.(result, input),
        beforeState,
        afterState: result as Record<string, unknown> | undefined,
        actionReason: error?.message,
        requestContext: ctx.requestContext,
        metadata: error ? { error: error.message } : undefined,
      });
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('[AUDIT] Failed to log action:', logError);
    }

    // Re-throw if there was an error
    if (error) {
      throw error;
    }

    return result;
  };
}

/**
 * Combine permission check and audit logging
 */
export function securedAction(options: {
  permission: string;
  action: AuditAction;
  resourceType: ResourceType;
  getResourceId?: (result: unknown, input: unknown) => string;
  getBeforeState?: (ctx: Context, input: unknown) => Promise<Record<string, unknown> | undefined>;
}) {
  return async ({ ctx, input, next }: MiddlewareOpts<SecurityContext>) => {
    // First check permission
    await requirePermission(options.permission)({
      ctx,
      input,
      next: async () => undefined,
      path: '',
      type: 'mutation',
    });

    // Then add audit logging
    return auditLog({
      action: options.action,
      resourceType: options.resourceType,
      getResourceId: options.getResourceId,
      getBeforeState: options.getBeforeState,
    })({ ctx, input, next, path: '', type: 'mutation' });
  };
}

/**
 * Role check middleware factories
 */
export function requireAdmin() {
  return async ({ ctx, next }: MiddlewareOpts<Context>) => {
    if (!ctx.user || ctx.user.role !== 'ADMIN') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }
    return next();
  };
}

export function requireManager() {
  return async ({ ctx, next }: MiddlewareOpts<Context>) => {
    if (!ctx.user || !['ADMIN', 'MANAGER'].includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Manager access required',
      });
    }
    return next();
  };
}

export function requireRole(minRole: RoleName) {
  return async ({ ctx, next }: MiddlewareOpts<SecurityContext>) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const rbac = getRBACService(ctx.prisma);
    const userLevel = rbac.getRoleLevel(ctx.user.role as RoleName);
    const minLevel = rbac.getRoleLevel(minRole);

    if (userLevel < minLevel) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Role ${minRole} or higher required`,
      });
    }

    return next();
  };
}

/**
 * Ownership check middleware
 *
 * Ensures user can only access their own resources (unless admin/manager)
 */
export function requireOwnership(options: {
  getOwnerId: (ctx: Context, input: unknown) => Promise<string | undefined>;
  allowRoles?: RoleName[];
}) {
  const allowedRoles = options.allowRoles ?? ['ADMIN', 'MANAGER'];

  return async ({ ctx, input, next }: MiddlewareOpts<Context>) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Skip ownership check for allowed roles
    if (allowedRoles.includes(ctx.user.role as RoleName)) {
      return next();
    }

    const ownerId = await options.getOwnerId(ctx, input);

    if (ownerId && ownerId !== ctx.user.userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You can only access your own resources',
      });
    }

    return next();
  };
}

/**
 * Helper functions
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractIpAddress(req?: Request): string | undefined {
  if (!req) return undefined;

  // Check common headers for client IP
  const headers = req.headers;
  const forwardedFor = headers.get?.('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get?.('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return undefined;
}

function extractUserAgent(req?: Request): string | undefined {
  if (!req) return undefined;
  return req.headers.get?.('user-agent') || undefined;
}

/**
 * Export permission constants for convenience
 */
export { Permissions };
