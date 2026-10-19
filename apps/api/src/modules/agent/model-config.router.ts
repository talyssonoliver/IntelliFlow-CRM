/**
 * Model Config Router - PG-199 (Module Settings: Model Config, ADR-082)
 *
 * Per-tenant model settings for each AI purpose (owner Q1): an allow-listed model
 * pin, an ordered fallback chain, temperature, max tokens and a monthly cost
 * ceiling. Reads are open to the tenant; every mutation needs an AI-settings
 * admin. `prismaWithTenant` does not inject `tenantId`, so every read and write
 * passes it explicitly. Mutations run in one `$transaction` under a per-tenant
 * advisory lock, check per-purpose optimistic-concurrency tokens, and refuse a
 * cheaper model (primary or fallback, owner R2/Q4/Q7) unless the caller
 * acknowledges the downgrade; every change is audited with the actor.
 *
 * The page never writes `tier`: rows it creates carry a NULL tier so each
 * ai-worker caller keeps its own default tier (consensus A1).
 */

import { TRPCError } from '@trpc/server';
import {
  LLM_PURPOSES,
  MODEL_CATALOG,
  MODEL_CONFIG_LIMITS,
  currentPrimaryPrice,
  defaultModelsFor,
  effectiveModel,
  findDowngrades,
  getCatalogEntry,
  priceOf,
  purposeSpendKey,
  purposeSpendPeriod,
  type LLMPurpose,
  type LLMTier,
  type ModelCatalogEntry,
  type ModelDowngrade,
  type PurposeModelPick,
} from '@intelliflow/domain';
import {
  resetModelConfigSchema,
  updateModelConfigSchema,
  type ModelConfigExpected,
  type PurposeConfigInput,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import type { TenantAwareContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import { assertAgentSettingsAdmin, isAgentSettingsAdmin, rethrowConflict } from './settings-shared';

// ─── Types & constants ──────────────────────────────────────────────────────

type ModelConfigCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user' | 'prisma'>;
type ModelConfigTx = Parameters<
  Parameters<ModelConfigCtx['prismaWithTenant']['$transaction']>[0]
>[0];

const SETTINGS_NAME = 'model configuration';

const CONFIG_SELECT = {
  id: true,
  purpose: true,
  tier: true,
  modelId: true,
  fallbackModelIds: true,
  temperature: true,
  maxTokens: true,
  monthlyCostCeilingCents: true,
  rateLimitPerMinute: true,
  updatedAt: true,
} as const;

interface ConfigRow {
  id: string;
  purpose: string;
  tier: string | null;
  modelId: string | null;
  fallbackModelIds: string[];
  temperature: number | null;
  maxTokens: number | null;
  monthlyCostCeilingCents: number | null;
  rateLimitPerMinute: number | null;
  updatedAt: Date;
}

/** The fields the page edits, in a stable order. `tier` is deliberately absent. */
const EDITABLE_FIELDS = [
  'modelId',
  'fallbackModelIds',
  'temperature',
  'maxTokens',
  'monthlyCostCeilingCents',
] as const;
type EditableConfig = Pick<PurposeConfigInput, (typeof EDITABLE_FIELDS)[number]>;

const NO_OVERRIDES: EditableConfig = {
  modelId: null,
  fallbackModelIds: [],
  temperature: null,
  maxTokens: null,
  monthlyCostCeilingCents: null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function editableOf(row: ConfigRow | PurposeConfigInput | undefined): EditableConfig {
  if (!row) return NO_OVERRIDES;
  return {
    modelId: row.modelId,
    fallbackModelIds: [...row.fallbackModelIds],
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    monthlyCostCeilingCents: row.monthlyCostCeilingCents,
  };
}

function sameConfig(a: EditableConfig, b: EditableConfig): boolean {
  return EDITABLE_FIELDS.every((field) => JSON.stringify(a[field]) === JSON.stringify(b[field]));
}

/**
 * The model a purpose runs on for the downgrade check: its pin, else the default of a
 * tier override already stored on the row (rows written before PG-199 may carry one),
 * else unpinned (the caller defaults).
 */
function modelPick(
  purpose: LLMPurpose,
  tier: string | null,
  config: EditableConfig
): PurposeModelPick {
  return {
    modelId: effectiveModel(purpose, tier as LLMTier | null, config.modelId),
    fallbackModelIds: config.fallbackModelIds,
  };
}

/** Serialise every model-config write of one tenant (released at commit/rollback). */
async function lockTenantModelConfig(tx: ModelConfigTx, tenantId: string): Promise<void> {
  const lockKey = 'tenant_ai_config:' + tenantId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

function conflict(purpose: string): TRPCError {
  return new TRPCError({
    code: 'CONFLICT',
    message: `The ${purpose} settings changed since this page loaded. Reload to see the latest.`,
  });
}

/** `expected` is the row's updatedAt the client saw, or null/absent when it saw no row. */
function assertExpected(
  purpose: LLMPurpose,
  row: ConfigRow | undefined,
  expected: ModelConfigExpected
): void {
  const seen = expected[purpose] ?? null;
  const current = row ? row.updatedAt.toISOString() : null;
  if (seen !== current) throw conflict(purpose);
}

function describeDowngrade(d: ModelDowngrade): string {
  const slot = d.slot === 'primary' ? 'primary' : `fallback ${d.slot + 1}`;
  return `${d.purpose} ${slot} ${d.from ?? 'default'} → ${d.to ?? 'default'}`;
}

function assertAcknowledged(downgrades: ModelDowngrade[], acknowledged: boolean): void {
  if (downgrades.length === 0 || acknowledged) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `DOWNGRADE_UNCONFIRMED: ${downgrades.map(describeDowngrade).join('; ')}`,
  });
}

/** Primary model changed to one priced exactly like the current one (owner Q7: lateral). */
function isLateralChange(
  purpose: LLMPurpose,
  tier: string | null,
  before: EditableConfig,
  after: EditableConfig
): boolean {
  if (before.modelId === after.modelId || after.modelId === null) return false;
  const current = modelPick(purpose, tier, before).modelId;
  return priceOf(after.modelId) === currentPrimaryPrice(purpose, current);
}

function logModelConfigAudit(
  ctx: ModelConfigCtx,
  resourceId: string,
  state: {
    eventType: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): void {
  // Purposes, catalog ids, prices and numbers only — no prompts or tenant data.
  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'model_config', resourceId, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      ...state,
    })
    .catch((err: unknown) => console.error('[model-config.router] Audit log failed:', err));
}

/** Month-to-date spend per purpose in hundredths of a cent; null when it cannot be read. */
async function readSpend(
  ctx: ModelConfigCtx,
  tenantId: string,
  period: string
): Promise<Map<string, number> | null> {
  try {
    const rows = await ctx.prismaWithTenant.tenantUsageCounter.findMany({
      where: { tenantId, period, key: { in: LLM_PURPOSES.map(purposeSpendKey) } },
      select: { key: true, value: true },
    });
    return new Map(rows.map((row) => [row.key, row.value]));
  } catch (err) {
    console.error('[model-config.router] Spend read failed; showing spend as unknown:', err);
    return null;
  }
}

function isRetired(row: ConfigRow | undefined): boolean {
  if (!row) return false;
  const ids = row.modelId ? [row.modelId, ...row.fallbackModelIds] : row.fallbackModelIds;
  return ids.some((id) => !getCatalogEntry(id));
}

function toPurposeRow(
  purpose: LLMPurpose,
  row: ConfigRow | undefined,
  spend: Map<string, number> | null
) {
  const config = editableOf(row);
  const spentCentiCents = spend ? (spend.get(purposeSpendKey(purpose)) ?? 0) : null;
  const ceiling = config.monthlyCostCeilingCents;
  return {
    purpose,
    ...config,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    defaultModelIds: defaultModelsFor(purpose),
    spentCents: spentCentiCents === null ? null : spentCentiCents / 100,
    blocked: ceiling !== null && spentCentiCents !== null && spentCentiCents >= ceiling * 100,
    retired: isRetired(row),
    locked: purpose === 'rag',
  };
}

function toCatalogModel(entry: ModelCatalogEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    purposes: [...entry.purposes],
    price: priceOf(entry.id) ?? 0,
    priceMicroUsdPer1k: { ...entry.priceMicroUsdPer1k },
    onOpenRouter: Boolean(entry.providers.openrouter),
    dimensions: entry.dimensions ?? null,
    deprecated: entry.deprecated === true,
  };
}

async function readRows(tx: ModelConfigTx, tenantId: string, purposes?: LLMPurpose[]) {
  const where = purposes ? { tenantId, purpose: { in: purposes } } : { tenantId };
  const rows = (await tx.tenantAIConfig.findMany({ where, select: CONFIG_SELECT })) as ConfigRow[];
  return new Map(rows.map((row) => [row.purpose, row]));
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const modelConfigRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const period = purposeSpendPeriod();
    const rows = (await ctx.prismaWithTenant.tenantAIConfig.findMany({
      where: { tenantId },
      select: CONFIG_SELECT,
    })) as ConfigRow[];
    const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
    const spend = await readSpend(ctx, tenantId, period);
    return {
      purposes: LLM_PURPOSES.map((purpose) => toPurposeRow(purpose, byPurpose.get(purpose), spend)),
      catalog: MODEL_CATALOG.map(toCatalogModel),
      limits: MODEL_CONFIG_LIMITS,
      period,
      canManage: isAgentSettingsAdmin(ctx.user?.role),
    };
  }),

  update: tenantProcedure.input(updateModelConfigSchema).mutation(async ({ ctx, input }) => {
    assertAgentSettingsAdmin(ctx, SETTINGS_NAME);
    const tenantId = ctx.tenant.tenantId;

    let changes: {
      purpose: LLMPurpose;
      before: EditableConfig;
      after: EditableConfig;
      row: ConfigRow;
      downgrades: ModelDowngrade[];
      lateral: boolean;
    }[];
    try {
      changes = await ctx.prismaWithTenant.$transaction(async (tx) => {
        await lockTenantModelConfig(tx, tenantId);
        const existing = await readRows(
          tx,
          tenantId,
          input.purposes.map((p) => p.purpose)
        );

        const pending = input.purposes
          .map((item) => {
            const row = existing.get(item.purpose);
            assertExpected(item.purpose, row, input.expected);
            const before = editableOf(row);
            const after = editableOf(item);
            // An update never writes `tier`, so an existing override stays on both sides.
            return { purpose: item.purpose, tier: row?.tier ?? null, before, after };
          })
          .filter(({ before, after }) => !sameConfig(before, after));

        const downgrades = pending.flatMap(({ purpose, tier, before, after }) =>
          findDowngrades(purpose, modelPick(purpose, tier, before), modelPick(purpose, tier, after))
        );
        assertAcknowledged(downgrades, input.acknowledgeDowngrade === true);

        const written = [];
        for (const { purpose, tier, before, after } of pending) {
          const row = (await tx.tenantAIConfig.upsert({
            where: { tenantId_purpose: { tenantId, purpose } },
            create: { tenantId, purpose, tier: null, ...after },
            update: { ...after },
          })) as ConfigRow;
          written.push({
            purpose,
            before,
            after,
            row,
            downgrades: downgrades.filter((d) => d.purpose === purpose),
            lateral: isLateralChange(purpose, tier, before, after),
          });
        }
        return written;
      });
    } catch (err) {
      rethrowConflict(
        err,
        'Another admin saved model settings at the same time. Reload and try again.'
      );
    }

    for (const change of changes) {
      const downgrade = change.downgrades.length > 0;
      logModelConfigAudit(ctx, change.row.id, {
        eventType: downgrade ? 'ModelConfigDowngraded' : 'ModelConfigUpdated',
        beforeState: { purpose: change.purpose, ...change.before },
        afterState: { purpose: change.purpose, ...change.after },
        metadata: { downgrade, lateral: change.lateral, downgrades: change.downgrades },
      });
    }

    return {
      updated: changes.map((c) => c.purpose),
      updatedAt: Object.fromEntries(changes.map((c) => [c.purpose, c.row.updatedAt.toISOString()])),
    };
  }),

  /**
   * Back to platform defaults: rows that only exist for this page are deleted; rows
   * that also carry a rate-limit override keep it and lose every other override.
   */
  resetToDefaults: tenantProcedure
    .input(resetModelConfigSchema)
    .mutation(async ({ ctx, input }) => {
      assertAgentSettingsAdmin(ctx, SETTINGS_NAME);
      const tenantId = ctx.tenant.tenantId;

      const outcome = await ctx.prismaWithTenant.$transaction(async (tx) => {
        await lockTenantModelConfig(tx, tenantId);
        const existing = await readRows(tx, tenantId);
        for (const purpose of LLM_PURPOSES) {
          const seen = input.expected[purpose] ?? null;
          const row = existing.get(purpose);
          if (seen !== null || row) assertExpected(purpose, row, input.expected);
        }
        if (existing.size === 0) return null;

        const downgrades = [...existing.values()].flatMap((row) =>
          findDowngrades(
            row.purpose as LLMPurpose,
            modelPick(row.purpose as LLMPurpose, row.tier, editableOf(row)),
            // Reset clears the tier too.
            modelPick(row.purpose as LLMPurpose, null, NO_OVERRIDES)
          )
        );
        assertAcknowledged(downgrades, input.acknowledgeDowngrade === true);

        await tx.tenantAIConfig.deleteMany({ where: { tenantId, rateLimitPerMinute: null } });
        await tx.tenantAIConfig.updateMany({
          where: { tenantId, rateLimitPerMinute: { not: null } },
          data: { tier: null, ...NO_OVERRIDES },
        });
        return {
          purposes: [...existing.keys()],
          before: [...existing.values()].map((row) => ({
            purpose: row.purpose,
            ...editableOf(row),
          })),
          downgrades,
        };
      });

      if (!outcome) return { reset: 0 };
      logModelConfigAudit(ctx, tenantId, {
        eventType: 'ModelConfigReset',
        beforeState: { purposes: outcome.before },
        metadata: { downgrade: outcome.downgrades.length > 0, downgrades: outcome.downgrades },
      });
      return { reset: outcome.purposes.length };
    }),
});
