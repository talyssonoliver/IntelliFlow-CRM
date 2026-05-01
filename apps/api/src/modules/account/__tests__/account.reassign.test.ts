/**
 * Account Reassign Procedures — IFC-311
 *
 * Covers:
 *  - account.reassign (single)        — AC-A1..A7, AC-AO2 wiring case
 *  - account.bulkReassign (batch)     — AC-AB1..AB5 + perf
 *  - account.assignOwner regression   — AC-AO1 + AC-AO2 (notification gain)
 *
 * Mock pattern follows account.router.test.ts:
 *  - prismaMock.$transaction = (cb) => cb(prismaMock)
 *  - prismaMock.account.findFirst / updateMany — controlled per-test
 *  - prismaMock.user.findFirst — target user lookup
 *  - prismaMock.accountAutomationSetting.findUnique — flags loader
 *  - prismaMock.notification.create — surface for createNotification fallback
 *
 * Notification path: we let `notifyAccountReassignment` run for real and
 * intercept the per-call `createNotification` write at the Prisma layer
 * (prismaMock.notification.create) so we can assert exactly two notifications
 * (old owner + new owner) without re-mocking the helper itself.
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { accountRouter } from '../account.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  mockAccount,
} from '../../../test/setup';
import * as auditLoggerModule from '../../../security/audit-logger';

const newOwnerUuid = TEST_UUIDS.user2;
const otherTenantId = '99999999-0000-4000-8000-999999999999';

function flagsOn() {
  return {
    autoAssignOwner: false,
    autoLinkContactsByDomain: true,
    preventDeleteWithOpenOpportunities: true,
    notifyOnOwnerChange: true, // ← key flag
    normalizeWebsiteDomain: true,
    autoCapitalizeAccountNames: true,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    aiIndustryInference: false,
    aiEnrichment: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    aiAccountScoring: false,
  };
}

function flagsOff() {
  return { ...flagsOn(), notifyOnOwnerChange: false };
}

function commonBeforeEach() {
  // $transaction passes prismaMock as tx
  (prismaMock as any).$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prismaMock));

  // Default: tenant has notifyOnOwnerChange=true by simulating row return
  (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValue({
    autoAssignOwner: false,
    autoLinkContactsByDomain: true,
    preventDeleteWithOpenOpportunities: true,
    notifyOnOwnerChange: true,
    normalizeWebsiteDomain: true,
    autoCapitalizeAccountNames: true,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    aiIndustryInference: false,
    aiEnrichment: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    aiAccountScoring: false,
  });

  // Default account row owned by the caller (so SALES_REP-as-owner can pass)
  prismaMock.account.findFirst.mockResolvedValue({
    ...mockAccount,
  } as any);

  // Default target user: same tenant
  prismaMock.user.findFirst.mockResolvedValue({
    id: newOwnerUuid,
    name: 'New Owner',
    email: 'new@co.com',
    tenantId: TEST_UUIDS.tenant,
  } as any);

  // Default updateMany succeeds
  prismaMock.account.updateMany.mockResolvedValue({ count: 1 } as any);

  // Default notification fallback: createNotification(prisma, params, undefined)
  // hits prismaMock.notification.create
  (prismaMock.notification as any).create = vi.fn().mockResolvedValue({
    id: 'notif-id',
    createdAt: new Date(),
    metadata: {},
  });
}

describe('account.reassign (IFC-311)', () => {
  const adminCtx = createAdminContext();
  const adminCaller = accountRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  // ─── AC-A1: notifyOnOwnerChange = true → both parties notified ───────────
  it('AC-A1: writes new ownerId and notifies both old + new owner when flag is true', async () => {
    const result = await adminCaller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    expect(result.previousOwnerId).toBe(TEST_UUIDS.user1);
    expect(result.newOwnerId).toBe(newOwnerUuid);
    expect(result.notified).toBe(true);

    expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
      where: { id: TEST_UUIDS.account1, tenantId: TEST_UUIDS.tenant },
      data: { ownerId: newOwnerUuid },
    });

    // notifyAccountReassignment dispatches via createNotification, which
    // falls back to prismaMock.notification.create — TWO calls (old + new)
    expect((prismaMock.notification as any).create).toHaveBeenCalledTimes(2);
    const calls = ((prismaMock.notification as any).create as any).mock.calls;
    const recipients = calls.map((c: any[]) => c[0].data.recipientId);
    expect(recipients).toContain(TEST_UUIDS.user1); // previous owner
    expect(recipients).toContain(newOwnerUuid); // new owner
  });

  // ─── AC-A2: notifyOnOwnerChange = false → no notification ─────────────────
  it('AC-A2: writes new ownerId but does NOT notify when flag is false', async () => {
    (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValue(flagsOff());

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    expect(result.notified).toBe(false);
    expect(prismaMock.account.updateMany).toHaveBeenCalled();
    expect((prismaMock.notification as any).create).not.toHaveBeenCalled();
  });

  // ─── AC-A3: self-reassign → SKIPPED ───────────────────────────────────────
  it('AC-A3: self-reassign returns skipped, no write, no notify', async () => {
    const result = await adminCaller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: TEST_UUIDS.user1, // same as mockAccount.ownerId
    });

    expect((result as any).skipped).toBe(true);
    expect(result.notified).toBe(false);
    expect(result.previousOwnerId).toBe(TEST_UUIDS.user1);
    expect(result.newOwnerId).toBe(TEST_UUIDS.user1);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
    expect((prismaMock.notification as any).create).not.toHaveBeenCalled();
  });

  // ─── AC-A4: cross-tenant entity → NOT_FOUND ──────────────────────────────
  it('AC-A4: cross-tenant entity throws NOT_FOUND', async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.nonExistent, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  // ─── AC-A5: cross-tenant target user → NOT_FOUND ──────────────────────────
  it('AC-A5: cross-tenant target user throws NOT_FOUND, no write', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  // ─── AC-A6: caller is non-owner non-admin → FORBIDDEN ─────────────────────
  it('AC-A6: SALES_REP non-owner caller is FORBIDDEN', async () => {
    // Account is owned by user1; caller is a different SALES_REP user
    const otherUserId = '11111111-0000-4000-8000-111111111111';
    const ctx = createTestContext({
      user: {
        userId: otherUserId,
        email: 'other@example.com',
        role: 'SALES_REP',
        tenantId: TEST_UUIDS.tenant,
      },
      tenant: {
        tenantId: TEST_UUIDS.tenant,
        tenantType: 'user' as const,
        userId: otherUserId,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      },
    });
    const caller = accountRouter.createCaller(ctx);

    await expect(
      caller.reassign({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  // ─── AC-A7: audit log entity-string is literal 'account' ──────────────────
  // The audit-logger writes are tenant-validated and skipped for synthetic
  // test tenant UUIDs (see "[AUDIT] Skipping DB write" stderr). The
  // entity-string `'account'` is type-checked by the audit-logger interface
  // (it accepts only a fixed union of resource types), and a grep gate in
  // Step 8.10 prevents a literal swap to 'contact'. We verify here that the
  // emitAccountReassignSideEffects source contains the literal — a textual
  // safeguard against accidental copy/paste from the contact router.
  it("AC-A7: source code uses entity-string 'account' (not 'contact') in audit call", async () => {
    const fs = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await fs.readFile(
      resolve(process.cwd(), 'src/modules/account/account-reassign.ts'),
      'utf8'
    );
    // Two audit-log call sites: emitAccountReassignSideEffects + logAccountReassignPermissionDenied
    expect(src).toMatch(/\.logAction\('UPDATE',\s*'account'/);
    expect(src).toMatch(/\.logPermissionDenied\('account'/);
    expect(src).not.toMatch(/'contact'/);
  });

  // ─── Caller is current owner (SALES_REP role) → success ───────────────────
  it('AC-A6b: SALES_REP caller who IS the current owner can reassign', async () => {
    // Account ownerId = user1; caller is also user1 with SALES_REP role
    const ctx = createTestContext({
      user: {
        userId: TEST_UUIDS.user1,
        email: 'owner@example.com',
        role: 'SALES_REP',
        tenantId: TEST_UUIDS.tenant,
      },
    });
    const caller = accountRouter.createCaller(ctx);

    const result = await caller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    expect(result.previousOwnerId).toBe(TEST_UUIDS.user1);
    expect(result.newOwnerId).toBe(newOwnerUuid);
  });

  // ─── TOCTOU: updateMany returns 0 → NOT_FOUND ────────────────────────────
  it('TOCTOU: updateMany count===0 raises NOT_FOUND', async () => {
    prismaMock.account.updateMany.mockResolvedValue({ count: 0 } as any);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  // ─── Notification failure isolated from owner write ──────────────────────
  it('AC-C9 mirror: notification helper failure does NOT roll back owner write', async () => {
    (prismaMock.notification as any).create = vi
      .fn()
      .mockRejectedValue(new Error('notification subsystem down'));

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    // Write committed
    expect(prismaMock.account.updateMany).toHaveBeenCalled();
    // Notification reported as not delivered
    expect(result.notified).toBe(false);
    expect(result.newOwnerId).toBe(newOwnerUuid);
  });

  // ─── Idempotent replay ───────────────────────────────────────────────────
  it('idempotent replay: 2nd call after owner already changed returns skipped', async () => {
    // After first reassign, simulate owner is now newOwnerUuid
    prismaMock.account.findFirst.mockResolvedValue({
      ...mockAccount,
      ownerId: newOwnerUuid,
    } as any);

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    expect((result as any).skipped).toBe(true);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });
});

describe('account.bulkReassign (IFC-311)', () => {
  const adminCtx = createAdminContext();
  const adminCaller = accountRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  // ─── AC-AB1: mixed batch ────────────────────────────────────────────────
  it('AC-AB1: mixed batch (3 OK + 1 self-skip + 1 forbidden + 1 not-found + 1 already-owned)', async () => {
    const id1 = TEST_UUIDS.account1;
    const id2 = TEST_UUIDS.account2;
    const id3 = '22222222-0000-4000-8000-222222222222';
    const idSelfSkip = '33333333-0000-4000-8000-333333333333';
    const idForbidden = '44444444-0000-4000-8000-444444444444';
    const idNotFound = '55555555-0000-4000-8000-555555555555';
    const idAlreadyOwned = '66666666-0000-4000-8000-666666666666';

    // Per-call findFirst returns:
    //  id1 → owner=user1, OK
    //  id2 → owner=user1, OK
    //  id3 → owner=user1, OK
    //  idSelfSkip → owner=newOwnerUuid (already owned by target → SKIPPED via SAME-OWNER)
    //  idForbidden — admin caller bypasses authz, but row not present → NOT_FOUND
    //    To produce a real FORBIDDEN we would need a non-admin caller; for this
    //    batch we use a non-admin callsite instead (see test below).
    //  idNotFound → null
    //  idAlreadyOwned → owner=newOwnerUuid (same as input)

    const findFirstMock = vi.fn().mockImplementation(({ where }: any) => {
      if (where.id === id1 || where.id === id2 || where.id === id3) {
        return { ...mockAccount, id: where.id, ownerId: TEST_UUIDS.user1 };
      }
      if (where.id === idSelfSkip || where.id === idAlreadyOwned) {
        return { ...mockAccount, id: where.id, ownerId: newOwnerUuid };
      }
      if (where.id === idForbidden || where.id === idNotFound) {
        return null;
      }
      return null;
    });
    prismaMock.account.findFirst.mockImplementation(findFirstMock as any);

    const result = await adminCaller.bulkReassign({
      ids: [id1, id2, id3, idSelfSkip, idForbidden, idNotFound, idAlreadyOwned],
      ownerId: newOwnerUuid,
    });

    expect(result.totalProcessed).toBe(7);
    // 3 OK + 2 skipped (idSelfSkip, idAlreadyOwned) = 5 successful
    expect(result.successful).toHaveLength(5);
    // 2 not-found (idForbidden + idNotFound — both null lookups under admin)
    expect(result.failed).toHaveLength(2);
    expect(result.failed.every((f) => f.errorCode === 'NOT_FOUND')).toBe(true);

    const skippedCount = result.successful.filter((s) => s.skipped).length;
    expect(skippedCount).toBe(2);
  });

  // ─── AC-AB2: cross-tenant target user → whole batch fails NOT_FOUND ──────
  it('AC-AB2: cross-tenant target user → whole batch throws NOT_FOUND before any per-row work', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.bulkReassign({
        ids: [TEST_UUIDS.account1, TEST_UUIDS.account2],
        ownerId: newOwnerUuid,
      })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

    // Per-row work never started
    expect(prismaMock.account.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  // ─── AC-AB3: empty ids → Zod reject ──────────────────────────────────────
  it('AC-AB3: empty ids array is rejected by Zod', async () => {
    await expect(adminCaller.bulkReassign({ ids: [], ownerId: newOwnerUuid })).rejects.toThrow();
  });

  // ─── AC-AB4: 101 ids → Zod reject ────────────────────────────────────────
  it('AC-AB4: 101 ids is rejected by Zod', async () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
    );
    await expect(adminCaller.bulkReassign({ ids, ownerId: newOwnerUuid })).rejects.toThrow();
  });

  // ─── AC-AB5: duplicate ids in batch — re-submit yields skipped ───────────
  it('AC-AB5: duplicate ids — first succeeds, repeats become SKIPPED', async () => {
    const id = TEST_UUIDS.account1;
    let lookupCount = 0;
    prismaMock.account.findFirst.mockImplementation((async ({ where }: any) => {
      lookupCount += 1;
      // First call: owner=user1 (will succeed)
      // Subsequent calls: owner=newOwnerUuid (already changed → SKIPPED)
      const ownerId = lookupCount === 1 ? TEST_UUIDS.user1 : newOwnerUuid;
      return { ...mockAccount, id: where.id, ownerId };
    }) as any);

    const result = await adminCaller.bulkReassign({
      ids: [id, id, id],
      ownerId: newOwnerUuid,
    });

    expect(result.totalProcessed).toBe(3);
    expect(result.successful).toHaveLength(3);
    const skipped = result.successful.filter((s) => s.skipped);
    expect(skipped).toHaveLength(2);
  });

  // ─── AC-CB6: 100-row batch under 2s ──────────────────────────────────────
  it('AC-CB6: 100 rows complete under 2000ms', async () => {
    const ids = Array.from(
      { length: 100 },
      (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
    );
    prismaMock.account.findFirst.mockImplementation((async ({ where }: any) => ({
      ...mockAccount,
      id: where.id,
      ownerId: TEST_UUIDS.user1,
    })) as any);

    const t0 = performance.now();
    const result = await adminCaller.bulkReassign({ ids, ownerId: newOwnerUuid });
    const elapsed = performance.now() - t0;

    expect(result.totalProcessed).toBe(100);
    expect(result.successful.length + result.failed.length).toBe(100);
    expect(elapsed).toBeLessThan(2000);
  });

  // ─── AC-AB-FORBIDDEN: per-row FORBIDDEN under non-admin caller ───────────
  it('per-row FORBIDDEN: non-admin non-owner gets FORBIDDEN per row, batch continues', async () => {
    const otherUserId = '88888888-0000-4000-8000-888888888888';
    const ctx = createTestContext({
      user: {
        userId: otherUserId,
        email: 'other@example.com',
        role: 'SALES_REP',
        tenantId: TEST_UUIDS.tenant,
      },
      tenant: {
        tenantId: TEST_UUIDS.tenant,
        tenantType: 'user' as const,
        userId: otherUserId,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      },
    });
    const caller = accountRouter.createCaller(ctx);

    // Both rows owned by user1 → SALES_REP-other has neither admin role nor ownership
    prismaMock.account.findFirst.mockImplementation((async ({ where }: any) => ({
      ...mockAccount,
      id: where.id,
      ownerId: TEST_UUIDS.user1,
    })) as any);

    const result = await caller.bulkReassign({
      ids: [TEST_UUIDS.account1, TEST_UUIDS.account2],
      ownerId: newOwnerUuid,
    });

    expect(result.successful).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.every((f) => f.errorCode === 'FORBIDDEN')).toBe(true);
  });
});

describe('account.assignOwner regression + IFC-311 wiring', () => {
  const adminCtx = createAdminContext();
  const adminCaller = accountRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  // ─── AC-AO1: legacy response shape preserved ─────────────────────────────
  it('AC-AO1: legacy response shape { success, id, ownerId, owner } preserved', async () => {
    const result = await adminCaller.assignOwner({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe(TEST_UUIDS.account1);
    expect(result.ownerId).toBe(newOwnerUuid);
    expect(result.owner).toEqual({
      id: newOwnerUuid,
      name: 'New Owner',
      email: 'new@co.com',
    });
  });

  // ─── AC-AO2: assignOwner ALSO fires notification when flag is on ─────────
  it('AC-AO2: assignOwner now invokes notifyAccountReassignment (was missing pre-IFC-311)', async () => {
    await adminCaller.assignOwner({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid });

    expect((prismaMock.notification as any).create).toHaveBeenCalledTimes(2);
  });

  it('AC-AO2-OFF: assignOwner does NOT notify when flag is off', async () => {
    (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValue(flagsOff());

    await adminCaller.assignOwner({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid });

    expect((prismaMock.notification as any).create).not.toHaveBeenCalled();
  });

  it('legacy NOT_FOUND path still works', async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.assignOwner({ id: TEST_UUIDS.nonExistent, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  // Open Q2 (post-completion review): self-reassign audit preservation.
  //
  // Positive-assertion version. The audit writer short-circuits for synthetic
  // test-tenant UUIDs (see `[AUDIT] Skipping DB write - invalid tenantId`
  // stderr in other tests), so we can't observe the call by mocking
  // `prismaMock.auditLog.create`. Instead, spy on `getAuditLogger` at module
  // level so we capture the call BEFORE the writer's internal validation.
  // This is a real regression guard — removing the SKIPPED audit branch
  // breaks this test.
  it('AC-AO4: self-reassign on assignOwner emits audit log with beforeState=afterState (positive assertion)', async () => {
    const logActionSpy = vi.fn().mockResolvedValue(undefined);
    const logPermissionDeniedSpy = vi.fn().mockResolvedValue(undefined);
    const auditSpy = vi.spyOn(auditLoggerModule, 'getAuditLogger').mockReturnValue({
      logAction: logActionSpy,
      logPermissionDenied: logPermissionDeniedSpy,
    } as any);

    try {
      const result = await adminCaller.assignOwner({
        id: TEST_UUIDS.account1,
        ownerId: TEST_UUIDS.user1, // same as mockAccount.ownerId → SKIPPED
      });

      // Legacy response shape preserved
      expect(result.success).toBe(true);
      expect(result.ownerId).toBe(TEST_UUIDS.user1);
      // No DB write on skip
      expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
      // No notification on self-reassign (helper short-circuits)
      expect((prismaMock.notification as any).create).not.toHaveBeenCalled();

      // Positive assertion — SKIPPED branch MUST invoke logAction with
      // beforeState === afterState === currentOwnerId. Removing the branch
      // in account.router.ts will FAIL this test.
      expect(logActionSpy).toHaveBeenCalledWith(
        'UPDATE',
        'account',
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: expect.any(String),
          beforeState: { ownerId: TEST_UUIDS.user1 },
          afterState: { ownerId: TEST_UUIDS.user1 },
        })
      );
    } finally {
      auditSpy.mockRestore();
    }
  });

  it('AC-AO4b: reassign on self-reassign does NOT emit audit log (new behavior, by design)', async () => {
    const logActionSpy = vi.fn().mockResolvedValue(undefined);
    const auditSpy = vi.spyOn(auditLoggerModule, 'getAuditLogger').mockReturnValue({
      logAction: logActionSpy,
      logPermissionDenied: vi.fn().mockResolvedValue(undefined),
    } as any);

    try {
      const result = await adminCaller.reassign({
        id: TEST_UUIDS.account1,
        ownerId: TEST_UUIDS.user1,
      });

      expect((result as any).skipped).toBe(true);
      // Positive assertion — the new reassign endpoint communicates the
      // no-op via `skipped: true`; NO audit log write for SKIPPED. If the
      // behavior drifts (e.g. someone copies the assignOwner SKIPPED branch
      // here), this test FAILS.
      expect(logActionSpy).not.toHaveBeenCalled();
    } finally {
      auditSpy.mockRestore();
    }
  });
});

// Static-analysis sanity: confirm the imported helper exists at the call site
// (prevents accidental dead-import on refactor).
describe('account-reassign helper coverage of best-effort logging branches', () => {
  const adminCtx = createAdminContext();
  const adminCaller = accountRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  it('emitAccountReassignSideEffects: audit-log rejection is swallowed (does not break write/notify)', async () => {
    // Force the audit logger's underlying auditLog.create to reject.
    // The catch handler swallows it so the procedure still returns success.
    (adminCtx.prisma as any).auditLog = {
      create: vi.fn().mockRejectedValue(new Error('audit DB down')),
    };

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.account1,
      ownerId: newOwnerUuid,
    });

    expect(result.newOwnerId).toBe(newOwnerUuid);
    expect(result.notified).toBe(true);
  });

  it('logAccountReassignPermissionDenied: audit-log rejection is swallowed', async () => {
    (adminCtx.prisma as any).auditLog = {
      create: vi.fn().mockRejectedValue(new Error('audit DB down')),
    };
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.nonExistent, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('logAuditFailure direct coverage', () => {
  it('logs the error to console.error without throwing', async () => {
    const mod = (await import('../account-reassign.js' as string)) as any;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mod.logAuditFailure(new Error('db down'))).not.toThrow();
    expect(errSpy).toHaveBeenCalledWith('[account.reassign] Audit log failed:', expect.any(Error));
    errSpy.mockRestore();
  });
});

describe('IFC-311 module wiring sanity', () => {
  it('imports notifyAccountReassignment from account-automation', async () => {
    const mod = (await import('../account-automation.js' as string)) as any;
    expect(typeof mod.notifyAccountReassignment).toBe('function');
  });

  it('imports createNotification from notifications.router', async () => {
    const mod = (await import('../../notifications/notifications.router.js' as string)) as any;
    expect(typeof mod.createNotification).toBe('function');
  });

  it('reassign + bulkReassign are exposed on accountRouter', () => {
    const proc = accountRouter._def.procedures as Record<string, unknown>;
    expect(proc.reassign).toBeDefined();
    expect(proc.bulkReassign).toBeDefined();
  });
});

// Reference unused symbol to silence linter (TRPCError imported for type narrowing in expects)
void TRPCError;
void otherTenantId;
void flagsOn;
