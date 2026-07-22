/**
 * IFC-211 — Goal RBAC unit tests
 *
 * Covers the additions made by IFC-211 (Goal Settings RBAC) to the shared
 * RBAC service:
 *   1. the `goal` resource type in the DEFAULT_PERMISSIONS matrix (per role),
 *   2. the `Permissions.GOAL_*` constants, and
 *   3. `RBACService.isUserOnManagerTeam` — the tenant-scoped team-membership
 *      helper backing `home.setTeamMemberGoal`.
 *
 * The matrix is module-private, so it is asserted through `can()` (the public
 * decision surface). `getUserPermissionOverride` reads `prisma.permission`, which
 * the deep mock resolves to `null`, so `can()` falls back to the role matrix.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';
import { RBACService, Permissions } from '../rbac';
import type { PermissionAction, RoleName } from '../types';

describe('IFC-211 goal RBAC', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let rbac: RBACService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    // No DB-level permission override → can() uses the default role matrix.
    prisma.permission.findUnique.mockResolvedValue(null as never);
    rbac = new RBACService(prisma as unknown as PrismaClient);
  });

  const granted = (role: RoleName, action: PermissionAction) =>
    rbac.can({ userId: 'actor', userRole: role, resourceType: 'goal', action });

  describe('DEFAULT_PERMISSIONS.goal matrix', () => {
    it('ADMIN has full goal permissions', async () => {
      for (const action of ['read', 'write', 'delete', 'export', 'manage', 'admin'] as const) {
        expect((await granted('ADMIN', action)).granted).toBe(true);
      }
    });

    it('MANAGER has read/write/manage on goal but not delete/admin', async () => {
      expect((await granted('MANAGER', 'read')).granted).toBe(true);
      expect((await granted('MANAGER', 'write')).granted).toBe(true);
      expect((await granted('MANAGER', 'manage')).granted).toBe(true);
      expect((await granted('MANAGER', 'delete')).granted).toBe(false);
      expect((await granted('MANAGER', 'admin')).granted).toBe(false);
    });

    it('SALES_REP has read/write on goal but not manage', async () => {
      expect((await granted('SALES_REP', 'read')).granted).toBe(true);
      expect((await granted('SALES_REP', 'write')).granted).toBe(true);
      expect((await granted('SALES_REP', 'manage')).granted).toBe(false);
    });

    it('USER has read/write on goal but not manage', async () => {
      expect((await granted('USER', 'read')).granted).toBe(true);
      expect((await granted('USER', 'write')).granted).toBe(true);
      expect((await granted('USER', 'manage')).granted).toBe(false);
    });

    it('VIEWER has read only on goal (write denied)', async () => {
      expect((await granted('VIEWER', 'read')).granted).toBe(true);
      expect((await granted('VIEWER', 'write')).granted).toBe(false);
      expect((await granted('VIEWER', 'manage')).granted).toBe(false);
    });
  });

  describe('Permissions.GOAL_* constants', () => {
    it('exposes canonical goal permission ids', () => {
      expect(Permissions.GOAL_READ).toBe('goal:read');
      expect(Permissions.GOAL_WRITE).toBe('goal:write');
      expect(Permissions.GOAL_MANAGE).toBe('goal:manage');
    });
  });

  describe('isUserOnManagerTeam', () => {
    const MANAGER = 'mgr-1';
    const TARGET = 'usr-2';
    const TENANT = 'tenant-a';

    it('returns true when the manager leads a team containing the target user', async () => {
      prisma.team.findFirst.mockResolvedValue({ id: 'team-1' } as never);
      await expect(rbac.isUserOnManagerTeam(MANAGER, TARGET, TENANT)).resolves.toBe(true);

      // NF-003: both Team and TeamMember are filtered by the supplied tenantId.
      const where = prisma.team.findFirst.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where.tenantId).toBe(TENANT);
      expect(where.leaderId).toBe(MANAGER);
      expect((where.members as { some: { userId: string; tenantId: string } }).some).toEqual({
        userId: TARGET,
        tenantId: TENANT,
      });
    });

    it('returns false when the target user is not a member of the manager team', async () => {
      prisma.team.findFirst.mockResolvedValue(null as never);
      await expect(rbac.isUserOnManagerTeam(MANAGER, TARGET, TENANT)).resolves.toBe(false);
    });

    it('returns false when a different user leads the team (no row matches)', async () => {
      prisma.team.findFirst.mockResolvedValue(null as never);
      await expect(rbac.isUserOnManagerTeam('other-mgr', TARGET, TENANT)).resolves.toBe(false);
    });

    it('returns false on a cross-tenant lookup (tenant filter excludes the row)', async () => {
      prisma.team.findFirst.mockResolvedValue(null as never);
      await expect(rbac.isUserOnManagerTeam(MANAGER, TARGET, 'tenant-b')).resolves.toBe(false);
      const where = prisma.team.findFirst.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where.tenantId).toBe('tenant-b');
    });

    it('returns false and does not throw when the teams table is missing (P2021)', async () => {
      prisma.team.findFirst.mockRejectedValue({ code: 'P2021' } as never);
      await expect(rbac.isUserOnManagerTeam(MANAGER, TARGET, TENANT)).resolves.toBe(false);
    });

    it('returns false and does not throw on a generic database error', async () => {
      prisma.team.findFirst.mockRejectedValue(new Error('connection reset') as never);
      await expect(rbac.isUserOnManagerTeam(MANAGER, TARGET, TENANT)).resolves.toBe(false);
    });

    it('returns false for a self-lookup without querying the database', async () => {
      await expect(rbac.isUserOnManagerTeam(MANAGER, MANAGER, TENANT)).resolves.toBe(false);
      expect(prisma.team.findFirst).not.toHaveBeenCalled();
    });
  });
});
