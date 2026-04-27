/**
 * IFC-211 — Cross-tenant integration test (audit follow-up)
 *
 * The main home-rbac.test.ts mocks RBACService so it controls
 * isUserOnManagerTeam outcomes per case (mock-circular at the procedure
 * level). This file does NOT mock '../../../security/rbac' — instead it
 * lets the real RBACService.isUserOnManagerTeam run against a Prisma mock
 * that returns a row only when both Team.tenantId AND TeamMember.tenantId
 * filters match. That proves the procedure denies cross-tenant requests
 * because the helper's where clause is enforcing tenant isolation, not
 * because a hand-mocked helper returns false.
 *
 * Verifies: AC-006 by composition — procedure-level denial driven by the
 * real helper's tenant double-filter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));

import { homeRouter } from '../home.router';
import { getAuditLogger } from '../../../security/audit-logger';
import { prismaMock, createManagerContext, TEST_UUIDS } from '../../../test/setup';

let mockLogAction: ReturnType<typeof vi.fn>;
let mockLogPermissionDenied: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockLogAction = vi.fn().mockResolvedValue('audit-id');
  mockLogPermissionDenied = vi.fn().mockResolvedValue('audit-id');
  vi.mocked(getAuditLogger).mockReturnValue({
    logAction: mockLogAction,
    logPermissionDenied: mockLogPermissionDenied,
  } as any);

  (prismaMock.user as any).findUnique = vi.fn().mockResolvedValue({ preferences: {} });
  (prismaMock.user as any).update = vi.fn().mockResolvedValue({});
});

describe('IFC-211 — setTeamMemberGoal cross-tenant denial (real RBACService.isUserOnManagerTeam)', () => {
  it('denies when target user belongs to a team in another tenant — real helper enforces tenant double-filter', async () => {
    // Prisma mock simulates the schema: returns a row ONLY when both
    // Team.tenantId AND TeamMember.tenantId in the where clause match the
    // current request's tenantId. Cross-tenant lookups return null because
    // the helper's where clause forces both filters.
    const teamFindFirst = vi.fn().mockImplementation(async (args: any) => {
      const tenantA = TEST_UUIDS.tenant;
      const tenantB = TEST_UUIDS.otherTenant;

      const teamTenantId = args?.where?.tenantId;
      const memberTenantId = args?.where?.members?.some?.tenantId;
      const memberUserId = args?.where?.members?.some?.userId;

      // The "real team" — manager TEST_UUIDS.manager1 leads a team with
      // teamMember1 in tenantB. When the procedure passes tenantA in both
      // filters (current request's tenant), the where clause does not
      // match the cross-tenant row.
      const realTeamRecord = {
        leaderId: TEST_UUIDS.manager1,
        tenantId: tenantB,
        memberTenantId: tenantB,
        memberUserId: TEST_UUIDS.teamMember1,
      };

      const matches =
        teamTenantId === realTeamRecord.tenantId &&
        memberTenantId === realTeamRecord.memberTenantId &&
        memberUserId === realTeamRecord.memberUserId &&
        args.where.leaderId === realTeamRecord.leaderId;

      // The procedure passes tenantA (request tenant) — never matches the
      // tenantB row even though the user/leader IDs are correct.
      return matches ? { id: 'real-team-id' } : null;
    });
    (prismaMock as any).team = { findFirst: teamFindFirst };

    const ctx = createManagerContext(); // tenantId === TEST_UUIDS.tenant (tenant A)
    const caller = homeRouter.createCaller(ctx);

    await expect(
      caller.setTeamMemberGoal({
        type: 'calls',
        targetValue: 30,
        label: undefined,
        customUnit: undefined,
        targetUserId: TEST_UUIDS.teamMember1, // member of a team in tenant B
      })
    ).rejects.toThrow(TRPCError);

    // Verify the helper actually consulted Prisma with the request's
    // tenantId on BOTH filters (tenant double-filter).
    expect(teamFindFirst).toHaveBeenCalledTimes(1);
    const callArgs = teamFindFirst.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe(TEST_UUIDS.tenant);
    expect(callArgs.where.members.some.tenantId).toBe(TEST_UUIDS.tenant);

    await new Promise((r) => setImmediate(r));
    expect(mockLogPermissionDenied).toHaveBeenCalledWith(
      'goal',
      TEST_UUIDS.teamMember1,
      'goal:manage',
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.manager1 })
    );
    expect(mockLogAction).not.toHaveBeenCalled();
    expect((prismaMock.user as any).update).not.toHaveBeenCalled();
  });

  it('allows when both tenant filters match — same helper, same Prisma mock, just same-tenant target', async () => {
    const teamFindFirst = vi.fn().mockImplementation(async (args: any) => {
      // Same-tenant team — both filters match request tenantId
      const matches =
        args?.where?.tenantId === TEST_UUIDS.tenant &&
        args?.where?.members?.some?.tenantId === TEST_UUIDS.tenant &&
        args?.where?.members?.some?.userId === TEST_UUIDS.teamMember1 &&
        args?.where?.leaderId === TEST_UUIDS.manager1;
      return matches ? { id: 'same-tenant-team-id' } : null;
    });
    (prismaMock as any).team = { findFirst: teamFindFirst };

    const ctx = createManagerContext();
    const caller = homeRouter.createCaller(ctx);
    const result = await caller.setTeamMemberGoal({
      type: 'calls',
      targetValue: 30,
      label: undefined,
      customUnit: undefined,
      targetUserId: TEST_UUIDS.teamMember1,
    });

    expect(result.success).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'goal',
      TEST_UUIDS.teamMember1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ metadata: { scope: 'team' } })
    );
  });
});
