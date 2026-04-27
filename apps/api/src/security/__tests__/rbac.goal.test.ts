/**
 * RBAC tests for IFC-211 — Goal Settings RBAC
 *
 * Verifies:
 *   - DEFAULT_PERMISSIONS.goal entries per role
 *   - Permissions.GOAL_* constants
 *   - RBACService.isUserOnManagerTeam helper (6 cases incl. cross-tenant + P2021)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RBACService, resetRBACService, Permissions } from '../rbac';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const MANAGER_ID = 'manager-1';
const TARGET_ID = 'target-1';

// Build a Prisma-shaped mock just deep enough for isUserOnManagerTeam
function makePrismaWithTeamFindFirst(impl: (args: any) => any) {
  return {
    team: {
      findFirst: vi.fn().mockImplementation(impl),
    },
  } as any;
}

describe('IFC-211 RBAC — DEFAULT_PERMISSIONS.goal matrix', () => {
  beforeEach(() => {
    resetRBACService();
  });

  it('ADMIN holds full goal action set (read+write+delete+export+manage+admin)', async () => {
    const rbac = new RBACService({} as any);
    expect(await rbac.canRead('u', 'ADMIN', 'goal')).toBe(true);
    expect(await rbac.canWrite('u', 'ADMIN', 'goal')).toBe(true);
    expect(await rbac.canDelete('u', 'ADMIN', 'goal')).toBe(true);
    expect(await rbac.canManage('u', 'ADMIN', 'goal')).toBe(true);
    expect(await rbac.canExport('u', 'ADMIN', 'goal')).toBe(true);
    expect((await rbac.can({ userId: 'u', userRole: 'ADMIN', resourceType: 'goal', action: 'admin' })).granted).toBe(true);
  });

  it('MANAGER holds read+write+manage on goal', async () => {
    const rbac = new RBACService({} as any);
    expect(await rbac.canRead('m', 'MANAGER', 'goal')).toBe(true);
    expect(await rbac.canWrite('m', 'MANAGER', 'goal')).toBe(true);
    expect(await rbac.canManage('m', 'MANAGER', 'goal')).toBe(true);
    expect((await rbac.can({ userId: 'm', userRole: 'MANAGER', resourceType: 'goal', action: 'admin' })).granted).toBe(false);
  });

  it('SALES_REP holds read+write on goal (no manage)', async () => {
    const rbac = new RBACService({} as any);
    expect(await rbac.canRead('s', 'SALES_REP', 'goal')).toBe(true);
    expect(await rbac.canWrite('s', 'SALES_REP', 'goal')).toBe(true);
    expect(await rbac.canManage('s', 'SALES_REP', 'goal')).toBe(false);
  });

  it('USER holds read+write on goal (no manage)', async () => {
    const rbac = new RBACService({} as any);
    expect(await rbac.canRead('u', 'USER', 'goal')).toBe(true);
    expect(await rbac.canWrite('u', 'USER', 'goal')).toBe(true);
    expect(await rbac.canManage('u', 'USER', 'goal')).toBe(false);
  });

  it('VIEWER holds read on goal (no write/manage)', async () => {
    const rbac = new RBACService({} as any);
    expect(await rbac.canRead('v', 'VIEWER', 'goal')).toBe(true);
    expect(await rbac.canWrite('v', 'VIEWER', 'goal')).toBe(false);
    expect(await rbac.canManage('v', 'VIEWER', 'goal')).toBe(false);
  });
});

describe('IFC-211 RBAC — Permissions.GOAL_* constants', () => {
  it('Permissions.GOAL_READ === "goal:read"', () => {
    expect(Permissions.GOAL_READ).toBe('goal:read');
  });
  it('Permissions.GOAL_WRITE === "goal:write"', () => {
    expect(Permissions.GOAL_WRITE).toBe('goal:write');
  });
  it('Permissions.GOAL_MANAGE === "goal:manage"', () => {
    expect(Permissions.GOAL_MANAGE).toBe('goal:manage');
  });
});

describe('IFC-211 RBAC — RBACService.isUserOnManagerTeam', () => {
  beforeEach(() => {
    resetRBACService();
  });

  it('returns true when manager leads a team containing the target user (same tenant)', async () => {
    const prisma = makePrismaWithTeamFindFirst(async (args: any) => {
      // Sanity-check the where clause encodes both tenant filters
      expect(args.where.tenantId).toBe(TENANT_A);
      expect(args.where.leaderId).toBe(MANAGER_ID);
      expect(args.where.members.some.userId).toBe(TARGET_ID);
      expect(args.where.members.some.tenantId).toBe(TENANT_A);
      return { id: 'team-1' };
    });
    const rbac = new RBACService(prisma);
    const result = await rbac.isUserOnManagerTeam(MANAGER_ID, TARGET_ID, TENANT_A);
    expect(result).toBe(true);
    expect(prisma.team.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns false when manager leads a team but target user is not a member', async () => {
    const prisma = makePrismaWithTeamFindFirst(async () => null);
    const rbac = new RBACService(prisma);
    const result = await rbac.isUserOnManagerTeam(MANAGER_ID, TARGET_ID, TENANT_A);
    expect(result).toBe(false);
  });

  it('returns false when another user leads the team containing target', async () => {
    // Same as the deny case — findFirst with leaderId filter returns null when leader differs
    const prisma = makePrismaWithTeamFindFirst(async () => null);
    const rbac = new RBACService(prisma);
    const result = await rbac.isUserOnManagerTeam('other-manager', TARGET_ID, TENANT_A);
    expect(result).toBe(false);
  });

  it('returns false on cross-tenant lookup (team in tenant A, query with tenant B)', async () => {
    const prisma = makePrismaWithTeamFindFirst(async (args: any) => {
      // Both tenant filters in the where clause prevent cross-tenant matches
      expect(args.where.tenantId).toBe(TENANT_B);
      expect(args.where.members.some.tenantId).toBe(TENANT_B);
      return null;
    });
    const rbac = new RBACService(prisma);
    const result = await rbac.isUserOnManagerTeam(MANAGER_ID, TARGET_ID, TENANT_B);
    expect(result).toBe(false);
  });

  it('returns false on P2021 (table missing) without throwing', async () => {
    const prisma = makePrismaWithTeamFindFirst(async () => {
      const err: any = new Error('table missing');
      err.code = 'P2021';
      throw err;
    });
    const rbac = new RBACService(prisma);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const result = await rbac.isUserOnManagerTeam(MANAGER_ID, TARGET_ID, TENANT_A);
    expect(result).toBe(false);
    expect(debugSpy).toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('returns false when managerId === targetUserId (self lookup)', async () => {
    const prisma = makePrismaWithTeamFindFirst(async () => {
      throw new Error('should not be called for self lookup');
    });
    const rbac = new RBACService(prisma);
    const result = await rbac.isUserOnManagerTeam(MANAGER_ID, MANAGER_ID, TENANT_A);
    expect(result).toBe(false);
    // findFirst should not be called — early return on self
    expect(prisma.team.findFirst).not.toHaveBeenCalled();
  });
});
