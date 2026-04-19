/**
 * RBAC Permission Helper — M5
 *
 * Provides `hasPermission(ctx, resource, action)` for fine-grained permission
 * checks against the full RBAC graph (UserRoleAssignment → RBACRole →
 * RolePermission → Permission) with a UserPermission overlay for explicit
 * per-user grants/denies.
 *
 * ## Usage pattern
 *
 * ```ts
 * import { hasPermission } from '../lib/rbac';
 *
 * // Inside a tRPC mutation/query handler:
 * if (!(await hasPermission(ctx, 'agent:tool-approval', 'approve'))) {
 *   throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permission' });
 * }
 * ```
 *
 * ## Fast path
 * Users whose `ctx.user.role === 'ADMIN'` are granted all permissions immediately
 * without touching the database — matching the existing isAdmin middleware in trpc.ts.
 *
 * ## Slow path
 * 1. Load active `UserRoleAssignment` rows for the user + tenant.
 * 2. For each role, find a matching `RolePermission → Permission` where
 *    `permission.resource = resource AND permission.action = action`.
 * 3. If any role-level grant exists (and no role-level explicit deny), the
 *    intermediate result is `true`.
 *
 * ## UserPermission overlay
 * A direct `UserPermission` row (tenant-scoped) with `granted = true` overrides
 * a missing role grant; `granted = false` overrides any role-level grant (deny wins).
 *
 * ## Cache
 * Results are cached for 60 seconds per `${userId}:${resource}:${action}` key to
 * avoid a DB hit on every call within a single request burst.
 *
 * ## Fail-closed
 * On DB errors, `hasPermission` returns `false` and emits a `console.warn`.
 * This is intentionally different from tool-enablement (which fails open) —
 * permission checks should deny by default on uncertainty.
 */

import type { Context } from '../context';

// ---------------------------------------------------------------------------
// In-memory permission cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: boolean;
  expiresAt: number;
}

/** Exported only for test cleanup — do not call directly in application code. */
export const _permissionCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 60_000; // 60 seconds

function cacheKey(userId: string, resource: string, action: string): string {
  return `${userId}:${resource}:${action}`;
}

function getCached(userId: string, resource: string, action: string): boolean | null {
  const key = cacheKey(userId, resource, action);
  const entry = _permissionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _permissionCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(userId: string, resource: string, action: string, result: boolean): void {
  // Simple size cap — evict oldest entry when at 5 000 to keep memory bounded
  if (_permissionCache.size >= 5_000) {
    const firstKey = _permissionCache.keys().next().value;
    if (firstKey !== undefined) _permissionCache.delete(firstKey);
  }
  _permissionCache.set(cacheKey(userId, resource, action), {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the authenticated user has permission to perform `action` on
 * `resource`.
 *
 * @param ctx   - tRPC context (requires `ctx.user` and `ctx.prisma`)
 * @param resource - Resource identifier, e.g. `'agent:tool-approval'` or `'ai:output-review'`
 * @param action   - Action identifier, e.g. `'approve'`, `'read'`, `'write'`
 * @returns `true` if the user is permitted; `false` otherwise (including on DB error)
 */
export async function hasPermission(
  ctx: Pick<Context, 'user' | 'prisma'>,
  resource: string,
  action: string
): Promise<boolean> {
  const user = ctx.user;

  // Guard: unauthenticated callers are never permitted
  if (!user) return false;

  // Step 1 — Fast path: ADMIN role short-circuits all checks
  if (user.role === 'ADMIN') return true;

  const userId = user.userId;
  const tenantId = user.tenantId;

  // Step 2 — Cache hit
  const cached = getCached(userId, resource, action);
  if (cached !== null) return cached;

  try {
    // Step 3 — UserPermission overlay (explicit per-user grant/deny)
    //           Checked first so a deny overlay wins even if a role grants it.
    const userPermissionOverride = await (ctx.prisma as any).userPermission.findFirst({
      where: {
        userId,
        tenantId,
        permission: { resource, action },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { granted: true },
    });

    if (userPermissionOverride !== null) {
      // Explicit per-user decision — deny or grant
      const result = userPermissionOverride.granted as boolean;
      setCache(userId, resource, action, result);
      return result;
    }

    // Step 4 — Role-level check via UserRoleAssignment → RolePermission → Permission
    const activeAssignments = await (ctx.prisma as any).userRoleAssignment.findMany({
      where: {
        userId,
        tenantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        role: {
          select: {
            permissions: {
              where: {
                permission: { resource, action },
              },
              select: { granted: true },
            },
          },
        },
      },
    });

    // Evaluate: any explicit deny at role level wins; otherwise any grant wins
    let anyGrant = false;
    let anyDeny = false;

    for (const assignment of activeAssignments) {
      for (const rp of (assignment.role as any).permissions) {
        if (rp.granted) {
          anyGrant = true;
        } else {
          anyDeny = true;
        }
      }
    }

    // Deny-wins: explicit role-level deny overrides grants
    const result = anyGrant && !anyDeny;
    setCache(userId, resource, action, result);
    return result;
  } catch (err) {
    // Fail-closed: DB errors → deny
    console.warn('[rbac] hasPermission DB error — denying by default', {
      userId,
      resource,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
