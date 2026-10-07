/**
 * PG-196 — account router tier behaviour:
 *  - `list({ tier })` filters by the tenant's revenue band
 *  - revenue edits notify the owner of a tier move (when the tenant opts in)
 *  - `requireParentForTiers` (Account Settings → Hierarchy) is enforced on
 *    create, revenue edits that move an account into a required tier, and
 *    parent removal
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const createNotification = vi.fn();
vi.mock('../../notifications/notifications.router', () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

import { accountRouter } from '../account.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const mocks = prismaMock as any;
const tenantId = TEST_UUIDS.tenant;
const ownerId = TEST_UUIDS.user2;
const accountId = TEST_UUIDS.account1;

const ok = (value: unknown) => ({ isSuccess: true, isFailure: false, value });

const domainAccount = (revenue: number | null) => ({
  id: { value: accountId },
  name: 'Acme',
  industry: 'Technology',
  employees: 10,
  revenue,
  ownerId,
  tenantId,
  createdAt: new Date(),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
});

const storedAccount = (revenue: number | null, parentAccountId: string | null = null) => ({
  id: accountId,
  name: 'Acme',
  ownerId,
  parentAccountId,
  revenue: revenue === null ? null : { toNumber: () => revenue },
});

function tierFlags(up: boolean, down: boolean, defaultTierKey: string | null = null) {
  mocks.accountTierConfig.findUnique.mockResolvedValue({
    defaultTierKey,
    notifyOwnerOnUpgrade: up,
    notifyOwnerOnDowngrade: down,
    updatedAt: new Date('2026-10-07T08:00:00.000Z'),
  });
}

describe('account router — tiers (PG-196)', () => {
  let ctx: ReturnType<typeof createTestContext>;
  let caller: ReturnType<typeof accountRouter.createCaller>;

  beforeEach(() => {
    createNotification.mockReset().mockResolvedValue({ id: 'n-1' });
    mocks.$extends = vi.fn().mockReturnValue(prismaMock);
    mocks.$executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    mocks.$transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
    mocks.accountAutomationSetting.findUnique.mockResolvedValue(null);
    mocks.accountRequiredField.findMany.mockResolvedValue([]);
    mocks.accountTierDefinition.findMany.mockResolvedValue([]);
    mocks.accountTierConfig.findUnique.mockResolvedValue(null);
    mocks.accountHierarchyConfig.findUnique.mockResolvedValue(null);
    mocks.account.findFirst.mockResolvedValue(storedAccount(50_000));
    ctx = createTestContext();
    caller = accountRouter.createCaller(ctx);
  });

  describe('list({ tier })', () => {
    beforeEach(() => {
      mocks.account.findMany.mockResolvedValue([]);
      mocks.account.count.mockResolvedValue(0);
    });

    const whereOf = () => mocks.account.findMany.mock.calls[0][0].where;

    it('filters by the tier revenue band', async () => {
      await caller.list({ tier: 'SMB' });
      expect(whereOf()).toMatchObject({
        tenantId,
        AND: [{ revenue: { gte: 100_000, lt: 1_000_000 } }],
      });
    });

    it('keeps the search OR intact alongside the tier filter', async () => {
      await caller.list({ tier: 'ENTERPRISE', search: 'acme' });
      const where = whereOf();
      expect(where.AND).toEqual([{ revenue: { gte: 10_000_000 } }]);
      expect(where.OR).toHaveLength(4);
    });

    it('includes accounts without revenue for the default tier', async () => {
      tierFlags(false, false, 'STARTUP');
      await caller.list({ tier: 'STARTUP' });
      expect(whereOf().AND).toEqual([
        { OR: [{ revenue: { gte: 0, lt: 100_000 } }, { revenue: null }] },
      ]);
    });

    it('uses the tenant configuration, not the built-in bands', async () => {
      mocks.accountTierDefinition.findMany.mockResolvedValue([
        {
          key: 'GOLD',
          label: 'Gold',
          minRevenue: { toNumber: () => 500 },
          colorToken: 'amber',
          benefits: [],
          sortOrder: 0,
        },
        {
          key: 'BASE',
          label: 'Base',
          minRevenue: { toNumber: () => 0 },
          colorToken: 'slate',
          benefits: [],
          sortOrder: 1,
        },
      ]);
      await caller.list({ tier: 'BASE' });
      expect(whereOf().AND).toEqual([{ revenue: { gte: 0, lt: 500 } }]);
    });

    it('rejects a tier the tenant does not have', async () => {
      await expect(caller.list({ tier: 'PLATINUM' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('does not read the tier configuration without a tier filter', async () => {
      await caller.list({});
      expect(mocks.accountTierDefinition.findMany).not.toHaveBeenCalled();
    });
  });

  describe('tier-change notifications', () => {
    it('notifies the owner once when update moves the account up a tier', async () => {
      tierFlags(true, false);
      ctx.services!.account!.updateAccountInfo = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(2_000_000)));

      await caller.update({ id: accountId, revenue: 2_000_000 });

      expect(createNotification).toHaveBeenCalledTimes(1);
      expect(createNotification.mock.calls[0][1]).toMatchObject({
        userId: ownerId,
        tenantId,
        type: 'account_tier_changed',
        title: 'Tier upgraded: Acme',
        body: 'Acme moved from Startup to Mid-Market.',
      });
    });

    it('stays silent when the upgrade notification is off', async () => {
      tierFlags(false, true);
      ctx.services!.account!.updateAccountInfo = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(2_000_000)));

      await caller.update({ id: accountId, revenue: 2_000_000 });

      expect(createNotification).not.toHaveBeenCalled();
    });

    it('notifies a downgrade through updateRevenue', async () => {
      tierFlags(false, true);
      mocks.account.findFirst.mockResolvedValue(storedAccount(20_000_000));
      ctx.services!.account!.updateRevenue = vi.fn().mockResolvedValue(ok(domainAccount(5_000)));

      await caller.updateRevenue({ id: accountId, revenue: 5_000 });

      expect(createNotification).toHaveBeenCalledTimes(1);
      expect(createNotification.mock.calls[0][1].title).toBe('Tier downgraded: Acme');
    });

    it('notifies an upgrade through updateRevenue', async () => {
      tierFlags(true, false);
      ctx.services!.account!.updateRevenue = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(20_000_000)));

      await caller.updateRevenue({ id: accountId, revenue: 20_000_000 });

      expect(createNotification.mock.calls[0][1].title).toBe('Tier upgraded: Acme');
    });

    it('does not read the account or notify when revenue is not part of the update', async () => {
      tierFlags(true, true);
      ctx.services!.account!.updateAccountInfo = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(50_000)));

      await caller.update({ id: accountId, name: 'Acme Ltd' });

      expect(mocks.account.findFirst).not.toHaveBeenCalled();
      expect(createNotification).not.toHaveBeenCalled();
    });

    it('still succeeds when the notification fails', async () => {
      tierFlags(true, true);
      createNotification.mockRejectedValue(new Error('queue down'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      ctx.services!.account!.updateAccountInfo = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(2_000_000)));

      await expect(caller.update({ id: accountId, revenue: 2_000_000 })).resolves.toMatchObject({
        revenue: 2_000_000,
      });
      warn.mockRestore();
    });

    it('does not notify when the revenue edit fails', async () => {
      tierFlags(true, true);
      ctx.services!.account!.updateRevenue = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(
        caller.updateRevenue({ id: accountId, revenue: 20_000_000 })
      ).rejects.toBeDefined();
      expect(createNotification).not.toHaveBeenCalled();
    });

    it('skips tier handling when the account is not in this tenant', async () => {
      tierFlags(true, true);
      mocks.account.findFirst.mockResolvedValue(null);
      ctx.services!.account!.updateRevenue = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.updateRevenue({ id: accountId, revenue: 1 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('requireParentForTiers', () => {
    beforeEach(() => {
      mocks.accountHierarchyConfig.findUnique.mockResolvedValue({
        requireParentForTiers: ['enterprise'],
      });
    });

    it('blocks creating a parentless account in a required tier', async () => {
      const createAccount = vi.fn();
      ctx.services!.account!.createAccount = createAccount;

      await expect(caller.create({ name: 'Big Co', revenue: 20_000_000 })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('Enterprise tier need a parent account'),
      });
      expect(createAccount).not.toHaveBeenCalled();
    });

    it('allows creating an account in a tier that is not required', async () => {
      ctx.services!.account!.createAccount = vi.fn().mockResolvedValue(ok(domainAccount(50_000)));

      await expect(caller.create({ name: 'Small Co', revenue: 50_000 })).resolves.toBeDefined();
    });

    it('allows creating an account without revenue (lead conversion shape)', async () => {
      ctx.services!.account!.createAccount = vi.fn().mockResolvedValue(ok(domainAccount(null)));

      await expect(caller.create({ name: 'From Lead' })).resolves.toBeDefined();
    });

    it('blocks a revenue edit that moves a parentless account into a required tier', async () => {
      const updateRevenue = vi.fn();
      ctx.services!.account!.updateRevenue = updateRevenue;

      await expect(
        caller.updateRevenue({ id: accountId, revenue: 20_000_000 })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(updateRevenue).not.toHaveBeenCalled();
    });

    it('blocks the same move through update', async () => {
      const updateAccountInfo = vi.fn();
      ctx.services!.account!.updateAccountInfo = updateAccountInfo;

      await expect(caller.update({ id: accountId, revenue: 20_000_000 })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(updateAccountInfo).not.toHaveBeenCalled();
    });

    it('allows the move when the account already has a parent', async () => {
      mocks.account.findFirst.mockResolvedValue(storedAccount(50_000, TEST_UUIDS.account2));
      ctx.services!.account!.updateRevenue = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(20_000_000)));

      await expect(
        caller.updateRevenue({ id: accountId, revenue: 20_000_000 })
      ).resolves.toBeDefined();
    });

    it('does not block edits of an account already in the required tier (grandfathered)', async () => {
      mocks.account.findFirst.mockResolvedValue(storedAccount(15_000_000));
      ctx.services!.account!.updateRevenue = vi
        .fn()
        .mockResolvedValue(ok(domainAccount(30_000_000)));

      await expect(
        caller.updateRevenue({ id: accountId, revenue: 30_000_000 })
      ).resolves.toBeDefined();
    });

    it('blocks removing the parent of an account in a required tier', async () => {
      mocks.account.findFirst.mockResolvedValue(storedAccount(15_000_000, TEST_UUIDS.account2));
      const setParent = vi.fn();
      ctx.services!.account!.setParent = setParent;

      await expect(caller.setParent({ accountId, parentAccountId: null })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(setParent).not.toHaveBeenCalled();
    });

    it('allows setting a parent without reading the tier policy', async () => {
      ctx.services!.account!.setParent = vi.fn().mockResolvedValue(ok(domainAccount(15_000_000)));

      await expect(
        caller.setParent({ accountId, parentAccountId: TEST_UUIDS.account2 })
      ).resolves.toBeDefined();
      expect(mocks.account.findFirst).not.toHaveBeenCalled();
    });
  });
});
