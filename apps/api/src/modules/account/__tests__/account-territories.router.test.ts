/**
 * Account Territories Router Tests - PG-197
 *
 * Callback-form $transaction mocked with mockImplementationOnce(fn => fn(txMock))
 * (playbook §12, account-settings.router.test.ts pattern).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { accountTerritoriesRouter } from '../account-territories.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const T1 = generateTestUUID('territory-1');
const T2 = generateTestUUID('territory-2');
const FOREIGN = generateTestUUID('territory-foreign');
const U1 = generateTestUUID('member-1');
const U2 = generateTestUUID('member-2');

const created = new Date('2026-01-01T00:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: T1,
    tenantId,
    name: 'London',
    description: null,
    colorToken: 'blue',
    priority: 2,
    strategy: 'ROUND_ROBIN',
    isDefault: false,
    isActive: true,
    rrCursor: 0,
    createdAt: created,
    updatedAt: created,
    rules: [{ id: 'r1', country: 'GB', region: 'London', postalPrefix: null, sortOrder: 0 }],
    members: [
      {
        userId: U1,
        sortOrder: 0,
        user: { id: U1, name: null, email: 'a@example.invalid', avatarUrl: null },
      },
    ],
    ...overrides,
  };
}

const input = {
  name: 'London',
  colorToken: 'blue' as const,
  strategy: 'ROUND_ROBIN' as const,
  isActive: true,
  rules: [{ country: 'GB', region: 'London' }],
  memberIds: [U1],
};

function txMock() {
  return {
    accountTerritory: {
      create: vi.fn().mockResolvedValue({ id: T1 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(row()),
    },
    accountTerritoryRule: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    accountTerritoryMember: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function useTx() {
  const tx = txMock();
  (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(tx));
  return tx;
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('accountTerritoriesRouter', () => {
  let admin: ReturnType<typeof accountTerritoriesRouter.createCaller>;
  let user: ReturnType<typeof accountTerritoriesRouter.createCaller>;

  beforeEach(() => {
    admin = accountTerritoriesRouter.createCaller(createAdminContext());
    user = accountTerritoriesRouter.createCaller(createTestContext());
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = accountTerritoriesRouter.createCaller(createPublicContext());
    await expect(anon.list()).rejects.toBeInstanceOf(TRPCError);
  });

  describe('list', () => {
    it('returns territories in evaluation order with the flag and limits', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([row()]);
      (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValueOnce({
        autoAssignOwner: true,
      });

      const result = await user.list();

      expect(prismaMock.accountTerritory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        })
      );
      expect(result.autoAssignOwner).toBe(true);
      expect(result.limits.maxTerritoriesPerTenant).toBe(100);
      expect(result.territories[0]).toMatchObject({
        id: T1,
        strategy: 'ROUND_ROBIN',
        rules: [{ id: 'r1', country: 'GB', region: 'London', postalPrefix: null }],
        members: [{ userId: U1, name: 'a@example.invalid', avatar: null }],
      });
    });

    it('treats an unknown stored strategy as MANUAL', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([
        row({ strategy: 'LEGACY', members: [] }),
      ]);
      const result = await user.list();
      expect(result.territories[0].strategy).toBe('MANUAL');
    });
  });

  describe('create', () => {
    beforeEach(() => {
      (prismaMock.accountTerritory.count as any).mockResolvedValue(0);
      (prismaMock.user.findMany as any).mockResolvedValue([{ id: U1 }]);
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValue({ priority: -3 });
    });

    it('creates the territory, rules and members in one transaction, evaluated last', async () => {
      const tx = useTx();
      const result = await admin.create(input);

      expect(prismaMock.accountTerritory.count).toHaveBeenCalledWith({ where: { tenantId } });
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: [U1] } }) })
      );
      expect(tx.accountTerritory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId, name: 'London', priority: -4 }),
        })
      );
      expect(tx.accountTerritoryRule.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenantId,
            territoryId: T1,
            country: 'GB',
            region: 'London',
            postalPrefix: null,
            sortOrder: 0,
          },
        ],
      });
      expect(tx.accountTerritoryMember.createMany).toHaveBeenCalledWith({
        data: [{ tenantId, territoryId: T1, userId: U1, sortOrder: 0 }],
      });
      expect(result.id).toBe(T1);
    });

    it('starts at priority 0 for the first territory and skips empty member writes', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(null);
      const tx = useTx();
      await admin.create({ ...input, memberIds: [] });
      expect(tx.accountTerritory.create.mock.calls[0][0].data.priority).toBe(0);
      expect(tx.accountTerritoryMember.createMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('is FORBIDDEN for a non-admin, with no write', async () => {
      await expectCode(user.create(input), 'FORBIDDEN');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('needs at least one rule (BR-4)', async () => {
      await expectCode(admin.create({ ...input, rules: [] }), 'BAD_REQUEST');
    });

    it('rejects a member who is not a tenant user (BR-12)', async () => {
      (prismaMock.user.findMany as any).mockResolvedValueOnce([]);
      await expectCode(admin.create(input), 'BAD_REQUEST');
    });

    it('rejects the 101st territory (BR-20)', async () => {
      (prismaMock.accountTerritory.count as any).mockResolvedValueOnce(100);
      await expectCode(admin.create(input), 'BAD_REQUEST');
    });

    it('maps P2002 to CONFLICT', async () => {
      (prismaMock.$transaction as any).mockRejectedValueOnce({ code: 'P2002' });
      await expectCode(admin.create(input), 'CONFLICT');
    });

    it('rethrows other errors', async () => {
      (prismaMock.$transaction as any).mockRejectedValueOnce(new Error('boom'));
      await expect(admin.create(input)).rejects.toThrow('boom');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      (prismaMock.user.findMany as any).mockResolvedValue([{ id: U1 }]);
    });

    it('is NOT_FOUND with zero writes for a foreign territory', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ ...input, id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.accountTerritory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FOREIGN, tenantId } })
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('replaces rules and members with the same tx', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(row());
      const tx = useTx();
      await admin.update({ ...input, id: T1, strategy: 'LOAD_BALANCE' });

      expect(tx.accountTerritory.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId, id: T1 } },
        data: expect.objectContaining({ strategy: 'LOAD_BALANCE' }),
      });
      expect(tx.accountTerritoryRule.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, territoryId: T1 },
      });
      expect(tx.accountTerritoryMember.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, territoryId: T1 },
      });
      expect(tx.accountTerritoryRule.createMany).toHaveBeenCalled();
      expect(tx.accountTerritoryMember.createMany).toHaveBeenCalled();
    });

    it('lets the default territory have zero rules', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(
        row({ isDefault: true })
      );
      const tx = useTx();
      await admin.update({ ...input, id: T1, rules: [] });
      expect(tx.accountTerritoryRule.createMany).not.toHaveBeenCalled();
    });

    it('needs a rule on a non-default territory', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(row());
      await expectCode(admin.update({ ...input, id: T1, rules: [] }), 'BAD_REQUEST');
    });

    it('refuses to deactivate the default (BR-7)', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(
        row({ isDefault: true })
      );
      await expectCode(admin.update({ ...input, id: T1, isActive: false }), 'PRECONDITION_FAILED');
    });

    it('maps P2002 to CONFLICT', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.$transaction as any).mockRejectedValueOnce({ code: 'P2002' });
      await expectCode(admin.update({ ...input, id: T1 }), 'CONFLICT');
    });

    it('is FORBIDDEN for a non-admin', async () => {
      await expectCode(user.update({ ...input, id: T1 }), 'FORBIDDEN');
    });
  });

  describe('delete', () => {
    it('deletes a tenant-scoped territory', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.accountTerritory.deleteMany as any).mockResolvedValueOnce({ count: 1 });
      await expect(admin.delete({ id: T1 })).resolves.toEqual({ success: true });
      expect(prismaMock.accountTerritory.deleteMany).toHaveBeenCalledWith({
        where: { id: T1, tenantId },
      });
    });

    it('is NOT_FOUND for a foreign id', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.delete({ id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.accountTerritory.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses to delete the default', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(
        row({ isDefault: true })
      );
      await expectCode(admin.delete({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('is FORBIDDEN for a non-admin', async () => {
      await expectCode(user.delete({ id: T1 }), 'FORBIDDEN');
    });
  });

  describe('reorder', () => {
    beforeEach(() => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValue([{ id: T1 }, { id: T2 }]);
    });

    it('writes priorities descending in one tx', async () => {
      const tx = useTx();
      await admin.reorder({ ids: [T2, T1] });
      expect(tx.accountTerritory.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: T2, tenantId },
        data: { priority: 2 },
      });
      expect(tx.accountTerritory.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: T1, tenantId },
        data: { priority: 1 },
      });
    });

    it('is BAD_REQUEST when not the full set', async () => {
      await expectCode(admin.reorder({ ids: [T1] }), 'BAD_REQUEST');
      await expectCode(admin.reorder({ ids: [T1, T1] }), 'BAD_REQUEST');
    });

    it('is NOT_FOUND for a foreign id', async () => {
      await expectCode(admin.reorder({ ids: [T1, FOREIGN] }), 'NOT_FOUND');
    });

    it('is FORBIDDEN for a non-admin', async () => {
      await expectCode(user.reorder({ ids: [T1, T2] }), 'FORBIDDEN');
    });
  });

  describe('setDefault', () => {
    it('clears then sets inside one tx', async () => {
      (prismaMock.accountTerritory.findFirst as any)
        .mockResolvedValueOnce(row({ id: T2 }))
        .mockResolvedValueOnce({ id: T1, name: 'Old', _count: { rules: 1 } });
      const tx = useTx();
      await admin.setDefault({ id: T2 });
      expect(tx.accountTerritory.updateMany).toHaveBeenNthCalledWith(1, {
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.accountTerritory.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: T2, tenantId },
        data: { isDefault: true },
      });
    });

    it('clears the default with id null', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(null);
      const tx = useTx();
      await admin.setDefault({ id: null });
      expect(tx.accountTerritory.updateMany).toHaveBeenCalledTimes(1);
    });

    it('is NOT_FOUND for a foreign id', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.setDefault({ id: FOREIGN }), 'NOT_FOUND');
    });

    it('refuses an inactive territory', async () => {
      (prismaMock.accountTerritory.findFirst as any).mockResolvedValueOnce(
        row({ isActive: false })
      );
      await expectCode(admin.setDefault({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('refuses to leave a rule-less default as a non-default', async () => {
      (prismaMock.accountTerritory.findFirst as any)
        .mockResolvedValueOnce(row({ id: T2 }))
        .mockResolvedValueOnce({ id: T1, name: 'Fallback', _count: { rules: 0 } });
      await expect(admin.setDefault({ id: T2 })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringContaining('Add a rule to Fallback first'),
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('allows re-selecting the current rule-less default', async () => {
      (prismaMock.accountTerritory.findFirst as any)
        .mockResolvedValueOnce(row({ isDefault: true }))
        .mockResolvedValueOnce({ id: T1, name: 'Fallback', _count: { rules: 0 } });
      useTx();
      await expect(admin.setDefault({ id: T1 })).resolves.toEqual({ success: true });
    });

    it('is FORBIDDEN for a non-admin', async () => {
      await expectCode(user.setDefault({ id: null }), 'FORBIDDEN');
    });
  });

  describe('preview', () => {
    it('returns the matching territory and never moves the cursor', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([
        { ...row(), rules: [{ country: 'GB', region: null, postalPrefix: 'SW1A' }] },
      ]);
      const result = await user.preview({ country: 'gb', postalCode: 'sw1a 1aa' });
      expect(prismaMock.accountTerritory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, isActive: true } })
      );
      expect(result).toEqual({
        territoryId: T1,
        territoryName: 'London',
        strategy: 'ROUND_ROBIN',
        matchedBy: 'rule',
      });
      expect(prismaMock.accountTerritory.update).not.toHaveBeenCalled();
    });

    it('reports the default and none', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([
        { ...row(), isDefault: true, rules: [] },
      ]);
      expect((await user.preview({})).matchedBy).toBe('default');
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([]);
      expect(await user.preview({ country: 'US' })).toEqual({
        territoryId: null,
        territoryName: null,
        strategy: null,
        matchedBy: 'none',
      });
    });
  });

  describe('resetToDefaults', () => {
    it('deletes every territory of the tenant in one tx and nothing else', async () => {
      const tx = useTx();
      await expect(admin.resetToDefaults()).resolves.toEqual({ success: true });
      expect(tx.accountTerritory.deleteMany).toHaveBeenCalledWith({ where: { tenantId } });
      expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.accountAutomationSetting.update).not.toHaveBeenCalled();
      expect(prismaMock.accountAutomationSetting.upsert).not.toHaveBeenCalled();
    });

    it('is FORBIDDEN for a non-admin', async () => {
      await expectCode(user.resetToDefaults(), 'FORBIDDEN');
    });
  });
});
