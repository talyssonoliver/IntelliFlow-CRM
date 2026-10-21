import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const logAction = vi.fn();
const logPermissionDenied = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied }),
}));

import { emailSettingsRouter } from '../email-settings.router';

const tenantId = TEST_UUIDS.tenant;
const SUP = generateTestUUID('suppression-1');
const FOREIGN = generateTestUUID('suppression-foreign');
const created = new Date(Date.UTC(2026, 9, 20));

beforeEach(() => {
  vi.clearAllMocks();
  logAction.mockResolvedValue('a');
  logPermissionDenied.mockResolvedValue('b');
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
});

const caller = (ctx = createTestContext()) => emailSettingsRouter.createCaller(ctx as never);

describe('emailSettings.get', () => {
  it('returns defaults with canEdit=false for a member', async () => {
    await expect(caller().get()).resolves.toEqual({
      allowTenantMailboxFallback: false,
      replyToAddress: null,
      trackOpens: false,
      trackClicks: false,
      hardBounceAction: 'SUPPRESS',
      softBounceThreshold: 3,
      notifySenderOnBounce: false,
      canEdit: false,
      companyMailboxAvailable: false,
      companyMailboxAddress: null,
    });
    expect(prismaMock.tenantEmailSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId } });
  });

  it('shows the company mailbox address to members only when fallback is on', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue({
      fromAddress: 'team@example.invalid',
    });
    expect((await caller().get()).companyMailboxAddress).toBeNull();
    expect((await caller().get()).companyMailboxAvailable).toBe(true);
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue({
      allowTenantMailboxFallback: true,
    });
    expect((await caller().get()).companyMailboxAddress).toBe('team@example.invalid');
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
    expect(await caller(createAdminContext()).get()).toMatchObject({
      canEdit: true,
      companyMailboxAddress: 'team@example.invalid',
    });
    expect(prismaMock.emailMailbox.findFirst).toHaveBeenCalledWith({
      where: { tenantId, scope: 'TENANT', status: 'ACTIVE' },
      select: { fromAddress: true },
    });
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(caller(createPublicContext()).get()).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('emailSettings.update', () => {
  it('upserts only the given fields for an admin and audits field names', async () => {
    (prismaMock.tenantEmailSettings.upsert as any).mockResolvedValue({
      allowTenantMailboxFallback: true,
      softBounceThreshold: 5,
    });
    const result = await caller(createAdminContext()).update({
      allowTenantMailboxFallback: true,
      softBounceThreshold: 5,
    });
    expect(prismaMock.tenantEmailSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId },
      create: { tenantId, allowTenantMailboxFallback: true, softBounceThreshold: 5 },
      update: { allowTenantMailboxFallback: true, softBounceThreshold: 5 },
    });
    expect(result).toMatchObject({
      allowTenantMailboxFallback: true,
      softBounceThreshold: 5,
      canEdit: true,
    });
    expect(logAction).toHaveBeenCalledWith('UPDATE', 'email_settings', tenantId, tenantId, {
      actorId: TEST_UUIDS.admin1,
      afterState: { changedFields: ['allowTenantMailboxFallback', 'softBounceThreshold'] },
    });
  });

  it('lets a manager update', async () => {
    (prismaMock.tenantEmailSettings.upsert as any).mockResolvedValue({});
    await expect(
      caller(createManagerContext()).update({ trackOpens: true })
    ).resolves.toBeDefined();
  });

  it('forbids a member and audits the denial (nothing written)', async () => {
    await expect(caller().update({ trackOpens: true })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prismaMock.tenantEmailSettings.upsert).not.toHaveBeenCalled();
    expect(logPermissionDenied).toHaveBeenCalled();
  });

  it('rejects a smuggled tenantId (strict input)', async () => {
    await expect(
      caller(createAdminContext()).update({ trackOpens: true, tenantId: 'other' } as never)
    ).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('emailSettings.resetToDefaults', () => {
  it('restores tenant settings only, inside a transaction', async () => {
    (prismaMock.tenantEmailSettings.upsert as any).mockResolvedValue({});
    await caller(createAdminContext()).resetToDefaults();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const defaults = {
      allowTenantMailboxFallback: false,
      replyToAddress: null,
      trackOpens: false,
      trackClicks: false,
      hardBounceAction: 'SUPPRESS',
      softBounceThreshold: 3,
      notifySenderOnBounce: false,
    };
    expect(prismaMock.tenantEmailSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId },
      create: { tenantId, ...defaults },
      update: defaults,
    });
    expect(prismaMock.emailMailbox.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.emailSignature.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.emailSuppression.deleteMany).not.toHaveBeenCalled();
  });

  it('forbids a member', async () => {
    await expect(caller().resetToDefaults()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('emailSettings.suppression', () => {
  it('lists suppressions for admins, newest first, tenant-scoped', async () => {
    (prismaMock.emailSuppression.findMany as any).mockResolvedValue([
      {
        id: SUP,
        email: 'gone@example.invalid',
        reason: 'HARD_BOUNCE',
        source: 'DSN',
        createdAt: created,
      },
    ]);
    await expect(caller(createAdminContext()).suppression.list()).resolves.toEqual({
      items: [
        {
          id: SUP,
          email: 'gone@example.invalid',
          reason: 'HARD_BOUNCE',
          source: 'DSN',
          createdAt: created.toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(prismaMock.emailSuppression.findMany).toHaveBeenCalledWith({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      select: { id: true, email: true, reason: true, source: true, createdAt: true },
    });
  });

  it('pages with a cursor', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: generateTestUUID(`s-${i}`),
      email: `g${i}@example.invalid`,
      reason: 'MANUAL',
      source: 'MANUAL',
      createdAt: created,
    }));
    (prismaMock.emailSuppression.findMany as any).mockResolvedValue(rows);
    const page = await caller(createAdminContext()).suppression.list({ limit: 2, cursor: SUP });
    expect(page.items).toHaveLength(2);
    // The cursor is the last row shown: the next page (cursor + skip 1) starts at rows[2].
    expect(page.nextCursor).toBe(rows[1]!.id);
    expect((prismaMock.emailSuppression.findMany as any).mock.calls[0][0]).toMatchObject({
      take: 3,
      cursor: { id: SUP },
      skip: 1,
    });
  });

  it('keeps the suppression list (PII) from members', async () => {
    await expect(caller().suppression.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('adds a manual suppression and maps a duplicate to CONFLICT', async () => {
    (prismaMock.emailSuppression.create as any).mockResolvedValueOnce({
      id: SUP,
      email: 'x@example.invalid',
      reason: 'MANUAL',
      source: 'MANUAL',
      createdAt: created,
    });
    await caller(createAdminContext()).suppression.add({ email: 'X@Example.invalid' });
    expect(prismaMock.emailSuppression.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        email: 'x@example.invalid',
        reason: 'MANUAL',
        source: 'MANUAL',
        createdById: TEST_UUIDS.admin1,
      },
    });
    expect(JSON.stringify(logAction.mock.calls)).not.toContain('x@example.invalid');
    (prismaMock.emailSuppression.create as any).mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' })
    );
    await expect(
      caller(createAdminContext()).suppression.add({ email: 'x@example.invalid' })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('rethrows unexpected errors on add', async () => {
    (prismaMock.emailSuppression.create as any).mockRejectedValueOnce(new Error('db down'));
    await expect(
      caller(createAdminContext()).suppression.add({ email: 'x@example.invalid' })
    ).rejects.toThrow();
  });

  it('removes a suppression in a transaction and stops old receipts from counting again', async () => {
    (prismaMock.emailSuppression.findFirst as any).mockResolvedValue({
      id: SUP,
      email: 'gone@example.invalid',
    });
    await caller(createAdminContext()).suppression.remove({ id: SUP });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailSuppression.findFirst).toHaveBeenCalledWith({
      where: { id: SUP, tenantId },
      select: { id: true, email: true },
    });
    expect(prismaMock.emailSuppression.delete).toHaveBeenCalledWith({ where: { id: SUP } });
    expect(prismaMock.emailBounceReceipt.updateMany).toHaveBeenCalledWith({
      where: { tenantId, recipient: 'gone@example.invalid', excludedFromCount: false },
      data: { excludedFromCount: true },
    });
    expect(JSON.stringify(logAction.mock.calls)).not.toContain('gone@example.invalid');
  });

  it('cross-tenant: a foreign id is NOT_FOUND and nothing is deleted', async () => {
    (prismaMock.emailSuppression.findFirst as any).mockResolvedValue(null);
    await expect(
      caller(createAdminContext()).suppression.remove({ id: FOREIGN })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailSuppression.delete).not.toHaveBeenCalled();
  });

  it('forbids members from adding or removing', async () => {
    await expect(caller().suppression.add({ email: 'x@example.invalid' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(caller().suppression.remove({ id: SUP })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
