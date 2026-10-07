/**
 * PG-196 — account tier runtime helpers (list filter, parent rule,
 * tier-change notifications, configuration loading).
 */
import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { DEFAULT_TIER_CONFIG, type TierConfig } from '@intelliflow/domain';
import {
  assertCreateAllowed,
  assertParentRemovalAllowed,
  assertParentRequirement,
  assertRevenueChangeAllowed,
  loadAccountTierConfig,
  loadAccountTierPolicy,
  loadRevenueChange,
  normalizeRequiredTiers,
  notifyAccountTierChange,
  notifyRevenueChange,
  revenueToNumber,
  tierChangeDirection,
  tierLabel,
  tierRevenueWhere,
  type RevenueChange,
} from '../account-tiers';

const TENANT = 'tenant-1';

const tierRow = (key: string, label: string, minRevenue: unknown, colorToken = 'slate') => ({
  key,
  label,
  minRevenue,
  colorToken,
  benefits: [] as string[],
  sortOrder: 0,
});

const decimal = (n: number) => ({ toNumber: () => n });

function makeDb(opts: {
  rows?: ReturnType<typeof tierRow>[];
  config?: Record<string, unknown> | null;
  hierarchy?: { requireParentForTiers: string[] } | null;
  account?: Record<string, unknown> | null;
}) {
  return {
    accountTierDefinition: { findMany: vi.fn().mockResolvedValue(opts.rows ?? []) },
    accountTierConfig: { findUnique: vi.fn().mockResolvedValue(opts.config ?? null) },
    accountHierarchyConfig: { findUnique: vi.fn().mockResolvedValue(opts.hierarchy ?? null) },
    account: { findFirst: vi.fn().mockResolvedValue(opts.account ?? null) },
  };
}

const withDefault = (key: string): TierConfig => ({ ...DEFAULT_TIER_CONFIG, defaultTierKey: key });

describe('revenueToNumber', () => {
  it('maps Decimal, string, number and empty values', () => {
    expect(revenueToNumber(decimal(12.5))).toBe(12.5);
    expect(revenueToNumber('100000.00')).toBe(100_000);
    expect(revenueToNumber(7)).toBe(7);
    expect(revenueToNumber(null)).toBeNull();
    expect(revenueToNumber(undefined)).toBeNull();
    expect(revenueToNumber('  ')).toBeNull();
    expect(revenueToNumber(true)).toBe(1);
  });
});

describe('loadAccountTierConfig', () => {
  it('returns the domain defaults without writing when the tenant has no rows', async () => {
    const db = makeDb({});
    const loaded = await loadAccountTierConfig(db, TENANT);
    expect(loaded.isDefault).toBe(true);
    expect(loaded.updatedAt).toBeNull();
    expect(loaded.config.tiers).toBe(DEFAULT_TIER_CONFIG.tiers);
    expect(loaded.config.defaultTierKey).toBeNull();
    expect(loaded.notifyOwnerOnUpgrade).toBe(false);
    expect(db.accountTierDefinition.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      orderBy: { minRevenue: 'desc' },
    });
    expect(db.accountTierConfig.findUnique).toHaveBeenCalledWith({ where: { tenantId: TENANT } });
  });

  it('maps persisted rows (Decimal → number, null benefits → [])', async () => {
    const updatedAt = new Date('2026-10-07T08:00:00.000Z');
    const db = makeDb({
      rows: [
        { ...tierRow('GOLD', 'Gold', decimal(500_000), 'amber'), benefits: ['CSM'] },
        { ...tierRow('BASE', 'Base', decimal(0)), benefits: null as unknown as string[] },
      ],
      config: {
        defaultTierKey: 'BASE',
        notifyOwnerOnUpgrade: true,
        notifyOwnerOnDowngrade: false,
        updatedAt,
      },
    });
    const loaded = await loadAccountTierConfig(db, TENANT);
    expect(loaded.isDefault).toBe(false);
    expect(loaded.updatedAt).toBe(updatedAt);
    expect(loaded.notifyOwnerOnUpgrade).toBe(true);
    expect(loaded.config).toEqual({
      tiers: [
        { key: 'GOLD', label: 'Gold', minRevenue: 500_000, colorToken: 'amber', benefits: ['CSM'] },
        { key: 'BASE', label: 'Base', minRevenue: 0, colorToken: 'slate', benefits: [] },
      ],
      defaultTierKey: 'BASE',
    });
  });
});

describe('tierLabel', () => {
  it('returns the configured label or Unknown', () => {
    expect(tierLabel(DEFAULT_TIER_CONFIG, 'MID_MARKET')).toBe('Mid-Market');
    expect(tierLabel(DEFAULT_TIER_CONFIG, 'UNKNOWN')).toBe('Unknown');
  });
});

describe('tierRevenueWhere', () => {
  it('maps a middle tier to a half-open revenue band', () => {
    expect(tierRevenueWhere(DEFAULT_TIER_CONFIG, 'SMB')).toEqual({
      revenue: { gte: 100_000, lt: 1_000_000 },
    });
  });

  it('leaves the top tier unbounded', () => {
    expect(tierRevenueWhere(DEFAULT_TIER_CONFIG, 'ENTERPRISE')).toEqual({
      revenue: { gte: 10_000_000 },
    });
  });

  it('includes accounts without revenue for the default tier', () => {
    expect(tierRevenueWhere(withDefault('STARTUP'), 'STARTUP')).toEqual({
      OR: [{ revenue: { gte: 0, lt: 100_000 } }, { revenue: null }],
    });
  });

  it('maps UNKNOWN to accounts without revenue when there is no default tier', () => {
    expect(tierRevenueWhere(DEFAULT_TIER_CONFIG, 'UNKNOWN')).toEqual({ revenue: null });
  });

  it('matches nothing for UNKNOWN when a default tier claims those accounts', () => {
    expect(tierRevenueWhere(withDefault('SMB'), 'UNKNOWN')).toEqual({ id: { in: [] } });
  });

  it('rejects a key that is not a configured tier', () => {
    expect(() => tierRevenueWhere(DEFAULT_TIER_CONFIG, 'PLATINUM')).toThrow(TRPCError);
    try {
      tierRevenueWhere(DEFAULT_TIER_CONFIG, 'PLATINUM');
    } catch (e) {
      expect((e as TRPCError).code).toBe('BAD_REQUEST');
    }
  });
});

describe('normalizeRequiredTiers', () => {
  it('normalises legacy values and drops empty ones', () => {
    expect([...normalizeRequiredTiers(['mid-market', ' enterprise ', '--'])]).toEqual([
      'MID_MARKET',
      'ENTERPRISE',
    ]);
    expect(normalizeRequiredTiers(null).size).toBe(0);
    expect(normalizeRequiredTiers(undefined).size).toBe(0);
  });
});

describe('assertParentRequirement', () => {
  const required = new Set(['ENTERPRISE']);
  const base = { config: DEFAULT_TIER_CONFIG, requiredTiers: required };

  it('blocks a parentless account entering a required tier with an actionable message', () => {
    expect(() =>
      assertParentRequirement({ ...base, tierKey: 'ENTERPRISE', hasParent: false })
    ).toThrow(
      'Accounts in the Enterprise tier need a parent account. Set a parent first, or change the rule in Account Settings → Hierarchy.'
    );
  });

  it('allows a required tier when the account has a parent', () => {
    expect(() =>
      assertParentRequirement({ ...base, tierKey: 'ENTERPRISE', hasParent: true })
    ).not.toThrow();
  });

  it('allows tiers that are not required', () => {
    expect(() =>
      assertParentRequirement({ ...base, tierKey: 'SMB', hasParent: false })
    ).not.toThrow();
  });

  it('grandfathers an account that was already in the required tier', () => {
    expect(() =>
      assertParentRequirement({
        ...base,
        tierKey: 'ENTERPRISE',
        hasParent: false,
        previousTierKey: 'ENTERPRISE',
      })
    ).not.toThrow();
  });

  it('blocks a revenue edit moving a parentless account into the required tier', () => {
    expect(() =>
      assertParentRequirement({
        ...base,
        tierKey: 'ENTERPRISE',
        hasParent: false,
        previousTierKey: 'MID_MARKET',
      })
    ).toThrow(TRPCError);
  });
});

describe('tierChangeDirection', () => {
  it('detects upgrades and downgrades by threshold', () => {
    expect(tierChangeDirection(DEFAULT_TIER_CONFIG, 'SMB', 'ENTERPRISE')).toBe('upgrade');
    expect(tierChangeDirection(DEFAULT_TIER_CONFIG, 'ENTERPRISE', 'STARTUP')).toBe('downgrade');
  });

  it('is null when unchanged or when either side is not a configured tier', () => {
    expect(tierChangeDirection(DEFAULT_TIER_CONFIG, 'SMB', 'SMB')).toBeNull();
    expect(tierChangeDirection(DEFAULT_TIER_CONFIG, 'UNKNOWN', 'SMB')).toBeNull();
    expect(tierChangeDirection(DEFAULT_TIER_CONFIG, 'SMB', 'UNKNOWN')).toBeNull();
  });
});

describe('notifyAccountTierChange', () => {
  const args = {
    tenantId: TENANT,
    accountId: 'acc-1',
    accountName: 'Acme',
    ownerId: 'owner-1',
    actorId: 'actor-1',
    previousRevenue: 50_000,
    nextRevenue: 2_000_000,
  };
  const loaded = (up: boolean, down: boolean) => ({
    config: DEFAULT_TIER_CONFIG,
    notifyOwnerOnUpgrade: up,
    notifyOwnerOnDowngrade: down,
  });

  it('notifies the owner once on an upgrade when the flag is on', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    await expect(notifyAccountTierChange(args, loaded(true, false), create)).resolves.toBe(
      'upgrade'
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      userId: 'owner-1',
      tenantId: TENANT,
      type: 'account_tier_changed',
      title: 'Tier upgraded: Acme',
      body: 'Acme moved from Startup to Mid-Market.',
      priority: 'normal',
      entityType: 'account',
      entityId: 'acc-1',
      entityName: 'Acme',
      actionUrl: '/accounts/acc-1',
    });
  });

  it('never includes revenue amounts in the message', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    await notifyAccountTierChange(args, loaded(true, true), create);
    const { title, body } = create.mock.calls[0][0];
    expect(`${title} ${body}`).not.toMatch(/\d/);
  });

  it('does not notify an upgrade when the upgrade flag is off', async () => {
    const create = vi.fn();
    await expect(notifyAccountTierChange(args, loaded(false, true), create)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('notifies a downgrade only when the downgrade flag is on', async () => {
    const down = { ...args, previousRevenue: 20_000_000, nextRevenue: 500 };
    const create = vi.fn().mockResolvedValue(undefined);
    await expect(notifyAccountTierChange(down, loaded(true, false), create)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
    await expect(notifyAccountTierChange(down, loaded(false, true), create)).resolves.toBe(
      'downgrade'
    );
    expect(create.mock.calls[0][0].title).toBe('Tier downgraded: Acme');
  });

  it('does not notify when the tier is unchanged', async () => {
    const create = vi.fn();
    await notifyAccountTierChange({ ...args, nextRevenue: 60_000 }, loaded(true, true), create);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not notify owners about their own edits', async () => {
    const create = vi.fn();
    await notifyAccountTierChange({ ...args, actorId: 'owner-1' }, loaded(true, true), create);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('policy and revenue-change loaders', () => {
  const account = {
    id: 'acc-1',
    name: 'Acme',
    ownerId: 'owner-1',
    parentAccountId: null,
    revenue: decimal(500_000),
  };

  it('loads the tier policy with normalised required tiers', async () => {
    const db = makeDb({ hierarchy: { requireParentForTiers: ['enterprise'] } });
    const policy = await loadAccountTierPolicy(db, TENANT);
    expect([...policy.requiredTiers]).toEqual(['ENTERPRISE']);
    expect(policy.loaded.isDefault).toBe(true);
  });

  it('assertCreateAllowed blocks a parentless create in a required tier', async () => {
    const policy = await loadAccountTierPolicy(
      makeDb({ hierarchy: { requireParentForTiers: ['ENTERPRISE'] } }),
      TENANT
    );
    expect(() => assertCreateAllowed(policy, 20_000_000, null)).toThrow(TRPCError);
    expect(() => assertCreateAllowed(policy, 20_000_000, 'parent-1')).not.toThrow();
    expect(() => assertCreateAllowed(policy, undefined, undefined)).not.toThrow();
  });

  it('loadRevenueChange reads the account tenant-scoped and returns null when absent', async () => {
    const db = makeDb({});
    await expect(loadRevenueChange(db, TENANT, 'acc-x')).resolves.toBeNull();
    expect(db.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc-x', tenantId: TENANT },
      select: { id: true, name: true, ownerId: true, parentAccountId: true, revenue: true },
    });
  });

  it('assertRevenueChangeAllowed blocks a move into a required tier but not edits within it', async () => {
    const db = makeDb({ account, hierarchy: { requireParentForTiers: ['MID_MARKET'] } });
    const change = (await loadRevenueChange(db, TENANT, 'acc-1')) as RevenueChange;
    expect(change.previousRevenue).toBe(500_000);
    expect(() => assertRevenueChangeAllowed(change, 2_000_000)).toThrow(TRPCError);
    expect(() => assertRevenueChangeAllowed(change, 600_000)).not.toThrow();

    const inside = (await loadRevenueChange(
      makeDb({
        account: { ...account, revenue: decimal(1_500_000) },
        hierarchy: { requireParentForTiers: ['MID_MARKET'] },
      }),
      TENANT,
      'acc-1'
    )) as RevenueChange;
    expect(() => assertRevenueChangeAllowed(inside, 2_000_000)).not.toThrow();
  });

  it('notifyRevenueChange swallows notification failures', async () => {
    const db = makeDb({
      account,
      config: {
        defaultTierKey: null,
        notifyOwnerOnUpgrade: true,
        notifyOwnerOnDowngrade: true,
        updatedAt: new Date(),
      },
    });
    const change = (await loadRevenueChange(db, TENANT, 'acc-1')) as RevenueChange;
    const create = vi.fn().mockRejectedValue(new Error('smtp down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      notifyRevenueChange(change, 5_000_000, { tenantId: TENANT, actorId: 'actor-1' }, create)
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('assertParentRemovalAllowed checks the account tier and ignores unknown accounts', async () => {
    const required = { requireParentForTiers: ['SMB'] };
    await expect(
      assertParentRemovalAllowed(makeDb({ account, hierarchy: required }), TENANT, 'acc-1')
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      assertParentRemovalAllowed(makeDb({ hierarchy: required }), TENANT, 'acc-x')
    ).resolves.toBeUndefined();
    await expect(
      assertParentRemovalAllowed(
        makeDb({ account, hierarchy: { requireParentForTiers: ['ENTERPRISE'] } }),
        TENANT,
        'acc-1'
      )
    ).resolves.toBeUndefined();
  });
});
