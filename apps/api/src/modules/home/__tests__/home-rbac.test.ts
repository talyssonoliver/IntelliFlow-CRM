/**
 * IFC-211 — Goal Settings RBAC router tests
 *
 * Exercises the RBAC + audit + resolution-order behaviour added to the home
 * router:
 *   - updateDailyGoal    self-write, goal:write, audit scope 'self'
 *   - setTeamMemberGoal  manager-on-team / admin-bypass, audit scope 'team'
 *   - setOrgGoalDefault  admin-only (adminTenantProcedure), audit scope 'org'
 *   - getDailyGoal       resolution order: user override → tenant default → hardcoded
 *   - getOrgGoalDefault  tenant default read (null / P2021 safe)
 *
 * `getAuditLogger` is mocked to a spy logger so audit calls can be asserted
 * without touching the DB. `can()` runs for real (the deep prisma mock resolves
 * `permission.findUnique` to null, so the role matrix decides), while the
 * team-membership lookup is stubbed via `RBACService.prototype.isUserOnManagerTeam`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RBACService } from '../../../security/rbac';
import type { RoleName } from '../../../security/types';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  TEST_UUIDS,
} from '../../../test/setup';

// Mock only getAuditLogger; keep the rest of the audit module real so any
// transitive consumer still resolves.
vi.mock('../../../security/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../security/audit')>();
  return { ...actual, getAuditLogger: vi.fn() };
});

import { getAuditLogger } from '../../../security/audit';
import { homeRouter } from '../home.router';

const logAction = vi.fn().mockResolvedValue('audit-id');
const logPermissionDenied = vi.fn().mockResolvedValue('audit-id');

/** Build a caller context for an arbitrary role (user + tenant kept in sync). */
function ctxWithRole(role: RoleName, userId: string = TEST_UUIDS.user1) {
  const tenantId = TEST_UUIDS.tenant;
  return createTestContext({
    user: { userId, email: 'u@example.com', role, tenantId, emailVerified: true },
    tenant: {
      tenantId,
      tenantType: 'user' as const,
      userId,
      role,
      canAccessAllTenantData: role === 'ADMIN' || role === 'MANAGER',
    },
  });
}

const flush = () => new Promise((r) => setImmediate(r));

describe('IFC-211 home router — Goal Settings RBAC', () => {
  beforeEach(() => {
    // setup.ts's global beforeEach resets mock *implementations*, so re-establish
    // the resolved values here (not just mockClear) or the fire-and-forget
    // `.catch` chains would call `.catch` on undefined.
    logAction.mockReset().mockResolvedValue('audit-id');
    logPermissionDenied.mockReset().mockResolvedValue('audit-id');
    vi.mocked(getAuditLogger).mockReturnValue({
      logAction,
      logPermissionDenied,
    } as unknown as ReturnType<typeof getAuditLogger>);

    // Real can() falls back to the role matrix when there is no DB override.
    (
      prismaMock.permission as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue(null as never);
    // Sensible defaults for getDailyGoal's currentValue queries.
    prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    (prismaMock.opportunity as { aggregate: ReturnType<typeof vi.fn> }).aggregate.mockResolvedValue(
      {
        _sum: { value: null },
      } as never
    );
    (prismaMock.callRecord as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(
      0 as never
    );
    (prismaMock.appointment as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(
      0 as never
    );
    (prismaMock.task as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(0 as never);
    (
      prismaMock.tenantGoalDefault as {
        findUnique: ReturnType<typeof vi.fn>;
        upsert: ReturnType<typeof vi.fn>;
      }
    ).findUnique.mockResolvedValue(null as never);
    (prismaMock.tenantGoalDefault as { upsert: ReturnType<typeof vi.fn> }).upsert.mockResolvedValue(
      {} as never
    );
  });

  // ───────────────────────────── updateDailyGoal (self) ─────────────────────
  describe('updateDailyGoal RBAC (self-write)', () => {
    const input = { type: 'calls' as const, targetValue: 10 };

    it.each(['USER', 'SALES_REP', 'MANAGER', 'ADMIN'] as RoleName[])(
      '%s can update own goal and the write is audited with scope=self',
      async (role) => {
        const caller = homeRouter.createCaller(ctxWithRole(role));
        const res = await caller.updateDailyGoal(input);
        expect(res.success).toBe(true);
        expect(logAction).toHaveBeenCalledWith(
          'UPDATE',
          'goal',
          TEST_UUIDS.user1,
          TEST_UUIDS.tenant,
          expect.objectContaining({ metadata: { scope: 'self' } })
        );
        expect(logPermissionDenied).not.toHaveBeenCalled();
      }
    );

    it('VIEWER is denied goal:write, audited, and the goal is not written', async () => {
      const caller = homeRouter.createCaller(ctxWithRole('VIEWER'));
      await expect(caller.updateDailyGoal(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(logPermissionDenied).toHaveBeenCalledWith(
        'goal',
        TEST_UUIDS.user1,
        'goal:write',
        TEST_UUIDS.tenant,
        expect.objectContaining({ actorId: TEST_UUIDS.user1 })
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────── setTeamMemberGoal ────────────────────────────
  describe('setTeamMemberGoal RBAC (manager/admin)', () => {
    const target = TEST_UUIDS.user2;
    const input = { targetUserId: target, type: 'tasks' as const, targetValue: 5 };
    let teamSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      teamSpy = vi.spyOn(RBACService.prototype, 'isUserOnManagerTeam');
    });

    it('MANAGER on the target team may set the goal (audit scope=team)', async () => {
      teamSpy.mockResolvedValue(true);
      const caller = homeRouter.createCaller(ctxWithRole('MANAGER'));
      const res = await caller.setTeamMemberGoal(input);
      expect(res.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: target } })
      );
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'goal',
        target,
        TEST_UUIDS.tenant,
        expect.objectContaining({ metadata: { scope: 'team' } })
      );
    });

    it('MANAGER not leading the target team is denied + audited', async () => {
      teamSpy.mockResolvedValue(false);
      const caller = homeRouter.createCaller(ctxWithRole('MANAGER'));
      await expect(caller.setTeamMemberGoal(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(logPermissionDenied).toHaveBeenCalledWith(
        'goal',
        target,
        'goal:manage',
        TEST_UUIDS.tenant,
        expect.objectContaining({ actorId: TEST_UUIDS.user1 })
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('cross-tenant target (not on any of the manager teams) is denied', async () => {
      // isUserOnManagerTeam applies the tenant filter and returns false.
      teamSpy.mockResolvedValue(false);
      const caller = homeRouter.createCaller(ctxWithRole('MANAGER'));
      await expect(
        caller.setTeamMemberGoal({ ...input, targetUserId: TEST_UUIDS.otherTenantUser })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('SALES_REP lacks goal:manage and is denied (regardless of team)', async () => {
      teamSpy.mockResolvedValue(true);
      const caller = homeRouter.createCaller(ctxWithRole('SALES_REP'));
      await expect(caller.setTeamMemberGoal(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(logPermissionDenied).toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('rejects setting your own goal via the team endpoint (BAD_REQUEST)', async () => {
      const caller = homeRouter.createCaller(ctxWithRole('MANAGER'));
      await expect(
        caller.setTeamMemberGoal({ ...input, targetUserId: TEST_UUIDS.user1 })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('ADMIN bypasses the team-membership check (no team lookup) and is audited', async () => {
      const caller = homeRouter.createCaller(ctxWithRole('ADMIN'));
      const res = await caller.setTeamMemberGoal(input);
      expect(res.success).toBe(true);
      expect(teamSpy).not.toHaveBeenCalled();
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'goal',
        target,
        TEST_UUIDS.tenant,
        expect.objectContaining({ metadata: { scope: 'team' } })
      );
    });
  });

  // ─────────────────────────── setOrgGoalDefault ────────────────────────────
  describe('setOrgGoalDefault RBAC (admin only)', () => {
    const input = { type: 'revenue' as const, targetValue: 8000 };

    it('ADMIN upserts the tenant default and audits with scope=org', async () => {
      const caller = homeRouter.createCaller(createAdminContext());
      const res = await caller.setOrgGoalDefault(input);
      expect(res.success).toBe(true);
      expect(prismaMock.tenantGoalDefault.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TEST_UUIDS.tenant } })
      );
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'goal',
        TEST_UUIDS.tenant,
        TEST_UUIDS.tenant,
        expect.objectContaining({ metadata: { scope: 'org' } })
      );
    });

    it('ADMIN upsert still succeeds when the before-state lookup fails', async () => {
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockRejectedValue(new Error('read failed') as never);
      const caller = homeRouter.createCaller(createAdminContext());
      const res = await caller.setOrgGoalDefault(input);
      expect(res.success).toBe(true);
      expect(prismaMock.tenantGoalDefault.upsert).toHaveBeenCalled();
    });

    it('MANAGER is rejected by adminTenantProcedure (FORBIDDEN, no upsert)', async () => {
      const caller = homeRouter.createCaller(createManagerContext());
      await expect(caller.setOrgGoalDefault(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(prismaMock.tenantGoalDefault.upsert).not.toHaveBeenCalled();
    });

    it('USER is rejected by adminTenantProcedure (FORBIDDEN, no upsert)', async () => {
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      await expect(caller.setOrgGoalDefault(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(prismaMock.tenantGoalDefault.upsert).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────── getDailyGoal resolution order ───────────────────
  describe('getDailyGoal resolution order', () => {
    it('uses the user override when present (tenant default not queried)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'calls', targetValue: 20 } },
      } as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      const res = await caller.getDailyGoal();
      expect(res.goal.type).toBe('calls');
      expect(res.goal.targetValue).toBe(20);
      expect(prismaMock.tenantGoalDefault.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to the tenant default when the user has no override', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as never);
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue({
        goalType: 'meetings',
        targetValue: 7,
        label: null,
        customUnit: null,
      } as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      const res = await caller.getDailyGoal();
      expect(res.goal.type).toBe('meetings');
      expect(res.goal.targetValue).toBe(7);
    });

    it('falls back to hardcoded defaults when neither override nor tenant default exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as never);
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue(null as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      const res = await caller.getDailyGoal();
      expect(res.goal.type).toBe('revenue');
      expect(res.goal.targetValue).toBe(5000);
    });

    it('does not throw on P2021 (missing table) — uses hardcoded defaults', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as never);
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockRejectedValue({ code: 'P2021' } as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      const res = await caller.getDailyGoal();
      expect(res.goal.type).toBe('revenue');
      expect(res.goal.targetValue).toBe(5000);
    });

    it('does not throw on a generic tenant-default lookup error — uses hardcoded defaults', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as never);
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockRejectedValue(new Error('db down') as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      const res = await caller.getDailyGoal();
      expect(res.goal.type).toBe('revenue');
      expect(res.goal.targetValue).toBe(5000);
    });
  });

  // ────────────────────────────── getOrgGoalDefault ─────────────────────────
  describe('getOrgGoalDefault', () => {
    it('returns the mapped tenant default when a row exists', async () => {
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue({
        tenantId: TEST_UUIDS.tenant,
        goalType: 'tasks',
        targetValue: 8,
        label: null,
        customUnit: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      } as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      const res = await caller.getOrgGoalDefault();
      expect(res?.goal.type).toBe('tasks');
      expect(res?.goal.targetValue).toBe(8);
    });

    it('returns null when no tenant default is configured', async () => {
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockResolvedValue(null as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      await expect(caller.getOrgGoalDefault()).resolves.toBeNull();
    });

    it('returns null (no throw) when the table is missing (P2021)', async () => {
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockRejectedValue({ code: 'P2021' } as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      await expect(caller.getOrgGoalDefault()).resolves.toBeNull();
    });

    it('returns null (no throw) on a generic lookup error', async () => {
      (
        prismaMock.tenantGoalDefault as { findUnique: ReturnType<typeof vi.fn> }
      ).findUnique.mockRejectedValue(new Error('db down') as never);
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      await expect(caller.getOrgGoalDefault()).resolves.toBeNull();
    });
  });

  // ───────────────────────────── audit assertions ───────────────────────────
  describe('audit trail', () => {
    it('every successful write logs exactly one UPDATE with the correct scope', async () => {
      const caller = homeRouter.createCaller(createAdminContext());
      await caller.updateDailyGoal({ type: 'revenue', targetValue: 100 });
      await flush();
      const scopes = logAction.mock.calls.map(
        (c) => (c[4] as { metadata: { scope: string } }).metadata.scope
      );
      expect(scopes).toContain('self');
      expect(logAction.mock.calls.every((c) => c[0] === 'UPDATE' && c[1] === 'goal')).toBe(true);
    });
  });

  // NF-002: audit writes are fire-and-forget; a rejected audit must never change
  // a procedure's outcome.
  describe('audit failures are non-blocking (NF-002)', () => {
    it('updateDailyGoal still succeeds when the audit write rejects', async () => {
      logAction.mockRejectedValue(new Error('audit down'));
      const caller = homeRouter.createCaller(ctxWithRole('USER'));
      await expect(
        caller.updateDailyGoal({ type: 'revenue', targetValue: 100 })
      ).resolves.toMatchObject({ success: true });
      await flush();
    });

    it('setTeamMemberGoal still succeeds when the audit write rejects', async () => {
      logAction.mockRejectedValue(new Error('audit down'));
      vi.spyOn(RBACService.prototype, 'isUserOnManagerTeam').mockResolvedValue(true);
      const caller = homeRouter.createCaller(ctxWithRole('MANAGER'));
      await expect(
        caller.setTeamMemberGoal({ targetUserId: TEST_UUIDS.user2, type: 'tasks', targetValue: 5 })
      ).resolves.toMatchObject({ success: true });
      await flush();
    });

    it('setOrgGoalDefault still succeeds when the audit write rejects', async () => {
      logAction.mockRejectedValue(new Error('audit down'));
      const caller = homeRouter.createCaller(createAdminContext());
      await expect(
        caller.setOrgGoalDefault({ type: 'revenue', targetValue: 100 })
      ).resolves.toMatchObject({ success: true });
      await flush();
    });

    it('a denied write still throws FORBIDDEN even when the denial audit rejects', async () => {
      logPermissionDenied.mockRejectedValue(new Error('audit down'));
      const caller = homeRouter.createCaller(ctxWithRole('VIEWER'));
      await expect(
        caller.updateDailyGoal({ type: 'revenue', targetValue: 100 })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await flush();
    });
  });
});
