/**
 * Contact Reassign Procedures — IFC-311
 *
 * Mirrors account.reassign.test.ts:
 *  - contact.reassign (single)        — AC-C1..C9
 *  - contact.bulkReassign (batch)     — AC-CB1..CB6
 *
 * Mock pattern matches contact.router.test.ts conventions.
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { contactRouter } from '../contact.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  mockContact,
} from '../../../test/setup';

const newOwnerUuid = TEST_UUIDS.user2;

function flagsOn() {
  return {
    autoMergeOnExactEmail: false,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    normalizePhoneNumbers: true,
    autoCapitalizeNames: true,
    preventDeleteWithOpenDeals: true,
    notifyOnOwnerChange: true,
    aiDuplicateDetection: false,
    aiEnrichment: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    aiAutoReplyDrafting: false,
  };
}

function flagsOff() {
  return { ...flagsOn(), notifyOnOwnerChange: false };
}

function commonBeforeEach() {
  (prismaMock as any).$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prismaMock));

  (prismaMock.contactAutomationSetting.findUnique as any).mockResolvedValue(flagsOn());
  (prismaMock.contactRequiredField.findMany as any).mockResolvedValue([]);

  prismaMock.contact.findFirst.mockResolvedValue({
    ...mockContact,
  } as any);
  prismaMock.user.findFirst.mockResolvedValue({
    id: newOwnerUuid,
    name: 'New Owner',
    email: 'new@co.com',
    tenantId: TEST_UUIDS.tenant,
  } as any);
  prismaMock.contact.updateMany.mockResolvedValue({ count: 1 } as any);

  (prismaMock.notification as any).create = vi.fn().mockResolvedValue({
    id: 'notif-id',
    createdAt: new Date(),
    metadata: {},
  });
}

describe('contact.reassign (IFC-311)', () => {
  const adminCtx = createAdminContext();
  const adminCaller = contactRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  it('AC-C1: writes ownerId and notifies both parties when flag is true', async () => {
    const result = await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });

    expect(result.previousOwnerId).toBe(TEST_UUIDS.user1);
    expect(result.newOwnerId).toBe(newOwnerUuid);
    expect(result.notified).toBe(true);

    expect(prismaMock.contact.updateMany).toHaveBeenCalledWith({
      where: { id: TEST_UUIDS.contact1, tenantId: TEST_UUIDS.tenant },
      data: { ownerId: newOwnerUuid },
    });

    expect((prismaMock.notification as any).create).toHaveBeenCalledTimes(2);
    const calls = ((prismaMock.notification as any).create as any).mock.calls;
    const recipients = calls.map((c: any[]) => c[0].data.recipientId);
    expect(recipients).toContain(TEST_UUIDS.user1);
    expect(recipients).toContain(newOwnerUuid);
  });

  it('AC-C2: writes ownerId but does NOT notify when flag is false', async () => {
    (prismaMock.contactAutomationSetting.findUnique as any).mockResolvedValue(flagsOff());

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });

    expect(result.notified).toBe(false);
    expect(prismaMock.contact.updateMany).toHaveBeenCalled();
    expect((prismaMock.notification as any).create).not.toHaveBeenCalled();
  });

  it('AC-C3: self-reassign returns skipped, no write, no notify', async () => {
    const result = await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: TEST_UUIDS.user1,
    });

    expect((result as any).skipped).toBe(true);
    expect(result.notified).toBe(false);
    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
    expect((prismaMock.notification as any).create).not.toHaveBeenCalled();
  });

  it('AC-C4: cross-tenant entity throws NOT_FOUND', async () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.nonExistent, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('AC-C5: cross-tenant target user throws NOT_FOUND, no write', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.contact1, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
  });

  it('AC-C6: SALES_REP non-owner caller is FORBIDDEN', async () => {
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
    const caller = contactRouter.createCaller(ctx);

    await expect(
      caller.reassign({ id: TEST_UUIDS.contact1, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
  });

  it('AC-C7: SALES_REP caller who IS the current owner can reassign', async () => {
    const ctx = createTestContext({
      user: {
        userId: TEST_UUIDS.user1,
        email: 'owner@example.com',
        role: 'SALES_REP',
        tenantId: TEST_UUIDS.tenant,
      },
    });
    const caller = contactRouter.createCaller(ctx);

    const result = await caller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });

    expect(result.newOwnerId).toBe(newOwnerUuid);
  });

  it('AC-C8: TOCTOU updateMany count===0 raises NOT_FOUND', async () => {
    prismaMock.contact.updateMany.mockResolvedValue({ count: 0 } as any);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.contact1, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('AC-C9: notification helper failure does NOT roll back owner write', async () => {
    (prismaMock.notification as any).create = vi
      .fn()
      .mockRejectedValue(new Error('notification subsystem down'));

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });

    expect(prismaMock.contact.updateMany).toHaveBeenCalled();
    expect(result.notified).toBe(false);
    expect(result.newOwnerId).toBe(newOwnerUuid);
  });

  it('idempotent replay: 2nd call after owner already changed returns skipped', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({
      ...mockContact,
      ownerId: newOwnerUuid,
    } as any);

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });

    expect((result as any).skipped).toBe(true);
    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
  });

  it('contactName composes firstName + lastName for notification', async () => {
    await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });
    const calls = ((prismaMock.notification as any).create as any).mock.calls;
    // mockContact.firstName='Jane', lastName='Smith' → "Jane Smith"
    const subjects = calls.map((c: any[]) => c[0].data.subject);
    expect(subjects.some((s: string) => s.includes('Jane Smith'))).toBe(true);
  });
});

describe('contact.bulkReassign (IFC-311)', () => {
  const adminCtx = createAdminContext();
  const adminCaller = contactRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  it('AC-CB1: mixed batch (3 OK + 1 self-skip + 1 not-found + 1 already-owned)', async () => {
    const id1 = TEST_UUIDS.contact1;
    const id2 = TEST_UUIDS.contact2;
    const id3 = '22222222-0000-4000-8000-222222222222';
    const idAlreadyOwned = '33333333-0000-4000-8000-333333333333';
    const idNotFound = '44444444-0000-4000-8000-444444444444';
    const idSelfSkip = '55555555-0000-4000-8000-555555555555';

    prismaMock.contact.findFirst.mockImplementation((async ({ where }: any) => {
      if (where.id === id1 || where.id === id2 || where.id === id3) {
        return { ...mockContact, id: where.id, ownerId: TEST_UUIDS.user1 };
      }
      if (where.id === idAlreadyOwned || where.id === idSelfSkip) {
        return { ...mockContact, id: where.id, ownerId: newOwnerUuid };
      }
      if (where.id === idNotFound) return null;
      return null;
    }) as any);

    const result = await adminCaller.bulkReassign({
      ids: [id1, id2, id3, idAlreadyOwned, idNotFound, idSelfSkip],
      ownerId: newOwnerUuid,
    });

    expect(result.totalProcessed).toBe(6);
    // 3 OK + 2 skipped (idAlreadyOwned, idSelfSkip) = 5 successful
    expect(result.successful).toHaveLength(5);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].errorCode).toBe('NOT_FOUND');

    const skippedCount = result.successful.filter((s) => s.skipped).length;
    expect(skippedCount).toBe(2);
  });

  it('AC-CB2: cross-tenant target user → whole batch throws NOT_FOUND before per-row work', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.bulkReassign({
        ids: [TEST_UUIDS.contact1, TEST_UUIDS.contact2],
        ownerId: newOwnerUuid,
      })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

    expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
  });

  it('AC-CB3: empty ids array is rejected by Zod', async () => {
    await expect(adminCaller.bulkReassign({ ids: [], ownerId: newOwnerUuid })).rejects.toThrow();
  });

  it('AC-CB4: 101 ids is rejected by Zod', async () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
    );
    await expect(adminCaller.bulkReassign({ ids, ownerId: newOwnerUuid })).rejects.toThrow();
  });

  it('AC-CB5: duplicate ids — first succeeds, repeats become SKIPPED', async () => {
    const id = TEST_UUIDS.contact1;
    let lookupCount = 0;
    prismaMock.contact.findFirst.mockImplementation((async ({ where }: any) => {
      lookupCount += 1;
      const ownerId = lookupCount === 1 ? TEST_UUIDS.user1 : newOwnerUuid;
      return { ...mockContact, id: where.id, ownerId };
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

  it('AC-CB6: 100 rows complete under 2000ms', async () => {
    const ids = Array.from(
      { length: 100 },
      (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
    );
    prismaMock.contact.findFirst.mockImplementation((async ({ where }: any) => ({
      ...mockContact,
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
    const caller = contactRouter.createCaller(ctx);

    prismaMock.contact.findFirst.mockImplementation((async ({ where }: any) => ({
      ...mockContact,
      id: where.id,
      ownerId: TEST_UUIDS.user1,
    })) as any);

    const result = await caller.bulkReassign({
      ids: [TEST_UUIDS.contact1, TEST_UUIDS.contact2],
      ownerId: newOwnerUuid,
    });

    expect(result.successful).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.every((f) => f.errorCode === 'FORBIDDEN')).toBe(true);
  });
});

describe('contact-reassign helper coverage of best-effort logging branches', () => {
  const adminCtx = createAdminContext();
  const adminCaller = contactRouter.createCaller(adminCtx);

  beforeEach(() => {
    commonBeforeEach();
  });

  it('emitContactReassignSideEffects: audit-log rejection is swallowed', async () => {
    (adminCtx.prisma as any).auditLog = {
      create: vi.fn().mockRejectedValue(new Error('audit DB down')),
    };

    const result = await adminCaller.reassign({
      id: TEST_UUIDS.contact1,
      ownerId: newOwnerUuid,
    });

    expect(result.newOwnerId).toBe(newOwnerUuid);
    expect(result.notified).toBe(true);
  });

  it('logContactReassignPermissionDenied: audit-log rejection is swallowed', async () => {
    (adminCtx.prisma as any).auditLog = {
      create: vi.fn().mockRejectedValue(new Error('audit DB down')),
    };
    prismaMock.contact.findFirst.mockResolvedValue(null);

    await expect(
      adminCaller.reassign({ id: TEST_UUIDS.nonExistent, ownerId: newOwnerUuid })
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('logAuditFailure direct coverage', () => {
  it('logs the error to console.error without throwing', async () => {
    const mod = (await import('../contact-reassign.js' as string)) as any;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mod.logAuditFailure(new Error('db down'))).not.toThrow();
    expect(errSpy).toHaveBeenCalledWith('[contact.reassign] Audit log failed:', expect.any(Error));
    errSpy.mockRestore();
  });
});

describe('IFC-311 contact module wiring sanity', () => {
  it('imports notifyContactReassignment from contact-automation', async () => {
    const mod = (await import('../contact-automation.js' as string)) as any;
    expect(typeof mod.notifyContactReassignment).toBe('function');
  });

  it('reassign + bulkReassign are exposed on contactRouter', () => {
    const proc = contactRouter._def.procedures as Record<string, unknown>;
    expect(proc.reassign).toBeDefined();
    expect(proc.bulkReassign).toBeDefined();
  });

  it("source uses entity-string 'contact' (not 'account') in audit calls", async () => {
    const fs = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await fs.readFile(resolve(__dirname, '../contact-reassign.ts'), 'utf8');
    expect(src).toMatch(/\.logAction\('UPDATE',\s*'contact'/);
    expect(src).toMatch(/\.logPermissionDenied\('contact'/);
    expect(src).not.toMatch(/'account'/);
  });
});

void TRPCError;
