/**
 * Account Territories Router - PG-197 (Module Settings: Territory Mapping)
 *
 * Territories decide who owns new accounts (ADR-074), so every mutation is
 * restricted to ACCOUNT_OWNER_ADMIN_ROLES — deliberately stricter than the
 * PG-183 settings router. `prismaWithTenant` does not inject `tenantId`, so
 * every read and write passes it explicitly (BR-21).
 */

import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import { TERRITORY_LIMITS, resolveTerritory } from '@intelliflow/domain';
import {
  createTerritorySchema,
  updateTerritorySchema,
  deleteTerritorySchema,
  reorderTerritoriesSchema,
  setDefaultTerritorySchema,
  territoryPreviewSchema,
  type CreateTerritoryInput,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import type { TenantAwareContext } from '../../security/tenant-context';
import { loadAccountAutomation } from './account-automation';
import { isAccountOwnerAdmin, toTerritoryStrategy } from './account-territory-assignment';

// ─── Helpers ────────────────────────────────────────────────────────────────

type TerritoryCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user'>;
type TerritoryTx = Parameters<Parameters<TerritoryCtx['prismaWithTenant']['$transaction']>[0]>[0];

function assertTerritoryAdmin(ctx: Pick<TerritoryCtx, 'user'>): void {
  if (isAccountOwnerAdmin(ctx.user?.role)) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only admins and managers can change territories.',
  });
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === 'P2002';
}

function rethrowTerritoryWriteError(err: unknown, name: string): never {
  if (isUniqueConstraintError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A territory named "${name}" already exists. Choose a different name.`,
    });
  }
  throw err;
}

const territoryInclude = {
  rules: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, country: true, region: true, postalPrefix: true, sortOrder: true },
  },
  members: {
    orderBy: [{ sortOrder: 'asc' as const }, { userId: 'asc' as const }],
    select: {
      userId: true,
      sortOrder: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  },
};

// BR-6 evaluation order: priority desc, oldest first, then id.
const evaluationOrder = [
  { priority: 'desc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

interface TerritoryRow {
  id: string;
  name: string;
  description: string | null;
  colorToken: string;
  priority: number;
  strategy: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rules: {
    id: string;
    country: string;
    region: string | null;
    postalPrefix: string | null;
    sortOrder: number;
  }[];
  members: {
    userId: string;
    sortOrder: number;
    user: { id: string; name: string | null; email: string; avatarUrl: string | null };
  }[];
}

function toTerritoryDto(row: TerritoryRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    colorToken: row.colorToken,
    priority: row.priority,
    strategy: toTerritoryStrategy(row.strategy),
    isDefault: row.isDefault,
    isActive: row.isActive,
    rules: row.rules.map((r) => ({
      id: r.id,
      country: r.country,
      region: r.region,
      postalPrefix: r.postalPrefix,
    })),
    members: row.members.map((m) => ({
      userId: m.userId,
      name: m.user.name ?? m.user.email,
      avatar: m.user.avatarUrl,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type TerritoryDto = ReturnType<typeof toTerritoryDto>;

/** BR-12: every member must be a user of the tenant. */
async function assertMembersInTenant(ctx: TerritoryCtx, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const users = await ctx.prismaWithTenant.user.findMany({
    where: { id: { in: memberIds }, ...tenantUserWhere(ctx.tenant.tenantId) },
    select: { id: true },
  });
  if (users.length !== new Set(memberIds).size) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Every member must be a user of this workspace.',
    });
  }
}

/** BR-4: a non-default territory needs at least one rule. */
function assertHasRules(rules: unknown[], isDefault: boolean): void {
  if (isDefault || rules.length > 0) return;
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Add at least one rule. Only the default territory can have no rules.',
  });
}

async function findOwnedTerritory(ctx: TerritoryCtx, id: string) {
  const existing = await ctx.prismaWithTenant.accountTerritory.findFirst({
    where: { id, tenantId: ctx.tenant.tenantId },
    select: { id: true, name: true, isDefault: true, isActive: true },
  });
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Territory not found' });
  }
  return existing;
}

/** Replace a territory's rules and members inside the caller's transaction. */
async function writeRulesAndMembers(
  tx: TerritoryTx,
  tenantId: string,
  territoryId: string,
  input: Pick<CreateTerritoryInput, 'rules' | 'memberIds'>
): Promise<void> {
  await tx.accountTerritoryRule.deleteMany({ where: { tenantId, territoryId } });
  await tx.accountTerritoryMember.deleteMany({ where: { tenantId, territoryId } });
  if (input.rules.length > 0) {
    await tx.accountTerritoryRule.createMany({
      data: input.rules.map((rule, sortOrder) => ({
        tenantId,
        territoryId,
        country: rule.country,
        region: rule.region ?? null,
        postalPrefix: rule.postalPrefix ?? null,
        sortOrder,
      })),
    });
  }
  if (input.memberIds.length > 0) {
    await tx.accountTerritoryMember.createMany({
      data: input.memberIds.map((userId, sortOrder) => ({
        tenantId,
        territoryId,
        userId,
        sortOrder,
      })),
    });
  }
}

/** BR-4/BR-7: the current default cannot be left rule-less as a non-default. */
async function assertCurrentDefaultCanStepDown(
  ctx: TerritoryCtx,
  nextDefaultId: string | null
): Promise<void> {
  const current = await ctx.prismaWithTenant.accountTerritory.findFirst({
    where: { tenantId: ctx.tenant.tenantId, isDefault: true },
    select: { id: true, name: true, _count: { select: { rules: true } } },
  });
  if (!current || current.id === nextDefaultId || current._count.rules > 0) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Add a rule to ${current.name} first — only the default territory can have no rules.`,
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const accountTerritoriesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const [rows, flags] = await Promise.all([
      ctx.prismaWithTenant.accountTerritory.findMany({
        where: { tenantId },
        include: territoryInclude,
        orderBy: evaluationOrder,
      }),
      loadAccountAutomation(ctx),
    ]);
    return {
      territories: rows.map(toTerritoryDto),
      autoAssignOwner: flags.autoAssignOwner,
      limits: TERRITORY_LIMITS,
    };
  }),

  create: tenantProcedure.input(createTerritorySchema).mutation(async ({ ctx, input }) => {
    assertTerritoryAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    assertHasRules(input.rules, false);

    const count = await ctx.prismaWithTenant.accountTerritory.count({ where: { tenantId } });
    if (count >= TERRITORY_LIMITS.maxTerritoriesPerTenant) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A workspace can have at most ${TERRITORY_LIMITS.maxTerritoriesPerTenant} territories.`,
      });
    }
    await assertMembersInTenant(ctx, input.memberIds);

    // A new territory is evaluated last; reorder moves it.
    const lowest = await ctx.prismaWithTenant.accountTerritory.findFirst({
      where: { tenantId },
      orderBy: { priority: 'asc' },
      select: { priority: true },
    });

    try {
      const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
        const created = await tx.accountTerritory.create({
          data: {
            tenantId,
            name: input.name,
            description: input.description ?? null,
            colorToken: input.colorToken,
            strategy: input.strategy,
            isActive: input.isActive,
            priority: lowest ? lowest.priority - 1 : 0,
          },
          select: { id: true },
        });
        await writeRulesAndMembers(tx, tenantId, created.id, input);
        return tx.accountTerritory.findFirstOrThrow({
          where: { id: created.id, tenantId },
          include: territoryInclude,
        });
      });
      return toTerritoryDto(row);
    } catch (err) {
      rethrowTerritoryWriteError(err, input.name);
    }
  }),

  update: tenantProcedure.input(updateTerritorySchema).mutation(async ({ ctx, input }) => {
    assertTerritoryAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    const existing = await findOwnedTerritory(ctx, input.id);
    if (existing.isDefault && !input.isActive) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The default territory must stay active. Choose another default first.',
      });
    }
    assertHasRules(input.rules, existing.isDefault);
    await assertMembersInTenant(ctx, input.memberIds);

    try {
      const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.accountTerritory.update({
          where: { tenantId_id: { tenantId, id: input.id } },
          data: {
            name: input.name,
            description: input.description ?? null,
            colorToken: input.colorToken,
            strategy: input.strategy,
            isActive: input.isActive,
          },
        });
        await writeRulesAndMembers(tx, tenantId, input.id, input);
        return tx.accountTerritory.findFirstOrThrow({
          where: { id: input.id, tenantId },
          include: territoryInclude,
        });
      });
      return toTerritoryDto(row);
    } catch (err) {
      rethrowTerritoryWriteError(err, input.name);
    }
  }),

  delete: tenantProcedure.input(deleteTerritorySchema).mutation(async ({ ctx, input }) => {
    assertTerritoryAdmin(ctx);
    const existing = await findOwnedTerritory(ctx, input.id);
    if (existing.isDefault) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The default territory cannot be deleted. Choose another default first.',
      });
    }
    // Rules and members cascade. Existing account owners are never touched.
    await ctx.prismaWithTenant.accountTerritory.deleteMany({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
    return { success: true as const };
  }),

  reorder: tenantProcedure.input(reorderTerritoriesSchema).mutation(async ({ ctx, input }) => {
    assertTerritoryAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.accountTerritory.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const owned = new Set(existing.map((t) => t.id));
    if (input.ids.some((id) => !owned.has(id))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Territory not found' });
    }
    if (new Set(input.ids).size !== input.ids.length || input.ids.length !== owned.size) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Reorder needs every territory exactly once.',
      });
    }

    const total = input.ids.length;
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      for (const [index, id] of input.ids.entries()) {
        await tx.accountTerritory.updateMany({
          where: { id, tenantId },
          data: { priority: total - index },
        });
      }
    });
    return { success: true as const };
  }),

  setDefault: tenantProcedure.input(setDefaultTerritorySchema).mutation(async ({ ctx, input }) => {
    assertTerritoryAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    if (input.id !== null) {
      const target = await findOwnedTerritory(ctx, input.id);
      if (!target.isActive) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Activate ${target.name} before making it the default.`,
        });
      }
    }
    await assertCurrentDefaultCanStepDown(ctx, input.id);

    // Clear then set inside one transaction (partial unique index: one default).
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.accountTerritory.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      if (input.id !== null) {
        await tx.accountTerritory.updateMany({
          where: { id: input.id, tenantId },
          data: { isDefault: true },
        });
      }
    });
    return { success: true as const };
  }),

  /** "Test an address" — read-only; never moves the round-robin cursor. */
  preview: tenantProcedure.input(territoryPreviewSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.prismaWithTenant.accountTerritory.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      include: { rules: { select: { country: true, region: true, postalPrefix: true } } },
    });
    const resolution = resolveTerritory(
      input,
      rows.map((row) => ({ ...row, strategy: toTerritoryStrategy(row.strategy) }))
    );
    if (!resolution) {
      return { territoryId: null, territoryName: null, strategy: null, matchedBy: 'none' as const };
    }
    return {
      territoryId: resolution.territory.id,
      territoryName: resolution.territory.name,
      strategy: resolution.territory.strategy,
      matchedBy: resolution.matchedBy,
    };
  }),

  /** BR-22: delete every territory; account owners and autoAssignOwner untouched. */
  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertTerritoryAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.accountTerritory.deleteMany({ where: { tenantId } });
    });
    return { success: true as const };
  }),
});
