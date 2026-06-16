/**
 * Tests for apps/api/src/lib/rbac.ts
 *
 * Covers:
 * - Fast path: ADMIN role short-circuits DB
 * - Slow path: role → permission graph (grant / deny)
 * - UserPermission overlay (explicit grant / explicit deny)
 * - Cache hit (DB not called on second invocation within TTL)
 * - Fail-closed: DB error → false
 * - Unauthenticated caller → false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasPermission, _permissionCache } from '../rbac';
import type { Context } from '../../context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides?: {
  role?: string;
  userId?: string;
  tenantId?: string;
  prismaOverride?: Partial<Record<string, unknown>>;
}): Pick<Context, 'user' | 'prisma'> {
  const userPermissionFindFirst = vi.fn();
  const userRoleAssignmentFindMany = vi.fn();

  const prisma = {
    userPermission: { findFirst: userPermissionFindFirst },
    userRoleAssignment: { findMany: userRoleAssignmentFindMany },
    ...(overrides?.prismaOverride ?? {}),
  };

  return {
    user: {
      userId: overrides?.userId ?? 'user-1',
      email: 'test@example.com',
      role: overrides?.role ?? 'SALES_REP',
      tenantId: overrides?.tenantId ?? 'tenant-1',
      emailVerified: true,
    },
    prisma: prisma as any,
  };
}

function getPrismaFns(ctx: Pick<Context, 'user' | 'prisma'>) {
  const p = ctx.prisma as any;
  return {
    userPermissionFindFirst: p.userPermission.findFirst as ReturnType<typeof vi.fn>,
    userRoleAssignmentFindMany: p.userRoleAssignment.findMany as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Wipe the permission cache between tests so results don't bleed across
  _permissionCache.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hasPermission', () => {
  // ─────────────────────────────────────────────
  // Unauthenticated
  // ─────────────────────────────────────────────
  it('returns false for unauthenticated caller (no user)', async () => {
    const ctx: Pick<Context, 'user' | 'prisma'> = {
      user: null,
      prisma: {} as any,
    };
    expect(await hasPermission(ctx, 'agent:tool-approval', 'approve')).toBe(false);
  });

  // ─────────────────────────────────────────────
  // Fast path — ADMIN
  // ─────────────────────────────────────────────
  it('returns true immediately for ADMIN role without hitting DB', async () => {
    const ctx = makeCtx({ role: 'ADMIN' });
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    const result = await hasPermission(ctx, 'agent:tool-approval', 'approve');

    expect(result).toBe(true);
    expect(userPermissionFindFirst).not.toHaveBeenCalled();
    expect(userRoleAssignmentFindMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────
  // UserPermission overlay — explicit grant
  // ─────────────────────────────────────────────
  it('returns true when UserPermission overlay grants permission', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    userPermissionFindFirst.mockResolvedValueOnce({ granted: true });

    const result = await hasPermission(ctx, 'ai:output-review', 'approve');

    expect(result).toBe(true);
    // Role graph should NOT be consulted — overlay short-circuits it
    expect(userRoleAssignmentFindMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────
  // UserPermission overlay — explicit deny
  // ─────────────────────────────────────────────
  it('returns false when UserPermission overlay explicitly denies permission', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    userPermissionFindFirst.mockResolvedValueOnce({ granted: false });

    const result = await hasPermission(ctx, 'agent:tool-approval', 'approve');

    expect(result).toBe(false);
    expect(userRoleAssignmentFindMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────
  // Slow path — role graph grant
  // ─────────────────────────────────────────────
  it('returns true when role graph contains a matching grant', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    // No user-level override
    userPermissionFindFirst.mockResolvedValueOnce(null);

    // One active role with a matching grant
    userRoleAssignmentFindMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [{ granted: true }],
        },
      },
    ]);

    const result = await hasPermission(ctx, 'agent:tool-approval', 'approve');
    expect(result).toBe(true);
  });

  // ─────────────────────────────────────────────
  // Slow path — role graph deny wins over grant
  // ─────────────────────────────────────────────
  it('returns false when role graph contains both a grant and a deny (deny-wins)', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    userPermissionFindFirst.mockResolvedValueOnce(null);

    // Two roles: one grants, one denies → deny wins
    userRoleAssignmentFindMany.mockResolvedValueOnce([
      { role: { permissions: [{ granted: true }] } },
      { role: { permissions: [{ granted: false }] } },
    ]);

    const result = await hasPermission(ctx, 'agent:tool-approval', 'approve');
    expect(result).toBe(false);
  });

  // ─────────────────────────────────────────────
  // Slow path — no matching permission
  // ─────────────────────────────────────────────
  it('returns false when no role has the required permission', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    userPermissionFindFirst.mockResolvedValueOnce(null);
    // Empty permissions list for all roles
    userRoleAssignmentFindMany.mockResolvedValueOnce([{ role: { permissions: [] } }]);

    const result = await hasPermission(ctx, 'agent:tool-approval', 'approve');
    expect(result).toBe(false);
  });

  // ─────────────────────────────────────────────
  // Cache hit — DB not queried on second call
  // ─────────────────────────────────────────────
  it('returns cached result on second call without hitting DB again', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    userPermissionFindFirst.mockResolvedValue(null);
    userRoleAssignmentFindMany.mockResolvedValue([{ role: { permissions: [{ granted: true }] } }]);

    // First call — populates cache
    const first = await hasPermission(ctx, 'agent:tool-approval', 'approve');
    expect(first).toBe(true);

    // Second call — should hit cache
    const second = await hasPermission(ctx, 'agent:tool-approval', 'approve');
    expect(second).toBe(true);

    // DB should only have been called once
    expect(userPermissionFindFirst).toHaveBeenCalledTimes(1);
    expect(userRoleAssignmentFindMany).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────
  // Fail-closed — DB error → false
  // ─────────────────────────────────────────────
  it('returns false and logs a warning when the DB throws', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst } = getPrismaFns(ctx);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    userPermissionFindFirst.mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await hasPermission(ctx, 'agent:tool-approval', 'approve');

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[rbac]'),
      expect.objectContaining({ error: 'DB connection lost' })
    );

    warnSpy.mockRestore();
  });

  // ─────────────────────────────────────────────
  // Cache is keyed per user+resource+action
  // ─────────────────────────────────────────────
  it('uses separate cache entries for different resources', async () => {
    const ctx = makeCtx();
    const { userPermissionFindFirst, userRoleAssignmentFindMany } = getPrismaFns(ctx);

    // First resource: no permission
    userPermissionFindFirst.mockResolvedValueOnce(null);
    userRoleAssignmentFindMany.mockResolvedValueOnce([{ role: { permissions: [] } }]);

    // Second resource: has permission
    userPermissionFindFirst.mockResolvedValueOnce(null);
    userRoleAssignmentFindMany.mockResolvedValueOnce([
      { role: { permissions: [{ granted: true }] } },
    ]);

    const r1 = await hasPermission(ctx, 'resource:one', 'read');
    const r2 = await hasPermission(ctx, 'resource:two', 'read');

    expect(r1).toBe(false);
    expect(r2).toBe(true);
  });
});
