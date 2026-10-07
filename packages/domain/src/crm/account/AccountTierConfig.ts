import { Result, DomainError } from '../../shared/Result';

/**
 * Tenant-configurable account tiers (PG-196, ADR-073).
 *
 * An account's tier is derived from its annual revenue: each tier has an
 * inclusive lower bound (`minRevenue`) and its band runs up to the next tier's
 * lower bound. Tiers are configuration, not stored on the account, so changing
 * a threshold re-tiers every account immediately.
 *
 * `DEFAULT_TIER_CONFIG` reproduces the IFC-273 revenue bands exactly; a tenant
 * that never edits its tiers resolves exactly as before.
 */

/** Tier shown for an account with no revenue when no default tier is configured. */
export const UNKNOWN_TIER_KEY = 'UNKNOWN' as const;

/** Upper bound on tiers per tenant. */
export const MAX_TIERS = 10;

/** Tier keys are immutable UPPER_SNAKE identifiers (`UNKNOWN` is reserved). */
export const TIER_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;

export interface TierDefinition<K extends string = string> {
  readonly key: K;
  readonly label: string;
  /** Inclusive lower bound of annual revenue for this tier. */
  readonly minRevenue: number;
  readonly colorToken: string;
  readonly benefits: readonly string[];
}

export interface TierConfig<K extends string = string> {
  readonly tiers: readonly TierDefinition<K>[];
  /** Tier shown when revenue is null; `null` means UNKNOWN. */
  readonly defaultTierKey: K | null;
}

export type DefaultTierKey = 'ENTERPRISE' | 'MID_MARKET' | 'SMB' | 'STARTUP';

export const DEFAULT_TIER_CONFIG: TierConfig<DefaultTierKey> = {
  tiers: [
    {
      key: 'ENTERPRISE',
      label: 'Enterprise',
      minRevenue: 10_000_000,
      colorToken: 'purple',
      benefits: [],
    },
    {
      key: 'MID_MARKET',
      label: 'Mid-Market',
      minRevenue: 1_000_000,
      colorToken: 'blue',
      benefits: [],
    },
    { key: 'SMB', label: 'SMB', minRevenue: 100_000, colorToken: 'green', benefits: [] },
    { key: 'STARTUP', label: 'Startup', minRevenue: 0, colorToken: 'amber', benefits: [] },
  ],
  defaultTierKey: null,
};

export class InvalidTierConfigError extends DomainError {
  readonly code = 'INVALID_TIER_CONFIG';
  constructor(message: string) {
    super(message);
  }
}

/** Tiers ordered by ascending minimum revenue (copy; the input is never mutated). */
function sortedAscending<K extends string>(
  tiers: readonly TierDefinition<K>[]
): TierDefinition<K>[] {
  return [...tiers].sort((a, b) => a.minRevenue - b.minRevenue);
}

/**
 * Resolve the tier key for a revenue amount.
 *
 * - null/undefined revenue → the configured default tier, else `UNKNOWN`
 * - otherwise the highest tier whose `minRevenue <= revenue`; revenue below
 *   every threshold (only possible for negative input) falls to the lowest tier
 */
export function resolveAccountTier<K extends string>(
  revenue: number | null | undefined,
  config: TierConfig<K>
): K | typeof UNKNOWN_TIER_KEY {
  if (revenue == null) return config.defaultTierKey ?? UNKNOWN_TIER_KEY;
  const ordered = sortedAscending(config.tiers);
  if (ordered.length === 0) return UNKNOWN_TIER_KEY;
  let match = ordered[0];
  for (const t of ordered) {
    if (t.minRevenue <= revenue) match = t;
  }
  return match.key;
}

/** Revenue band of a tier: `[gte, lt)`, with `lt: null` for the top tier. */
export function tierBand(
  config: TierConfig,
  key: string
): { gte: number; lt: number | null } | null {
  const ordered = sortedAscending(config.tiers);
  const index = ordered.findIndex((t) => t.key === key);
  if (index === -1) return null;
  const next = ordered[index + 1];
  return { gte: ordered[index].minRevenue, lt: next ? next.minRevenue : null };
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return v;
    seen.add(v);
  }
  return undefined;
}

/** Problem with a single tier definition, or `null` when it is well-formed. */
function tierProblem(t: TierDefinition): string | null {
  if (t.key === UNKNOWN_TIER_KEY) return `The tier key "${UNKNOWN_TIER_KEY}" is reserved.`;
  if (!TIER_KEY_PATTERN.test(t.key)) return `Invalid tier key "${t.key}".`;
  if (t.label.trim().length === 0) return `Tier "${t.key}" needs a name.`;
  if (!Number.isFinite(t.minRevenue) || t.minRevenue < 0) {
    return `Tier "${t.key}" has an invalid minimum revenue.`;
  }
  return null;
}

/** Problem across the tier set, or `null` when the set is consistent. */
function tierSetProblem(config: TierConfig): string | null {
  const { tiers } = config;
  if (tiers.length === 0) return 'A tier configuration needs at least one tier.';
  if (tiers.length > MAX_TIERS) return `A tier configuration can have at most ${MAX_TIERS} tiers.`;

  for (const t of tiers) {
    const problem = tierProblem(t);
    if (problem) return problem;
  }

  const dupKey = firstDuplicate(tiers.map((t) => t.key));
  if (dupKey) return `Tiers have a duplicate key "${dupKey}".`;

  const dupLabel = firstDuplicate(tiers.map((t) => t.label.trim().toLowerCase()));
  if (dupLabel) return `Tiers have a duplicate name "${dupLabel}".`;

  const dupMin = firstDuplicate(tiers.map((t) => String(t.minRevenue)));
  if (dupMin !== undefined) return `Two tiers have the same minimum revenue (${dupMin}).`;

  if (!tiers.some((t) => t.minRevenue === 0)) {
    return 'The lowest tier must start at 0 so every revenue amount has a tier.';
  }

  if (config.defaultTierKey !== null && !tiers.some((t) => t.key === config.defaultTierKey)) {
    return `The default tier "${config.defaultTierKey}" is not one of the tiers.`;
  }
  return null;
}

/** Check the cross-tier invariants of a configuration. */
export function validateTierConfig<K extends string>(
  config: TierConfig<K>
): Result<TierConfig<K>, InvalidTierConfigError> {
  const problem = tierSetProblem(config);
  return problem
    ? Result.fail<TierConfig<K>, InvalidTierConfigError>(new InvalidTierConfigError(problem))
    : Result.ok(config);
}
