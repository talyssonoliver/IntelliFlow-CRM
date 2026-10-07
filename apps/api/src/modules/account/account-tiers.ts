/**
 * Account Tiers runtime helpers - PG-196 (ADR-073)
 *
 * Loads a tenant's tier configuration and turns it into behaviour: the
 * account list tier filter, the "require a parent for these tiers" rule from
 * Account Settings, and the up/down tier-change notifications. The
 * accountTiers router owns the configuration rows; this module is the
 * runtime consumer.
 *
 * Every read goes through the caller's tenant-scoped client
 * (`ctx.prismaWithTenant`) so RLS and the explicit tenantId filter agree.
 */

import { TRPCError } from '@trpc/server';
import {
  DEFAULT_TIER_CONFIG,
  UNKNOWN_TIER_KEY,
  resolveAccountTier,
  tierBand,
  type TierConfig,
  type TierDefinition,
} from '@intelliflow/domain';
import { normalizeLegacyTierValue } from '@intelliflow/validators';
import type { NotificationCreator } from './account-automation';

// ─── Loading ────────────────────────────────────────────────────────────────

interface TierDefinitionRow {
  key: string;
  label: string;
  minRevenue: unknown;
  colorToken: string;
  benefits: string[] | null;
  sortOrder: number;
}

interface TierConfigRow {
  defaultTierKey: string | null;
  notifyOwnerOnUpgrade: boolean;
  notifyOwnerOnDowngrade: boolean;
  updatedAt: Date;
}

export interface AccountTierDb {
  accountTierDefinition: {
    findMany(args: {
      where: { tenantId: string };
      orderBy: { minRevenue: 'desc' };
    }): Promise<TierDefinitionRow[]>;
  };
  accountTierConfig: {
    findUnique(args: { where: { tenantId: string } }): Promise<TierConfigRow | null>;
  };
}

export interface LoadedTierConfig {
  config: TierConfig;
  notifyOwnerOnUpgrade: boolean;
  notifyOwnerOnDowngrade: boolean;
  /** `updatedAt` of the tenant's configuration row; null while on defaults. */
  updatedAt: Date | null;
  /** True when the tenant has no tier rows and resolves through the defaults. */
  isDefault: boolean;
}

/** Prisma Decimal / string / number → number; null stays null. */
export function revenueToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? null : Number(value);
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

function toDefinition(row: TierDefinitionRow): TierDefinition {
  return {
    key: row.key,
    label: row.label,
    minRevenue: revenueToNumber(row.minRevenue) ?? 0,
    colorToken: row.colorToken,
    benefits: row.benefits ?? [],
  };
}

/**
 * Load the tenant's tier configuration. Read-only: a tenant with no rows gets
 * the domain DEFAULT_TIER_CONFIG in memory, never a write.
 */
export async function loadAccountTierConfig(
  db: AccountTierDb,
  tenantId: string
): Promise<LoadedTierConfig> {
  const [rows, configRow] = await Promise.all([
    db.accountTierDefinition.findMany({ where: { tenantId }, orderBy: { minRevenue: 'desc' } }),
    db.accountTierConfig.findUnique({ where: { tenantId } }),
  ]);
  const isDefault = rows.length === 0;
  return {
    config: {
      tiers: isDefault ? DEFAULT_TIER_CONFIG.tiers : rows.map(toDefinition),
      defaultTierKey: configRow?.defaultTierKey ?? null,
    },
    notifyOwnerOnUpgrade: configRow?.notifyOwnerOnUpgrade ?? false,
    notifyOwnerOnDowngrade: configRow?.notifyOwnerOnDowngrade ?? false,
    updatedAt: configRow?.updatedAt ?? null,
    isDefault,
  };
}

/** Display label of a tier key ("Unknown" for UNKNOWN or a key no longer configured). */
export function tierLabel(config: TierConfig, key: string): string {
  return config.tiers.find((t) => t.key === key)?.label ?? 'Unknown';
}

// ─── List filter ────────────────────────────────────────────────────────────

type RevenueBand = { gte: number; lt?: number };
/** Fragment merged into the account list `where` (always inside an AND). */
export type AccountTierWhere =
  | { revenue: RevenueBand }
  | { revenue: null }
  | { OR: [{ revenue: RevenueBand }, { revenue: null }] }
  | { id: { in: [] } };

/**
 * Translate a tier key into a revenue filter for `account.list`.
 *
 * - a configured tier → `[minRevenue, next minRevenue)`, plus accounts with no
 *   revenue when the tier is the tenant's default tier
 * - `UNKNOWN` → accounts with no revenue, unless a default tier claims them
 * - anything else → BAD_REQUEST (stale link to a removed tier)
 */
export function tierRevenueWhere(config: TierConfig, key: string): AccountTierWhere {
  if (key === UNKNOWN_TIER_KEY) {
    return config.defaultTierKey === null ? { revenue: null } : { id: { in: [] } };
  }
  const band = tierBand(config, key);
  if (!band) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown account tier "${key}".` });
  }
  const revenue: RevenueBand =
    band.lt === null ? { gte: band.gte } : { gte: band.gte, lt: band.lt };
  return config.defaultTierKey === key ? { OR: [{ revenue }, { revenue: null }] } : { revenue };
}

// ─── Parent requirement (Account Settings → Hierarchy) ──────────────────────

/** Normalised tier keys from `AccountHierarchyConfig.requireParentForTiers`. */
export function normalizeRequiredTiers(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map(normalizeLegacyTierValue).filter((v) => v.length > 0));
}

export interface ParentRequirementCheck {
  config: TierConfig;
  requiredTiers: Set<string>;
  /** Resolved tier of the account after the change. */
  tierKey: string;
  hasParent: boolean;
  /**
   * Resolved tier before the change. Omit for creates and for removing a
   * parent; pass it for revenue edits so accounts that were already in a
   * required tier without a parent are not blocked (grandfathered).
   */
  previousTierKey?: string;
}

/** Enforce `requireParentForTiers` on transitions into a required tier. */
export function assertParentRequirement(check: ParentRequirementCheck): void {
  if (check.hasParent || !check.requiredTiers.has(check.tierKey)) return;
  if (check.previousTierKey !== undefined && check.requiredTiers.has(check.previousTierKey)) return;
  const label = tierLabel(check.config, check.tierKey);
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Accounts in the ${label} tier need a parent account. Set a parent first, or change the rule in Account Settings → Hierarchy.`,
  });
}

// ─── Up/down notifications ──────────────────────────────────────────────────

export type TierDirection = 'upgrade' | 'downgrade';

/** Direction of a tier change; null when unchanged or either side is not a configured tier. */
export function tierChangeDirection(
  config: TierConfig,
  fromKey: string,
  toKey: string
): TierDirection | null {
  if (fromKey === toKey) return null;
  const from = config.tiers.find((t) => t.key === fromKey);
  const to = config.tiers.find((t) => t.key === toKey);
  if (!from || !to) return null;
  return to.minRevenue > from.minRevenue ? 'upgrade' : 'downgrade';
}

export interface TierChangeNotification {
  tenantId: string;
  accountId: string;
  accountName: string;
  ownerId: string;
  actorId: string;
  previousRevenue: number | null;
  nextRevenue: number | null;
}

type TierNotificationCreator = NotificationCreator<'account_tier_changed'>;

/**
 * Notify the account owner when a revenue change moves the account up or
 * down a tier and the tenant has turned that notification on. The owner is
 * not notified about their own edit. Never includes revenue amounts.
 */
export async function notifyAccountTierChange(
  args: TierChangeNotification,
  loaded: Pick<LoadedTierConfig, 'config' | 'notifyOwnerOnUpgrade' | 'notifyOwnerOnDowngrade'>,
  createNotification: TierNotificationCreator
): Promise<TierDirection | null> {
  if (args.actorId === args.ownerId) return null;
  const fromKey = resolveAccountTier(args.previousRevenue, loaded.config);
  const toKey = resolveAccountTier(args.nextRevenue, loaded.config);
  const direction = tierChangeDirection(loaded.config, fromKey, toKey);
  if (direction === null) return null;
  if (direction === 'upgrade' && !loaded.notifyOwnerOnUpgrade) return null;
  if (direction === 'downgrade' && !loaded.notifyOwnerOnDowngrade) return null;

  const fromLabel = tierLabel(loaded.config, fromKey);
  const toLabel = tierLabel(loaded.config, toKey);
  await createNotification({
    userId: args.ownerId,
    tenantId: args.tenantId,
    type: 'account_tier_changed',
    title: `${direction === 'upgrade' ? 'Tier upgraded' : 'Tier downgraded'}: ${args.accountName}`,
    body: `${args.accountName} moved from ${fromLabel} to ${toLabel}.`,
    priority: 'normal',
    entityType: 'account',
    entityId: args.accountId,
    entityName: args.accountName,
    actionUrl: `/accounts/${args.accountId}`,
  });
  return direction;
}

// ─── Account write paths (create / update / updateRevenue / setParent) ──────

export interface AccountTierPolicyDb extends AccountTierDb {
  accountHierarchyConfig: {
    findUnique(args: {
      where: { tenantId: string };
    }): Promise<{ requireParentForTiers: string[] } | null>;
  };
}

export interface AccountTierPolicy {
  loaded: LoadedTierConfig;
  requiredTiers: Set<string>;
}

/** Tier configuration plus the normalised `requireParentForTiers` rule. */
export async function loadAccountTierPolicy(
  db: AccountTierPolicyDb,
  tenantId: string
): Promise<AccountTierPolicy> {
  const [loaded, hierarchy] = await Promise.all([
    loadAccountTierConfig(db, tenantId),
    db.accountHierarchyConfig.findUnique({ where: { tenantId } }),
  ]);
  return { loaded, requiredTiers: normalizeRequiredTiers(hierarchy?.requireParentForTiers) };
}

/** Parent rule for a new account (`parentAccountId` from the create input). */
export function assertCreateAllowed(
  policy: AccountTierPolicy,
  revenue: unknown,
  parentAccountId: string | null | undefined
): void {
  const { config } = policy.loaded;
  assertParentRequirement({
    config,
    requiredTiers: policy.requiredTiers,
    tierKey: resolveAccountTier(revenueToNumber(revenue), config),
    hasParent: Boolean(parentAccountId),
  });
}

interface RevenueChangeAccount {
  id: string;
  name: string;
  ownerId: string;
  parentAccountId: string | null;
  revenue: unknown;
}

export interface RevenueChangeDb extends AccountTierPolicyDb {
  account: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: { id: true; name: true; ownerId: true; parentAccountId: true; revenue: true };
    }): Promise<RevenueChangeAccount | null>;
  };
}

export interface RevenueChange {
  policy: AccountTierPolicy;
  account: RevenueChangeAccount;
  previousRevenue: number | null;
}

/**
 * Read what a revenue edit needs before the write: the account's current
 * revenue/owner/parent and the tenant's tier policy. Null when the account is
 * not in this tenant (the service reports NOT_FOUND).
 */
export async function loadRevenueChange(
  db: RevenueChangeDb,
  tenantId: string,
  accountId: string
): Promise<RevenueChange | null> {
  const [account, policy] = await Promise.all([
    db.account.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true, name: true, ownerId: true, parentAccountId: true, revenue: true },
    }),
    loadAccountTierPolicy(db, tenantId),
  ]);
  if (!account) return null;
  return { policy, account, previousRevenue: revenueToNumber(account.revenue) };
}

/** Parent rule for a revenue edit: blocks only a move into a required tier. */
export function assertRevenueChangeAllowed(change: RevenueChange, nextRevenue: unknown): void {
  const { config } = change.policy.loaded;
  assertParentRequirement({
    config,
    requiredTiers: change.policy.requiredTiers,
    tierKey: resolveAccountTier(revenueToNumber(nextRevenue), config),
    hasParent: change.account.parentAccountId !== null,
    previousTierKey: resolveAccountTier(change.previousRevenue, config),
  });
}

/** After a committed revenue edit: notify the owner of a tier move. Never throws. */
export async function notifyRevenueChange(
  change: RevenueChange,
  nextRevenue: unknown,
  meta: { tenantId: string; actorId: string },
  createNotification: TierNotificationCreator
): Promise<void> {
  try {
    await notifyAccountTierChange(
      {
        tenantId: meta.tenantId,
        accountId: change.account.id,
        accountName: change.account.name,
        ownerId: change.account.ownerId,
        actorId: meta.actorId,
        previousRevenue: change.previousRevenue,
        nextRevenue: revenueToNumber(nextRevenue),
      },
      change.policy.loaded,
      createNotification
    );
  } catch (err) {
    console.warn('[account-tiers] tier-change notification failed (non-fatal):', err);
  }
}

/** Parent rule when a parent is removed: the account's tier decides. */
export async function assertParentRemovalAllowed(
  db: RevenueChangeDb,
  tenantId: string,
  accountId: string
): Promise<void> {
  const change = await loadRevenueChange(db, tenantId, accountId);
  if (!change) return;
  const { config } = change.policy.loaded;
  assertParentRequirement({
    config,
    requiredTiers: change.policy.requiredTiers,
    tierKey: resolveAccountTier(change.previousRevenue, config),
    hasParent: false,
  });
}
