/**
 * IFC-211 — Goal Settings RBAC tests for home.router.ts
 *
 * 24 cases across 6 sections:
 *   - updateDailyGoal RBAC (5 — one per role)
 *   - setTeamMemberGoal RBAC (6)
 *   - setOrgGoalDefault RBAC (3)
 *   - getDailyGoal resolution order (4)
 *   - getOrgGoalDefault (3)
 *   - Audit log assertions (3)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Module mocks (must be hoisted before importing the router) ───────────────

const mockCan = vi.fn();
const mockIsUserOnManagerTeam = vi.fn();

vi.mock('../../../security/rbac', () => ({
  RBACService: class {
    constructor(_prisma: unknown) {}
    can = mockCan;
    isUserOnManagerTeam = mockIsUserOnManagerTeam;
  },
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { homeRouter } from '../home.router';
import { getAuditLogger } from '../../../security/audit-logger';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  TEST_UUIDS,
} from '../../../test/setup';

// ─── Per-test mocks ───────────────────────────────────────────────────────────

let mockLogAction: ReturnType<typeof vi.fn>;
let mockLogPermissionDenied: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Default: grant the RBAC check; tests override per case
  mockCan.mockResolvedValue({ granted: true, checkedPermissions: [], roleLevel: 30 });
  mockIsUserOnManagerTeam.mockResolvedValue(false);

  mockLogAction = vi.fn().mockResolvedValue('audit-id');
  mockLogPermissionDenied = vi.fn().mockResolvedValue('audit-id');

  vi.mocked(getAuditLogger).mockReturnValue({
    logAction: mockLogAction,
    logPermissionDenied: mockLogPermissionDenied,
  } as any);

  // Default user lookup (for read/write of preferences.dailyGoal)
  (prismaMock.user as any).findUnique = vi.fn().mockResolvedValue({
    preferences: { dailyGoal: { type: 'revenue', targetValue: 5000, label: 'Sales' } },
  });
  (prismaMock.user as any).update = vi.fn().mockResolvedValue({});

  // tenantGoalDefault mock
  (prismaMock as any).tenantGoalDefault = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  };

  // Default IFC-195 query mocks (to keep getDailyGoal from crashing)
  (prismaMock.opportunity as any).aggregate = vi.fn().mockResolvedValue({ _sum: { value: 0 } });
  (prismaMock.callRecord as any) = (prismaMock.callRecord as any) ?? {};
  (prismaMock.callRecord as any).count = vi.fn().mockResolvedValue(0);
  (prismaMock.appointment as any).count = vi.fn().mockResolvedValue(0);
  (prismaMock.task as any).count = vi.fn().mockResolvedValue(0);
});

// =============================================================================
// updateDailyGoal RBAC (5 cases)
// =============================================================================

describe('IFC-211 — home.updateDailyGoal RBAC', () => {
  const goalInput = {
    type: 'revenue' as const,
    targetValue: 7500,
    label: 'Q2 sales',
    customUnit: undefined,
  };

  it('SALES_REP can write own goal — audit UPDATE with metadata.scope=self', async () => {
    const ctx = createTestContext({
      user: {
        userId: TEST_UUIDS.user1,
        email: 'r@x',
        role: 'SALES_REP',
        tenantId: TEST_UUIDS.tenant,
      },
      tenant: {
        tenantId: TEST_UUIDS.tenant,
        tenantType: 'user' as const,
        userId: TEST_UUIDS.user1,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      },
    });
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.updateDailyGoal(goalInput);
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.user1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1, metadata: { scope: 'self' } })
    );
  });

  it('USER can write own goal', async () => {
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.updateDailyGoal(goalInput);
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect(mockLogAction).toHaveBeenCalled();
  });

  it('MANAGER can write own goal', async () => {
    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.updateDailyGoal(goalInput);
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect(mockLogAction).toHaveBeenCalled();
  });

  it('ADMIN can write own goal', async () => {
    const ctx = createAdminContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.updateDailyGoal(goalInput);
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect(mockLogAction).toHaveBeenCalled();
  });

  it('VIEWER is denied write — FORBIDDEN + logPermissionDenied', async () => {
    mockCan.mockResolvedValue({
      granted: false,
      reason: 'Role VIEWER does not have write permission on goal',
      checkedPermissions: [],
      roleLevel: 0,
    });
    const ctx = createTestContext({
      user: { userId: TEST_UUIDS.user1, email: 'v@x', role: 'VIEWER', tenantId: TEST_UUIDS.tenant },
      tenant: {
        tenantId: TEST_UUIDS.tenant,
        tenantType: 'user' as const,
        userId: TEST_UUIDS.user1,
        role: 'VIEWER',
        canAccessAllTenantData: false,
      },
    });
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.updateDailyGoal(goalInput)).rejects.toThrow(TRPCError);
    await new Promise((r) => setImmediate(r));
    expect(mockLogPermissionDenied).toHaveBeenCalledWith(
      'goal',
      TEST_UUIDS.user1,
      'goal:write',
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
    expect(mockLogAction).not.toHaveBeenCalled();
  });
});

// =============================================================================
// setTeamMemberGoal RBAC (6 cases)
// =============================================================================

describe('IFC-211 — home.setTeamMemberGoal RBAC', () => {
  const baseInput = (targetUserId: string) => ({
    type: 'calls' as const,
    targetValue: 30,
    label: 'Daily calls',
    customUnit: undefined,
    targetUserId,
  });

  it('MANAGER on the same team as target → allows + audit scope=team', async () => {
    mockIsUserOnManagerTeam.mockResolvedValue(true);
    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.setTeamMemberGoal(baseInput(TEST_UUIDS.teamMember1));
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.teamMember1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.manager1, metadata: { scope: 'team' } })
    );
  });

  it('MANAGER not on target team → FORBIDDEN + logPermissionDenied', async () => {
    mockIsUserOnManagerTeam.mockResolvedValue(false);
    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.setTeamMemberGoal(baseInput(TEST_UUIDS.user2))).rejects.toThrow(TRPCError);
    await new Promise((r) => setImmediate(r));
    expect(mockLogPermissionDenied).toHaveBeenCalledWith(
      'goal',
      TEST_UUIDS.user2,
      'goal:manage',
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.manager1 })
    );
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('SALES_REP role → FORBIDDEN (no goal:manage)', async () => {
    mockCan.mockResolvedValue({
      granted: false,
      reason: 'Role SALES_REP does not have manage permission on goal',
      checkedPermissions: [],
      roleLevel: 20,
    });
    const ctx = createTestContext({
      user: {
        userId: TEST_UUIDS.user1,
        email: 's@x',
        role: 'SALES_REP',
        tenantId: TEST_UUIDS.tenant,
      },
      tenant: {
        tenantId: TEST_UUIDS.tenant,
        tenantType: 'user' as const,
        userId: TEST_UUIDS.user1,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      },
    });
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.setTeamMemberGoal(baseInput(TEST_UUIDS.user2))).rejects.toThrow(TRPCError);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('cross-tenant target user → FORBIDDEN (isUserOnManagerTeam returns false on cross-tenant)', async () => {
    // The helper enforces tenant filter; the test mock returns false to simulate
    mockIsUserOnManagerTeam.mockResolvedValue(false);
    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.setTeamMemberGoal(baseInput(TEST_UUIDS.otherTenantUser))).rejects.toThrow(
      TRPCError
    );
    await new Promise((r) => setImmediate(r));
    expect(mockLogPermissionDenied).toHaveBeenCalled();
  });

  it('targetUserId === actor → BAD_REQUEST (use updateDailyGoal for self)', async () => {
    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.setTeamMemberGoal(baseInput(TEST_UUIDS.manager1))).rejects.toThrow(
      /updateDailyGoal/
    );
    expect(mockLogAction).not.toHaveBeenCalled();
    expect(mockLogPermissionDenied).not.toHaveBeenCalled();
  });

  it('ADMIN bypasses team-membership check → allow + audit scope=team', async () => {
    mockIsUserOnManagerTeam.mockResolvedValue(false); // admin bypass should NOT call this
    const ctx = createAdminContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.setTeamMemberGoal(baseInput(TEST_UUIDS.user1));
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect(mockIsUserOnManagerTeam).not.toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.user1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ metadata: { scope: 'team' } })
    );
  });
});

// =============================================================================
// setOrgGoalDefault RBAC (3 cases)
// =============================================================================

describe('IFC-211 — home.setOrgGoalDefault RBAC', () => {
  const orgInput = {
    type: 'meetings' as const,
    targetValue: 5,
    label: 'Org default',
    customUnit: undefined,
  };

  it('ADMIN can write org default → upserts row + audit scope=org', async () => {
    const ctx = createAdminContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.setOrgGoalDefault(orgInput);
    await new Promise((r) => setImmediate(r));
    expect(result.success).toBe(true);
    expect((prismaMock as any).tenantGoalDefault.upsert).toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.tenant,
      TEST_UUIDS.tenant,
      expect.objectContaining({ metadata: { scope: 'org' } })
    );
  });

  it('MANAGER is denied (adminTenantProcedure → FORBIDDEN)', async () => {
    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.setOrgGoalDefault(orgInput)).rejects.toThrow(TRPCError);
    expect((prismaMock as any).tenantGoalDefault.upsert).not.toHaveBeenCalled();
  });

  it('USER is denied (adminTenantProcedure → FORBIDDEN)', async () => {
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    await expect(caller.setOrgGoalDefault(orgInput)).rejects.toThrow(TRPCError);
    expect((prismaMock as any).tenantGoalDefault.upsert).not.toHaveBeenCalled();
  });
});

// =============================================================================
// getDailyGoal resolution order (4 cases)
// =============================================================================

describe('IFC-211 — home.getDailyGoal resolution order', () => {
  it('returns user override when User.preferences.dailyGoal is set', async () => {
    (prismaMock.user as any).findUnique = vi.fn().mockResolvedValue({
      preferences: { dailyGoal: { type: 'tasks', targetValue: 8, label: 'Tasks' } },
    });
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getDailyGoal();
    expect(result.goal.type).toBe('tasks');
    expect(result.goal.targetValue).toBe(8);
    // Should NOT consult tenantGoalDefault when user override exists
    expect((prismaMock as any).tenantGoalDefault.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to TenantGoalDefault when no user override', async () => {
    (prismaMock.user as any).findUnique = vi.fn().mockResolvedValue({ preferences: {} });
    (prismaMock as any).tenantGoalDefault.findUnique = vi.fn().mockResolvedValue({
      tenantId: TEST_UUIDS.tenant,
      goalType: 'meetings',
      targetValue: 4,
      label: 'Org meetings',
      customUnit: null,
    });
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getDailyGoal();
    expect(result.goal.type).toBe('meetings');
    expect(result.goal.targetValue).toBe(4);
    expect((prismaMock as any).tenantGoalDefault.findUnique).toHaveBeenCalled();
  });

  it('falls back to hardcoded GOAL_DEFAULTS when no user override and no tenant default', async () => {
    (prismaMock.user as any).findUnique = vi.fn().mockResolvedValue({ preferences: {} });
    (prismaMock as any).tenantGoalDefault.findUnique = vi.fn().mockResolvedValue(null);
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getDailyGoal();
    expect(result.goal.type).toBe('revenue');
    expect(result.goal.targetValue).toBe(5000); // GOAL_DEFAULTS.revenue
  });

  it('on P2021 (table missing) — falls back to hardcoded defaults without throwing', async () => {
    (prismaMock.user as any).findUnique = vi.fn().mockResolvedValue({ preferences: {} });
    (prismaMock as any).tenantGoalDefault.findUnique = vi.fn().mockImplementation(async () => {
      const err: any = new Error('relation does not exist');
      err.code = 'P2021';
      throw err;
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getDailyGoal();
    expect(result.goal.type).toBe('revenue');
    expect(result.goal.targetValue).toBe(5000);
    debugSpy.mockRestore();
  });
});

// =============================================================================
// getOrgGoalDefault (3 cases)
// =============================================================================

describe('IFC-211 — home.getOrgGoalDefault', () => {
  it('returns the row when present', async () => {
    (prismaMock as any).tenantGoalDefault.findUnique = vi.fn().mockResolvedValue({
      tenantId: TEST_UUIDS.tenant,
      goalType: 'tasks',
      targetValue: 12,
      label: 'Org tasks',
      customUnit: null,
      updatedAt: new Date('2026-04-27T00:00:00Z'),
    });
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getOrgGoalDefault();
    expect(result).not.toBeNull();
    expect(result!.goal.type).toBe('tasks');
    expect(result!.goal.targetValue).toBe(12);
  });

  it('returns null when no row exists', async () => {
    (prismaMock as any).tenantGoalDefault.findUnique = vi.fn().mockResolvedValue(null);
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getOrgGoalDefault();
    expect(result).toBeNull();
  });

  it('returns null on P2021 without throwing', async () => {
    (prismaMock as any).tenantGoalDefault.findUnique = vi.fn().mockImplementation(async () => {
      const err: any = new Error('relation does not exist');
      err.code = 'P2021';
      throw err;
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.getOrgGoalDefault();
    expect(result).toBeNull();
    debugSpy.mockRestore();
  });
});

// =============================================================================
// Audit log assertions (3 cross-cutting cases)
// =============================================================================

describe('IFC-211 — Audit log assertions', () => {
  it('every successful goal write calls logAction once', async () => {
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    await caller.updateDailyGoal({
      type: 'calls',
      targetValue: 20,
      label: undefined,
      customUnit: undefined,
    });
    await new Promise((r) => setImmediate(r));
    expect(mockLogAction).toHaveBeenCalledTimes(1);
  });

  it('every FORBIDDEN denial calls logPermissionDenied once', async () => {
    mockCan.mockResolvedValue({
      granted: false,
      reason: 'denied',
      checkedPermissions: [],
      roleLevel: 0,
    });
    const ctx = createTestContext();
    const caller = homeRouter.createCaller(ctx);
    await expect(
      caller.updateDailyGoal({
        type: 'revenue',
        targetValue: 100,
        label: undefined,
        customUnit: undefined,
      })
    ).rejects.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(mockLogPermissionDenied).toHaveBeenCalledTimes(1);
  });

  it('audit metadata.scope value matches endpoint (self / team / org)', async () => {
    // self
    const userCtx = createTestContext();
    await homeRouter
      .createCaller(userCtx)
      .updateDailyGoal({ type: 'tasks', targetValue: 5, label: undefined, customUnit: undefined });
    await new Promise((r) => setImmediate(r));
    expect(mockLogAction).toHaveBeenLastCalledWith(
      'UPDATE',
      'goal',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ metadata: { scope: 'self' } })
    );

    // team (admin bypass)
    const adminCtx = createAdminContext();
    await homeRouter.createCaller(adminCtx).setTeamMemberGoal({
      type: 'tasks',
      targetValue: 5,
      label: undefined,
      customUnit: undefined,
      targetUserId: TEST_UUIDS.user1,
    });
    await new Promise((r) => setImmediate(r));
    expect(mockLogAction).toHaveBeenLastCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.user1,
      expect.any(String),
      expect.objectContaining({ metadata: { scope: 'team' } })
    );

    // org
    await homeRouter.createCaller(adminCtx).setOrgGoalDefault({
      type: 'tasks',
      targetValue: 5,
      label: undefined,
      customUnit: undefined,
    });
    await new Promise((r) => setImmediate(r));
    expect(mockLogAction).toHaveBeenLastCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.tenant,
      TEST_UUIDS.tenant,
      expect.objectContaining({ metadata: { scope: 'org' } })
    );
  });
});
