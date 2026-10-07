// PG-197: pure territory matching and assignment engine (BR-1, BR-5..BR-11).
//
// Two stages so the API can advance the round-robin cursor atomically between
// them: resolveTerritory → planTerritoryAssignment → (cursor / load lookup in
// the API) → pickTerritoryAssignee.

import { ISO_COUNTRY_CODES, type TerritoryStrategy } from './territory-constants';

const ISO_COUNTRY_SET: ReadonlySet<string> = new Set(ISO_COUNTRY_CODES);

type NullableString = string | null | undefined;

/** True when `code` is an officially assigned ISO 3166-1 alpha-2 code. */
export function isIsoCountryCode(code: string): boolean {
  return ISO_COUNTRY_SET.has(code);
}

function collapseWhitespace(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ');
}

/** Trim + upper-case; empty → null. Does not check the ISO list. */
export function normalizeCountry(value: NullableString): string | null {
  if (value == null) return null;
  const code = value.trim().toUpperCase();
  return code === '' ? null : code;
}

/** Trim + collapse inner whitespace, case preserved; empty → null. */
export function normalizeRegion(value: NullableString): string | null {
  if (value == null) return null;
  const region = collapseWhitespace(value);
  return region === '' ? null : region;
}

/** Display form: trim, upper-case, collapse inner whitespace; empty → null. */
export function normalizePostalCode(value: NullableString): string | null {
  if (value == null) return null;
  const postal = collapseWhitespace(value).toUpperCase();
  return postal === '' ? null : postal;
}

/** Match-key form: upper-case letters and digits only; empty → null. */
export function postalMatchKey(value: NullableString): string | null {
  if (value == null) return null;
  const key = value.toUpperCase().replaceAll(/[^A-Z0-9]/g, '');
  return key === '' ? null : key;
}

/** Case-insensitive region key used for matching and rule de-duplication. */
export function regionMatchKey(value: NullableString): string | null {
  return normalizeRegion(value)?.toLowerCase() ?? null;
}

export interface TerritoryGeography {
  country?: string | null;
  region?: string | null;
  postalCode?: string | null;
}

export interface TerritoryRuleCriteria {
  country: string;
  region?: string | null;
  postalPrefix?: string | null;
}

export interface TerritoryCandidate {
  id: string;
  priority: number;
  isActive: boolean;
  isDefault: boolean;
  strategy: TerritoryStrategy;
  createdAt: Date;
  rules: readonly TerritoryRuleCriteria[];
}

/** BR-5: does a single rule match the account's geography? */
export function territoryRuleMatches(
  rule: TerritoryRuleCriteria,
  geo: TerritoryGeography
): boolean {
  const country = normalizeCountry(geo.country);
  if (country === null || country !== normalizeCountry(rule.country)) return false;

  const ruleRegion = regionMatchKey(rule.region);
  if (ruleRegion !== null && regionMatchKey(geo.region) !== ruleRegion) return false;

  const rulePrefix = postalMatchKey(rule.postalPrefix);
  if (rulePrefix !== null) {
    const postal = postalMatchKey(geo.postalCode);
    if (postal === null || !postal.startsWith(rulePrefix)) return false;
  }
  return true;
}

/** BR-6 evaluation order: priority desc, then oldest createdAt, then id. */
export function compareTerritoryEvaluationOrder(
  a: Pick<TerritoryCandidate, 'id' | 'priority' | 'createdAt'>,
  b: Pick<TerritoryCandidate, 'id' | 'priority' | 'createdAt'>
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const byAge = a.createdAt.getTime() - b.createdAt.getTime();
  if (byAge !== 0) return byAge;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export interface TerritoryResolution<T extends TerritoryCandidate = TerritoryCandidate> {
  territory: T;
  matchedBy: 'rule' | 'default';
}

/**
 * BR-6 / BR-7: the highest-priority active territory with a matching rule, else
 * the active default territory, else null.
 */
export function resolveTerritory<T extends TerritoryCandidate>(
  geo: TerritoryGeography,
  territories: readonly T[]
): TerritoryResolution<T> | null {
  const active = territories.filter((t) => t.isActive);
  const matched = active
    .filter((t) => t.rules.some((rule) => territoryRuleMatches(rule, geo)))
    .sort(compareTerritoryEvaluationOrder);
  if (matched.length > 0) return { territory: matched[0], matchedBy: 'rule' };

  const fallback = active.find((t) => t.isDefault);
  return fallback ? { territory: fallback, matchedBy: 'default' } : null;
}

export interface TerritoryMemberRef {
  userId: string;
  sortOrder: number;
}

export type TerritoryCreatorReason = 'no_match' | 'manual' | 'no_eligible_members';

export type TerritoryAssignmentPlan<T extends TerritoryCandidate = TerritoryCandidate> =
  | {
      kind: 'cursor';
      territory: T;
      eligible: string[];
      fallbackFrom: T | null;
      needsCursor: true;
    }
  | {
      kind: 'load';
      territory: T;
      eligible: string[];
      fallbackFrom: T | null;
      needsCursor: false;
    }
  | {
      kind: 'creator';
      reason: TerritoryCreatorReason;
      territory: T | null;
      needsCursor: false;
    };

export interface PlanTerritoryAssignmentInput<T extends TerritoryCandidate> {
  resolution: TerritoryResolution<T> | null;
  /** The tenant's default territory (any state), or null when none is set. */
  defaultTerritory: T | null;
  /** Eligible members (BR-11 tenantUserWhere already applied) by territory id. */
  eligibleByTerritory: ReadonlyMap<string, readonly TerritoryMemberRef[]>;
}

function orderedEligible(members: readonly TerritoryMemberRef[] | undefined): string[] {
  return [...(members ?? [])]
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.userId === b.userId) return 0;
      return a.userId < b.userId ? -1 : 1;
    })
    .map((m) => m.userId);
}

/** Plan for one territory, or null when it has no eligible members. */
function planForTerritory<T extends TerritoryCandidate>(
  territory: T,
  eligibleByTerritory: ReadonlyMap<string, readonly TerritoryMemberRef[]>,
  fallbackFrom: T | null
): TerritoryAssignmentPlan<T> | null {
  const eligible = orderedEligible(eligibleByTerritory.get(territory.id));
  if (eligible.length === 0) return null;
  if (territory.strategy === 'ROUND_ROBIN') {
    return { kind: 'cursor', territory, eligible, fallbackFrom, needsCursor: true };
  }
  return { kind: 'load', territory, eligible, fallbackFrom, needsCursor: false };
}

/**
 * BR-8..BR-11: decide how the owner is picked. Eligibility is computed before
 * any cursor is touched, so a territory without eligible members never consumes
 * a round-robin value. Lower-priority rule matches are never tried.
 */
export function planTerritoryAssignment<T extends TerritoryCandidate>(
  input: PlanTerritoryAssignmentInput<T>
): TerritoryAssignmentPlan<T> {
  const { resolution, defaultTerritory, eligibleByTerritory } = input;
  if (resolution === null) {
    return { kind: 'creator', reason: 'no_match', territory: null, needsCursor: false };
  }

  const winner = resolution.territory;
  if (winner.strategy === 'MANUAL') {
    return { kind: 'creator', reason: 'manual', territory: winner, needsCursor: false };
  }

  const primary = planForTerritory(winner, eligibleByTerritory, null);
  if (primary) return primary;

  const canFallBack =
    defaultTerritory !== null &&
    defaultTerritory.id !== winner.id &&
    defaultTerritory.isActive &&
    defaultTerritory.strategy !== 'MANUAL';
  const fallback = canFallBack
    ? planForTerritory(defaultTerritory, eligibleByTerritory, winner)
    : null;
  return (
    fallback ?? {
      kind: 'creator',
      reason: 'no_eligible_members',
      territory: winner,
      needsCursor: false,
    }
  );
}

export type PickTerritoryAssigneeInput =
  | { kind: 'cursor'; eligible: readonly string[]; cursor: number }
  | { kind: 'load'; eligible: readonly string[]; loadByUser: ReadonlyMap<string, number> }
  | { kind: 'creator' };

/**
 * Pick the assignee for a plan. Round-robin: `eligible[(cursor - 1) mod n]`
 * where `cursor` is the value read back after the atomic increment. Load
 * balance: fewest owned accounts, ties by member order. Returns null when no one
 * is picked (MANUAL / creator plans, or an empty list).
 */
export function pickTerritoryAssignee(input: PickTerritoryAssigneeInput): string | null {
  if (input.kind === 'creator' || input.eligible.length === 0) return null;
  const { eligible } = input;

  if (input.kind === 'cursor') {
    const n = eligible.length;
    const index = (((input.cursor - 1) % n) + n) % n;
    return eligible[index];
  }

  let best = eligible[0];
  let bestLoad = input.loadByUser.get(best) ?? 0;
  for (const userId of eligible.slice(1)) {
    const load = input.loadByUser.get(userId) ?? 0;
    if (load < bestLoad) {
      best = userId;
      bestLoad = load;
    }
  }
  return best;
}
