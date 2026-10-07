/**
 * Account Tiers Router - PG-196 (ADR-073)
 *
 * Tenant-configurable revenue tiers for accounts: tier definitions, the
 * default tier for accounts without revenue, and the up/down notification
 * rules. Reads are open to every tenant member (the account list, sidebar and
 * account pages all render tiers); writes are ADMIN-only because changing a
 * threshold re-tiers every account of the tenant.
 *
 * Writes replace the tenant's tier rows inside one transaction, guarded by an
 * optimistic check on the configuration row's `updatedAt`. Deleting and
 * recreating the rows (they are referenced only by key strings) lets two tiers
 * swap thresholds without colliding on the (tenantId, minRevenue) unique index.
 */

import { TRPCError } from '@trpc/server';
import {
  DEFAULT_TIER_CONFIG,
  validateTierConfig,
  type TierConfig,
  type TierDefinition,
} from '@intelliflow/domain';
import {
  generateTierKey,
  normalizeLegacyTierValue,
  updateAccountTiersSchema,
  type UpdateAccountTiersInput,
} from '@intelliflow/validators';
import { adminTenantProcedure, createTRPCRouter, tenantProcedure } from '../../trpc';
import { getAuditLogger } from '../../security/audit-logger';
import {
  loadAccountTierConfig,
  normalizeRequiredTiers,
  type LoadedTierConfig,
} from './account-tiers';

export interface AccountTiersView {
  tiers: Array<{
    key: string;
    label: string;
    minRevenue: number;
    colorToken: string;
    benefits: string[];
    sortOrder: number;
  }>;
  defaultTierKey: string | null;
  notifyOwnerOnUpgrade: boolean;
  notifyOwnerOnDowngrade: boolean;
  /** ISO timestamp of the configuration row; null while the tenant uses defaults. */
  updatedAt: string | null;
  isDefault: boolean;
  /** Whether the caller may change tiers (ADMIN). */
  canManage: boolean;
}

/** Highest tier first — the order the settings page and sidebar show. */
function toView(loaded: LoadedTierConfig, canManage: boolean): AccountTiersView {
  const ordered = [...loaded.config.tiers].sort((a, b) => b.minRevenue - a.minRevenue);
  return {
    tiers: ordered.map((t, index) => ({
      key: t.key,
      label: t.label,
      minRevenue: t.minRevenue,
      colorToken: t.colorToken,
      benefits: [...t.benefits],
      sortOrder: index,
    })),
    defaultTierKey: loaded.config.defaultTierKey,
    notifyOwnerOnUpgrade: loaded.notifyOwnerOnUpgrade,
    notifyOwnerOnDowngrade: loaded.notifyOwnerOnDowngrade,
    updatedAt: loaded.updatedAt ? loaded.updatedAt.toISOString() : null,
    isDefault: loaded.isDefault,
    canManage,
  };
}

function isAdmin(ctx: { user?: { role?: string } | null }): boolean {
  return ctx.user?.role === 'ADMIN';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

const conflict = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: 'Account tiers were changed by someone else. Reload to see the latest tiers.',
  });

/** Give new rows a stable key derived from their label, then build the domain config. */
function buildConfig(input: UpdateAccountTiersInput): TierConfig {
  const usedKeys = input.tiers.map((t) => t.key).filter((k): k is string => k !== undefined);
  const tiers: TierDefinition[] = input.tiers.map((t) => {
    const key = t.key ?? generateTierKey(t.label, usedKeys);
    if (t.key === undefined) usedKeys.push(key);
    return {
      key,
      label: t.label,
      minRevenue: t.minRevenue,
      colorToken: t.colorToken,
      benefits: t.benefits,
    };
  });
  return { tiers, defaultTierKey: input.defaultTierKey };
}

/** requireParentForTiers without the given keys (compared in normalised form). */
function withoutKeys(values: readonly string[], removed: ReadonlySet<string>): string[] {
  return values.filter((v) => !removed.has(normalizeLegacyTierValue(v)));
}

/** Keys and thresholds only — tier names are free text and stay out of the audit trail. */
function auditSummary(config: TierConfig) {
  return {
    tiers: config.tiers.map((t) => ({ key: t.key, minRevenue: t.minRevenue })),
    defaultTierKey: config.defaultTierKey,
  };
}

function logTierAudit(
  ctx: { prisma: Parameters<typeof getAuditLogger>[0] },
  tenantId: string,
  actorId: string,
  beforeState: object,
  afterState: object
): void {
  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'account', 'tier-config', tenantId, {
      actorId,
      beforeState: beforeState as Record<string, unknown>,
      afterState: afterState as Record<string, unknown>,
    })
    .catch((err: unknown) => console.error('[account-tiers.router] Audit log failed:', err));
}

export const accountTiersRouter = createTRPCRouter({
  /** Tenant tier configuration (defaults in memory when the tenant has none). */
  get: tenantProcedure.query(async ({ ctx }) => {
    const loaded = await loadAccountTierConfig(ctx.prismaWithTenant, ctx.tenant.tenantId);
    return toView(loaded, isAdmin(ctx));
  }),

  /** Replace the tenant's tiers, default tier and rules (ADMIN). */
  update: adminTenantProcedure.input(updateAccountTiersSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const db = ctx.prismaWithTenant;
    const config = buildConfig(input);

    const validation = validateTierConfig(config);
    if (validation.isFailure) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: validation.error.message });
    }

    const [before, hierarchy] = await Promise.all([
      loadAccountTierConfig(db, tenantId),
      db.accountHierarchyConfig.findUnique({ where: { tenantId } }),
    ]);
    const requiredTiers = hierarchy?.requireParentForTiers ?? [];
    if (config.defaultTierKey && normalizeRequiredTiers(requiredTiers).has(config.defaultTierKey)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'The default tier cannot be a tier that requires a parent account (Account Settings → Hierarchy).',
      });
    }

    const newKeys = new Set(config.tiers.map((t) => t.key));
    const removedKeys = new Set(
      before.config.tiers.map((t) => t.key).filter((key) => !newKeys.has(key))
    );
    const rules = {
      defaultTierKey: config.defaultTierKey,
      notifyOwnerOnUpgrade: input.notifyOwnerOnUpgrade,
      notifyOwnerOnDowngrade: input.notifyOwnerOnDowngrade,
    };

    try {
      await db.$transaction(async (tx) => {
        if (input.expectedUpdatedAt === null) {
          await tx.accountTierConfig.create({ data: { tenantId, ...rules } });
        } else {
          const { count } = await tx.accountTierConfig.updateMany({
            where: { tenantId, updatedAt: new Date(input.expectedUpdatedAt) },
            data: { ...rules, updatedAt: new Date() },
          });
          if (count === 0) throw conflict();
        }
        await tx.accountTierDefinition.deleteMany({ where: { tenantId } });
        await tx.accountTierDefinition.createMany({
          data: config.tiers.map((t, index) => ({
            tenantId,
            key: t.key,
            label: t.label,
            minRevenue: t.minRevenue,
            colorToken: t.colorToken,
            benefits: [...t.benefits],
            sortOrder: index,
          })),
        });
        const pruned = withoutKeys(requiredTiers, removedKeys);
        if (hierarchy && pruned.length !== requiredTiers.length) {
          await tx.accountHierarchyConfig.update({
            where: { tenantId },
            data: { requireParentForTiers: pruned },
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict();
      throw error;
    }

    logTierAudit(
      ctx,
      tenantId,
      ctx.tenant.userId,
      auditSummary(before.config),
      auditSummary(config)
    );
    return toView(await loadAccountTierConfig(db, tenantId), true);
  }),

  /** Back to the built-in tiers: delete the tenant's rows (ADMIN). */
  resetToDefaults: adminTenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const db = ctx.prismaWithTenant;
    const [before, hierarchy] = await Promise.all([
      loadAccountTierConfig(db, tenantId),
      db.accountHierarchyConfig.findUnique({ where: { tenantId } }),
    ]);
    const defaultKeys = new Set<string>(DEFAULT_TIER_CONFIG.tiers.map((t) => t.key));
    const requiredTiers = hierarchy?.requireParentForTiers ?? [];
    const customKeys = new Set(
      [...normalizeRequiredTiers(requiredTiers)].filter((key) => {
        const wasTier = before.config.tiers.some((t) => t.key === key);
        return wasTier && !defaultKeys.has(key);
      })
    );

    await db.$transaction(async (tx) => {
      await tx.accountTierDefinition.deleteMany({ where: { tenantId } });
      await tx.accountTierConfig.deleteMany({ where: { tenantId } });
      const pruned = withoutKeys(requiredTiers, customKeys);
      if (hierarchy && pruned.length !== requiredTiers.length) {
        await tx.accountHierarchyConfig.update({
          where: { tenantId },
          data: { requireParentForTiers: pruned },
        });
      }
    });

    logTierAudit(
      ctx,
      tenantId,
      ctx.tenant.userId,
      auditSummary(before.config),
      auditSummary(DEFAULT_TIER_CONFIG)
    );
    return toView(await loadAccountTierConfig(db, tenantId), true);
  }),
});
