/**
 * PG-196 — accountTiers router: tenant tier configuration.
 *
 * Reads are open to tenant members; writes are ADMIN-only, replace the
 * tenant's rows inside one transaction (swap-safe), are guarded by an
 * optimistic updatedAt check, prune hierarchy rules that reference removed
 * tiers and are audit-logged.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const logAction = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction }),
}));

import { accountTiersRouter } from '../account-tiers.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const UPDATED_AT = new Date('2026-10-07T08:00:00.000Z');

const row = (key: string, label: string, minRevenue: number) => ({
  id: `row-${key}`,
  tenantId,
  key,
  label,
  minRevenue: { toNumber: () => minRevenue },
  colorToken: 'slate',
  benefits: [] as string[],
  sortOrder: 0,
});

const defaultsInput = () => ({
  tiers: [
    {
      key: 'ENTERPRISE',
      label: 'Enterprise',
      minRevenue: 10_000_000,
      colorToken: 'purple' as const,
      benefits: [] as string[],
    },
    {
      key: 'MID_MARKET',
      label: 'Mid-Market',
      minRevenue: 1_000_000,
      colorToken: 'blue' as const,
      benefits: [] as string[],
    },
    {
      key: 'SMB',
      label: 'SMB',
      minRevenue: 100_000,
      colorToken: 'green' as const,
      benefits: [] as string[],
    },
    {
      key: 'STARTUP',
      label: 'Startup',
      minRevenue: 0,
      colorToken: 'amber' as const,
      benefits: [] as string[],
    },
  ],
  defaultTierKey: null as string | null,
  notifyOwnerOnUpgrade: false,
  notifyOwnerOnDowngrade: false,
  expectedUpdatedAt: null as string | null,
});

const mocks = prismaMock as any;

describe('accountTiers router (PG-196)', () => {
  let order: string[];

  beforeEach(() => {
    order = [];
    logAction.mockReset().mockResolvedValue('audit-1');
    mocks.$extends = vi.fn().mockReturnValue(prismaMock);
    mocks.$executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    mocks.$transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
    mocks.accountTierDefinition.findMany.mockResolvedValue([]);
    mocks.accountTierConfig.findUnique.mockResolvedValue(null);
    mocks.accountHierarchyConfig.findUnique.mockResolvedValue(null);
    mocks.accountTierConfig.create.mockImplementation(async () => {
      order.push('config.create');
      return {};
    });
    mocks.accountTierConfig.updateMany.mockImplementation(async () => {
      order.push('config.updateMany');
      return { count: 1 };
    });
    mocks.accountTierConfig.deleteMany.mockImplementation(async () => {
      order.push('config.deleteMany');
      return { count: 1 };
    });
    mocks.accountTierDefinition.deleteMany.mockImplementation(async () => {
      order.push('definitions.deleteMany');
      return { count: 4 };
    });
    mocks.accountTierDefinition.createMany.mockImplementation(async () => {
      order.push('definitions.createMany');
      return { count: 4 };
    });
    mocks.accountHierarchyConfig.update.mockImplementation(async () => {
      order.push('hierarchy.update');
      return {};
    });
  });

  const admin = () => accountTiersRouter.createCaller(createAdminContext() as any);

  describe('get', () => {
    it('returns the default tiers without writing when the tenant has none', async () => {
      const view = await accountTiersRouter.createCaller(createTestContext() as any).get();

      expect(view.isDefault).toBe(true);
      expect(view.updatedAt).toBeNull();
      expect(view.defaultTierKey).toBeNull();
      expect(view.notifyOwnerOnUpgrade).toBe(false);
      expect(view.tiers.map((t) => [t.key, t.minRevenue])).toEqual([
        ['ENTERPRISE', 10_000_000],
        ['MID_MARKET', 1_000_000],
        ['SMB', 100_000],
        ['STARTUP', 0],
      ]);
      expect(view.canManage).toBe(false);
      expect(mocks.accountTierConfig.create).not.toHaveBeenCalled();
      expect(mocks.accountTierDefinition.createMany).not.toHaveBeenCalled();
    });

    it('reports canManage for admins only', async () => {
      await expect(admin().get()).resolves.toMatchObject({ canManage: true });
      await expect(
        accountTiersRouter.createCaller(createManagerContext() as any).get()
      ).resolves.toMatchObject({ canManage: false });
    });

    it('returns persisted tiers highest first with the configuration timestamp', async () => {
      mocks.accountTierDefinition.findMany.mockResolvedValue([
        row('GOLD', 'Gold', 500),
        row('BASE', 'Base', 0),
      ]);
      mocks.accountTierConfig.findUnique.mockResolvedValue({
        defaultTierKey: 'BASE',
        notifyOwnerOnUpgrade: true,
        notifyOwnerOnDowngrade: false,
        updatedAt: UPDATED_AT,
      });

      const view = await admin().get();

      expect(view).toMatchObject({
        isDefault: false,
        defaultTierKey: 'BASE',
        notifyOwnerOnUpgrade: true,
        updatedAt: UPDATED_AT.toISOString(),
      });
      expect(view.tiers.map((t) => [t.key, t.sortOrder])).toEqual([
        ['GOLD', 0],
        ['BASE', 1],
      ]);
      expect(mocks.accountTierDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });

  describe('update', () => {
    it('creates the configuration on the first save and replaces the rows in order', async () => {
      const input = defaultsInput();
      input.tiers[0] = { ...input.tiers[0], label: 'Strategic', benefits: ['Dedicated CSM'] };

      await admin().update(input);

      expect(order).toEqual(['config.create', 'definitions.deleteMany', 'definitions.createMany']);
      expect(mocks.accountTierConfig.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          defaultTierKey: null,
          notifyOwnerOnUpgrade: false,
          notifyOwnerOnDowngrade: false,
        },
      });
      expect(mocks.accountTierDefinition.deleteMany).toHaveBeenCalledWith({ where: { tenantId } });
      const { data } = mocks.accountTierDefinition.createMany.mock.calls[0][0];
      expect(data).toHaveLength(4);
      expect(data[0]).toEqual({
        tenantId,
        key: 'ENTERPRISE',
        label: 'Strategic',
        minRevenue: 10_000_000,
        colorToken: 'purple',
        benefits: ['Dedicated CSM'],
        sortOrder: 0,
      });
      expect(mocks.accountTierDefinition.createMany.mock.calls[0][0]).not.toHaveProperty(
        'skipDuplicates'
      );
    });

    it('accepts two tiers swapping thresholds', async () => {
      const input = defaultsInput();
      input.tiers[1] = { ...input.tiers[1], minRevenue: 100_000 };
      input.tiers[2] = { ...input.tiers[2], minRevenue: 1_000_000 };

      await expect(admin().update(input)).resolves.toBeDefined();
      expect(order).toContain('definitions.createMany');
    });

    it('generates keys for new tiers from their label', async () => {
      const input = defaultsInput();
      input.tiers.push({
        label: 'Key Accounts',
        minRevenue: 50_000_000,
        colorToken: 'rose' as const,
        benefits: [],
      } as never);

      await admin().update(input);

      const { data } = mocks.accountTierDefinition.createMany.mock.calls[0][0];
      expect(data.map((d: { key: string }) => d.key)).toContain('KEY_ACCOUNTS');
    });

    it('uses the optimistic updatedAt check when editing a saved configuration', async () => {
      const input = { ...defaultsInput(), expectedUpdatedAt: UPDATED_AT.toISOString() };

      await admin().update(input);

      expect(order[0]).toBe('config.updateMany');
      expect(mocks.accountTierConfig.updateMany).toHaveBeenCalledWith({
        where: { tenantId, updatedAt: UPDATED_AT },
        data: expect.objectContaining({ defaultTierKey: null, updatedAt: expect.any(Date) }),
      });
    });

    it('returns CONFLICT when the configuration changed since it was read', async () => {
      mocks.accountTierConfig.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        admin().update({ ...defaultsInput(), expectedUpdatedAt: UPDATED_AT.toISOString() })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(mocks.accountTierDefinition.deleteMany).not.toHaveBeenCalled();
    });

    it('maps a unique violation (concurrent first save) to CONFLICT', async () => {
      mocks.accountTierConfig.create.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' })
      );

      await expect(admin().update(defaultsInput())).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rethrows other database errors', async () => {
      mocks.accountTierDefinition.createMany.mockRejectedValue(new Error('connection reset'));

      await expect(admin().update(defaultsInput())).rejects.toThrow('connection reset');
    });

    it('accepts the maximum of ten tiers', async () => {
      const ten = Array.from({ length: 10 }, (_, i) => ({
        key: `T${i}`,
        label: `Tier ${i}`,
        minRevenue: i * 10,
        colorToken: 'slate' as const,
        benefits: [],
      }));
      await admin().update({ ...defaultsInput(), tiers: ten });
      expect(mocks.accountTierDefinition.createMany.mock.calls[0][0].data).toHaveLength(10);
    });

    it('rejects a default tier that requires a parent account', async () => {
      mocks.accountHierarchyConfig.findUnique.mockResolvedValue({
        requireParentForTiers: ['smb'],
      });

      await expect(
        admin().update({ ...defaultsInput(), defaultTierKey: 'SMB' })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(mocks.$transaction).not.toHaveBeenCalled();
    });

    it('prunes hierarchy rules that reference removed tiers, comparing normalised keys', async () => {
      mocks.accountHierarchyConfig.findUnique.mockResolvedValue({
        requireParentForTiers: ['mid-market', 'ENTERPRISE', 'strategic'],
      });
      const input = defaultsInput();
      input.tiers.splice(1, 1); // remove MID_MARKET
      input.tiers[1] = { ...input.tiers[1], minRevenue: 1_000_000 };

      await admin().update(input);

      expect(mocks.accountHierarchyConfig.update).toHaveBeenCalledWith({
        where: { tenantId },
        data: { requireParentForTiers: ['ENTERPRISE', 'strategic'] },
      });
    });

    it('leaves hierarchy rules alone when nothing they reference was removed', async () => {
      mocks.accountHierarchyConfig.findUnique.mockResolvedValue({
        requireParentForTiers: ['ENTERPRISE'],
      });

      await admin().update(defaultsInput());

      expect(mocks.accountHierarchyConfig.update).not.toHaveBeenCalled();
    });

    it('writes an audit entry with keys and thresholds only', async () => {
      const input = defaultsInput();
      input.tiers[0] = { ...input.tiers[0], label: 'Secret Label' };

      await admin().update(input);

      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'account',
        'tier-config',
        tenantId,
        expect.objectContaining({ actorId: expect.any(String) })
      );
      expect(JSON.stringify(logAction.mock.calls[0][4])).not.toContain('Secret Label');
    });

    it('does not fail the save when the audit log fails', async () => {
      logAction.mockRejectedValue(new Error('audit down'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(admin().update(defaultsInput())).resolves.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });

    it.each([
      ['MANAGER', createManagerContext],
      ['USER', createTestContext],
    ])('forbids %s callers', async (_role, makeCtx) => {
      const caller = accountTiersRouter.createCaller(makeCtx() as any);
      await expect(caller.update(defaultsInput())).rejects.toBeInstanceOf(TRPCError);
      await expect(caller.update(defaultsInput())).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.resetToDefaults()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.$transaction).not.toHaveBeenCalled();
    });

    it('scopes every read and write to the caller tenant, even if the input names another', async () => {
      const otherTenant = TEST_UUIDS.account2;
      await admin().update({ ...defaultsInput(), tenantId: otherTenant } as never);

      const calls = [
        ...mocks.accountTierDefinition.findMany.mock.calls,
        ...mocks.accountTierConfig.findUnique.mock.calls,
        ...mocks.accountTierConfig.create.mock.calls,
        ...mocks.accountTierDefinition.deleteMany.mock.calls,
      ];
      for (const [args] of calls) {
        const scoped =
          (args as { where?: { tenantId?: string }; data?: { tenantId?: string } }).where
            ?.tenantId ?? (args as { data?: { tenantId?: string } }).data?.tenantId;
        expect(scoped).toBe(tenantId);
      }
      const { data } = mocks.accountTierDefinition.createMany.mock.calls[0][0];
      expect(data.every((d: { tenantId: string }) => d.tenantId === tenantId)).toBe(true);
    });
  });

  describe('resetToDefaults', () => {
    it('deletes the tenant rows and prunes only custom tiers from hierarchy rules', async () => {
      mocks.accountTierDefinition.findMany.mockResolvedValue([
        row('KEY_ACCOUNTS', 'Key Accounts', 5_000_000),
        row('ENTERPRISE', 'Enterprise', 1_000_000),
        row('STARTUP', 'Startup', 0),
      ]);
      mocks.accountHierarchyConfig.findUnique.mockResolvedValue({
        requireParentForTiers: ['key-accounts', 'ENTERPRISE', 'legacy'],
      });

      const view = await admin().resetToDefaults();

      expect(order).toEqual(['definitions.deleteMany', 'config.deleteMany', 'hierarchy.update']);
      expect(mocks.accountHierarchyConfig.update).toHaveBeenCalledWith({
        where: { tenantId },
        data: { requireParentForTiers: ['ENTERPRISE', 'legacy'] },
      });
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'account',
        'tier-config',
        tenantId,
        expect.any(Object)
      );
      expect(view.canManage).toBe(true);
    });

    it('does not touch hierarchy rules when there are none', async () => {
      await admin().resetToDefaults();
      expect(order).toEqual(['definitions.deleteMany', 'config.deleteMany']);
    });
  });
});
