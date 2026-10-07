/**
 * PG-197 — territory-based account owner assignment (ADR-074, BR-8..BR-15).
 *
 * The runtime consumer of the `autoAssignOwner` toggle. The pure decision lives
 * in the domain engine (resolveTerritory → planTerritoryAssignment →
 * pickTerritoryAssignee); this module does the tenant-scoped reads and the
 * atomic round-robin cursor between the stages.
 */

import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import {
  ACCOUNT_OWNER_ADMIN_ROLES,
  TERRITORY_STRATEGIES,
  pickTerritoryAssignee,
  planTerritoryAssignment,
  resolveTerritory,
  type TerritoryCandidate,
  type TerritoryCreatorReason,
  type TerritoryGeography,
  type TerritoryMemberRef,
  type TerritoryStrategy,
} from '@intelliflow/domain';
import type { TenantAwareContext } from '../../security/tenant-context';

const ACCOUNT_OWNER_ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ACCOUNT_OWNER_ADMIN_ROLES);

/** True when the role may choose owners explicitly and manage territories. */
export function isAccountOwnerAdmin(role: string | null | undefined): boolean {
  return ACCOUNT_OWNER_ADMIN_ROLE_SET.has(role ?? '');
}

export type AccountOwnerSource = 'explicit' | 'territory' | 'creator';

export interface AccountOwnerResolution {
  ownerId: string;
  ownerSource: AccountOwnerSource;
  territoryId?: string;
  strategy?: TerritoryStrategy;
  /** Set when the decision fell back (or territory resolution failed). */
  reason?: TerritoryCreatorReason | 'resolution_failed';
  /** The rule-matched territory whose members were all ineligible (BR-11). */
  fallbackFromTerritoryId?: string;
}

/**
 * BR-13 steps (1)-(2): an explicit owner other than the caller needs an admin
 * role — checked before any user lookup so non-admins cannot probe user ids —
 * and must be a user of the tenant.
 */
export async function assertExplicitOwner(
  typedCtx: TenantAwareContext,
  ownerId: string
): Promise<void> {
  const callerId = typedCtx.tenant.userId;
  if (ownerId !== callerId && !isAccountOwnerAdmin(typedCtx.user?.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only admins and managers can choose the owner of a new account.',
    });
  }
  const owner = await typedCtx.prismaWithTenant.user.findFirst({
    where: { id: ownerId, ...tenantUserWhere(typedCtx.tenant.tenantId) },
    select: { id: true },
  });
  if (!owner) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The selected owner is not a member of this workspace.',
    });
  }
}

/** Narrow a stored strategy (SQL CHECK-constrained) to the domain union. */
export function toTerritoryStrategy(value: string): TerritoryStrategy {
  return TERRITORY_STRATEGIES.find((strategy) => strategy === value) ?? 'MANUAL';
}

interface LoadedTerritory extends TerritoryCandidate {
  members: TerritoryMemberRef[];
}

async function loadActiveTerritories(
  typedCtx: TenantAwareContext,
  tenantId: string
): Promise<LoadedTerritory[]> {
  const rows = await typedCtx.prismaWithTenant.accountTerritory.findMany({
    where: { tenantId, isActive: true },
    include: {
      rules: { select: { country: true, region: true, postalPrefix: true } },
      members: { select: { userId: true, sortOrder: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    priority: row.priority,
    isActive: row.isActive,
    isDefault: row.isDefault,
    strategy: toTerritoryStrategy(row.strategy),
    createdAt: row.createdAt,
    rules: row.rules,
    members: row.members,
  }));
}

/** BR-11 eligibility: members passing tenantUserWhere, grouped by territory. */
async function loadEligibleMembers(
  typedCtx: TenantAwareContext,
  tenantId: string,
  territories: readonly LoadedTerritory[]
): Promise<Map<string, TerritoryMemberRef[]>> {
  const memberIds = [...new Set(territories.flatMap((t) => t.members.map((m) => m.userId)))];
  const eligibleUsers =
    memberIds.length === 0
      ? []
      : await typedCtx.prismaWithTenant.user.findMany({
          where: { id: { in: memberIds }, ...tenantUserWhere(tenantId) },
          select: { id: true },
        });
  const eligibleIds = new Set(eligibleUsers.map((u) => u.id));
  return new Map(
    territories.map((t) => [t.id, t.members.filter((m) => eligibleIds.has(m.userId))])
  );
}

async function nextRoundRobinCursor(
  typedCtx: TenantAwareContext,
  tenantId: string,
  territoryId: string
): Promise<number> {
  // One UPDATE … RETURNING: the row lock serialises concurrent creates (BR-8).
  const { rrCursor } = await typedCtx.prismaWithTenant.accountTerritory.update({
    where: { tenantId_id: { tenantId, id: territoryId } },
    data: { rrCursor: { increment: 1 } },
    select: { rrCursor: true },
  });
  return rrCursor;
}

async function loadAccountCounts(
  typedCtx: TenantAwareContext,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, number>> {
  const groups = await typedCtx.prismaWithTenant.account.groupBy({
    by: ['ownerId'],
    where: { tenantId, ownerId: { in: userIds } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.ownerId, g._count._all]));
}

async function resolveByTerritory(
  typedCtx: TenantAwareContext,
  geo: TerritoryGeography,
  creatorId: string
): Promise<AccountOwnerResolution> {
  const tenantId = typedCtx.tenant.tenantId;
  const territories = await loadActiveTerritories(typedCtx, tenantId);
  const resolution = resolveTerritory(geo, territories);
  const plan = planTerritoryAssignment({
    resolution,
    defaultTerritory: territories.find((t) => t.isDefault) ?? null,
    eligibleByTerritory:
      resolution === null ? new Map() : await loadEligibleMembers(typedCtx, tenantId, territories),
  });

  if (plan.kind === 'creator') {
    return {
      ownerId: creatorId,
      ownerSource: 'creator',
      reason: plan.reason,
      ...(plan.territory
        ? { territoryId: plan.territory.id, strategy: plan.territory.strategy }
        : {}),
    };
  }

  const assignee =
    plan.kind === 'cursor'
      ? pickTerritoryAssignee({
          kind: 'cursor',
          eligible: plan.eligible,
          cursor: await nextRoundRobinCursor(typedCtx, tenantId, plan.territory.id),
        })
      : pickTerritoryAssignee({
          kind: 'load',
          eligible: plan.eligible,
          loadByUser: await loadAccountCounts(typedCtx, tenantId, plan.eligible),
        });

  return {
    ownerId: assignee ?? creatorId,
    ownerSource: assignee ? 'territory' : 'creator',
    territoryId: plan.territory.id,
    strategy: plan.territory.strategy,
    ...(plan.fallbackFrom
      ? { reason: 'no_eligible_members' as const, fallbackFromTerritoryId: plan.fallbackFrom.id }
      : {}),
  };
}

/**
 * BR-13 step (5): pick the owner of a new account from the matching territory.
 * Never fails the create (BR-15): any error falls back to the creator.
 */
export async function resolveAccountOwner(
  typedCtx: TenantAwareContext,
  args: { geo: TerritoryGeography; creatorId: string }
): Promise<AccountOwnerResolution> {
  try {
    return await resolveByTerritory(typedCtx, args.geo, args.creatorId);
  } catch (error) {
    console.warn('[account.territory] owner resolution failed, assigning the creator:', error);
    return { ownerId: args.creatorId, ownerSource: 'creator', reason: 'resolution_failed' };
  }
}
