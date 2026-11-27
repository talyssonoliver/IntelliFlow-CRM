/**
 * What the AI Chains settings page shows (IFC-086): the configuration each chain type runs with
 * (getEffective) and its usage (getUsageStats). Kept apart from chain-version.router.ts, which
 * manages versions, and merged into the chainVersion router, so the API paths are unchanged.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { describeChainUsage, describeEffectiveChains } from '@intelliflow/application';
import { tenantProcedure } from '../../trpc';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';

/** The chain version repository: its findActive is the version the ai-worker runs. */
function getChainVersionRepository(ctx: Context) {
  const repository = ctx.adapters?.chainVersionRepository;
  if (!repository) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'ChainVersion repository not initialized. Check container wiring.',
    });
  }
  return repository;
}

export const chainUsageProcedures = {
  /**
   * The configuration every chain type actually runs with for the caller's tenant: the saved,
   * active version, or the built-in one ("Built-in v1"). Never empty.
   * SECURITY: Uses tenantProcedure; every lookup is by the caller's tenant.
   */
  getEffective: tenantProcedure.query(async ({ ctx }) => {
    const versions = getChainVersionRepository(ctx);
    const { tenantId } = getTenantContext(ctx).tenant;
    const db = getTenantContext(ctx).prismaWithTenant;

    return describeEffectiveChains({
      // The ACTIVE version, as the ai-worker reads it. The worker's version service has no
      // feature flags, so a PERCENTAGE rollout below 100% still runs the ACTIVE version there;
      // the flag-aware ChainVersionService.findActiveVersion could name an older DEPRECATED one.
      savedVersion: async (chainType) => {
        const version = await versions.findActive(chainType, tenantId);
        return version ? { ...version, maxTokens: version.maxTokens || null } : null;
      },
      purposeConfig: async (purpose) => {
        try {
          const row = await db.tenantAIConfig.findUnique({
            where: { tenantId_purpose: { tenantId, purpose } },
            select: { modelId: true, temperature: true, maxTokens: true },
          });
          return row ?? null;
        } catch {
          return null;
        }
      },
      lastRunModel: async (chainType) => {
        try {
          const last = await db.chainRun.findFirst({
            where: { tenantId, chainType, model: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: { model: true },
          });
          return last?.model ?? null;
        } catch {
          return null;
        }
      },
    });
  }),

  /**
   * Usage of every chain type over the last `days` days (default 30): recorded runs from
   * chain_runs, or counts derived from existing rows until a type has recorded runs.
   * SECURITY: Uses tenantProcedure; every query is filtered by the caller's tenant.
   */
  getUsageStats: tenantProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const { tenantId } = getTenantContext(ctx).tenant;
      const db = getTenantContext(ctx).prismaWithTenant;

      return describeChainUsage(
        {
          recorded: async (since) => {
            const where = { tenantId, createdAt: { gte: since } };
            const [all, successes, firstEver] = await Promise.all([
              db.chainRun.groupBy({
                by: ['chainType'],
                where,
                _count: { _all: true },
                _min: { createdAt: true },
                _max: { createdAt: true },
                _avg: { latencyMs: true },
                _sum: { costUsd: true, inputTokens: true, outputTokens: true },
              }),
              db.chainRun.groupBy({
                by: ['chainType'],
                where: { ...where, success: true },
                _count: { _all: true },
              }),
              // When recording started for each type: no window filter, so a quiet start of the
              // window does not move countedSince.
              db.chainRun.groupBy({
                by: ['chainType'],
                where: { tenantId },
                _min: { createdAt: true },
              }),
            ]);
            const ok = new Map(successes.map((row) => [row.chainType, row._count._all]));
            const first = new Map(firstEver.map((row) => [row.chainType, row._min.createdAt]));
            return Object.fromEntries(
              all.map((row) => [
                row.chainType,
                {
                  runs: row._count._all,
                  successes: ok.get(row.chainType) ?? 0,
                  firstRecordedAt: first.get(row.chainType) ?? row._min.createdAt,
                  lastRunAt: row._max.createdAt,
                  avgLatencyMs: row._avg.latencyMs,
                  costUsd: Number(row._sum.costUsd ?? 0),
                  inputTokens: row._sum.inputTokens ?? 0,
                  outputTokens: row._sum.outputTokens ?? 0,
                },
              ])
            );
          },
          derived: async (chainType, since) => {
            if (chainType !== 'SCORING') return null;
            const where = { tenantId, title: 'Lead Scored by AI', timestamp: { gte: since } };
            const [runs, last] = await Promise.all([
              db.leadActivity.count({ where }),
              db.leadActivity.findFirst({
                where,
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true },
              }),
            ]);
            return {
              runs,
              lastRunAt: last?.timestamp ?? null,
              derivedFrom: 'Lead Scored by AI activities',
            };
          },
        },
        input?.days
      );
    }),
};
