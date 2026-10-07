'use client';

/**
 * useAccountTiers — the tenant's account tier configuration (PG-196).
 *
 * One cached `accountTiers.get` query feeds every place that shows a tier:
 * the accounts sidebar, the list filter chip, the list avatar/dot, the account
 * detail page, the hierarchy tree and Account Settings → Hierarchy.
 *
 * While the query loads (or if it fails) tiers resolve through the built-in
 * defaults — the same bands every tenant had before tiers were configurable —
 * so tier badges never flash empty. `tiers` is null until the tenant's real
 * configuration has loaded, for surfaces (the sidebar) that must not show
 * default names to a tenant that renamed its tiers.
 */
import { useMemo } from 'react';
import {
  DEFAULT_TIER_CONFIG,
  UNKNOWN_TIER_KEY,
  resolveAccountTier,
  type TierConfig,
} from '@intelliflow/domain';
import { tierKeyToSlug } from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  UNKNOWN_TIER_COLORS,
  tierColorClasses,
  type TierColorClasses,
} from '@/lib/accounts/tier-colors';

export interface TierView {
  key: string;
  label: string;
  /** URL form used by `/accounts?tier=`. */
  slug: string;
  minRevenue: number;
  colorToken: string;
  colors: TierColorClasses;
  benefits: readonly string[];
}

export const UNKNOWN_TIER_VIEW: TierView = {
  key: UNKNOWN_TIER_KEY,
  label: 'Unknown',
  slug: tierKeyToSlug(UNKNOWN_TIER_KEY),
  minRevenue: 0,
  colorToken: 'slate',
  colors: UNKNOWN_TIER_COLORS,
  benefits: [],
};

const TIER_STALE_TIME_MS = 5 * 60 * 1000;

/** Tier views ordered highest first, the order the sidebar and settings page use. */
export function toTierViews(config: TierConfig): TierView[] {
  return [...config.tiers]
    .sort((a, b) => b.minRevenue - a.minRevenue)
    .map((t) => ({
      key: t.key,
      label: t.label,
      slug: tierKeyToSlug(t.key),
      minRevenue: t.minRevenue,
      colorToken: t.colorToken,
      colors: tierColorClasses(t.colorToken),
      benefits: t.benefits,
    }));
}

/** Revenue as stored on an account row (Decimal string, number or null). */
export function toRevenueNumber(revenue: number | string | null | undefined): number | null {
  if (revenue === null || revenue === undefined || revenue === '') return null;
  const n = Number(revenue);
  return Number.isFinite(n) ? n : null;
}

export interface UseAccountTiersResult {
  /** Configuration in effect (built-in defaults until the tenant's has loaded). */
  config: TierConfig;
  /** The tenant's tiers, highest first; null until they have loaded. */
  tiers: TierView[] | null;
  /** Tier of an account by its revenue. */
  resolveTier: (revenue: number | string | null | undefined) => TierView;
  /** Tier by key (UNKNOWN view when the key is not configured). */
  tierByKey: (key: string) => TierView;
  canManage: boolean;
  isLoading: boolean;
  isError: boolean;
}

/** Tier data as returned by `accountTiers.get` (the fields this hook reads). */
export interface AccountTiersData {
  tiers: TierConfig['tiers'];
  defaultTierKey: string | null;
  canManage: boolean;
}

/**
 * Pure core of the hook: tier views and resolvers for loaded data, or the
 * built-in defaults while there is none. Exported so tests can mock the hook
 * with the real resolution logic.
 */
export function buildAccountTiersResult(
  data: AccountTiersData | undefined,
  state: { isLoading: boolean; isError: boolean }
): UseAccountTiersResult {
  const config: TierConfig = data
    ? { tiers: data.tiers, defaultTierKey: data.defaultTierKey }
    : DEFAULT_TIER_CONFIG;
  const views = toTierViews(config);
  const byKey = new Map(views.map((v) => [v.key, v]));
  const tierByKey = (key: string) => byKey.get(key) ?? UNKNOWN_TIER_VIEW;
  return {
    config,
    tiers: data ? views : null,
    resolveTier: (revenue) => tierByKey(resolveAccountTier(toRevenueNumber(revenue), config)),
    tierByKey,
    canManage: data?.canManage ?? false,
    isLoading: state.isLoading,
    isError: state.isError,
  };
}

export function useAccountTiers(): UseAccountTiersResult {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const query = trpc.accountTiers.get.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: TIER_STALE_TIME_MS,
  });
  const { data, isLoading, isError } = query;
  return useMemo(
    () => buildAccountTiersResult(data, { isLoading, isError }),
    [data, isLoading, isError]
  );
}
