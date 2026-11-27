/**
 * Compliance router (PG-194).
 *
 * Feeds /governance/compliance. Every procedure is tenant-scoped and limited to administrators and
 * managers, and reads only rows that belong to the context tenant. Nothing here is typed in: scores
 * come from `compliance-evidence.ts`, trends from stored snapshots.
 *
 * - overview: every framework with its controls, evidence and links, plus the overall figures and a
 *   trend per framework (or "Trend starts tomorrow" until two days are stored).
 * - history: stored daily points for one framework.
 * - refresh: re-evaluate now and store today's snapshot (the daily job does the same for every firm).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  FRAMEWORK_IDS,
  buildOverview,
  collectEvidence,
  trendFromSnapshots,
  type EvidenceDb,
  type Trend,
} from './compliance-evidence';
import {
  TREND_WINDOW_DAYS,
  readHistory,
  snapshotTenant,
  type SnapshotDb,
} from './compliance-snapshots';

type Db = EvidenceDb & SnapshotDb;

const complianceProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  if (!['ADMIN', 'MANAGER'].includes(ctx.user.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Manager or Admin access required to view compliance.',
    });
  }
  return next();
});

const historyInput = z.object({
  frameworkId: z.enum(FRAMEWORK_IDS),
  days: z.number().int().min(2).max(365).default(TREND_WINDOW_DAYS),
});

export const complianceRouter = createTRPCRouter({
  overview: complianceProcedure.query(async ({ ctx }) => {
    const db = ctx.prismaWithTenant as unknown as Db;
    const tenantId = ctx.tenant.tenantId;
    const overview = buildOverview(await collectEvidence(db, tenantId));
    const history = await readHistory(db, tenantId);
    return {
      ...overview,
      frameworks: overview.frameworks.map((f) => ({
        ...f,
        trend: trendFromSnapshots(history[f.id] ?? []) as Trend,
      })),
    };
  }),

  history: complianceProcedure.input(historyInput).query(async ({ ctx, input }) => {
    const db = ctx.prismaWithTenant as unknown as Db;
    const history = await readHistory(db, ctx.tenant.tenantId, input.days);
    return { frameworkId: input.frameworkId, points: history[input.frameworkId] ?? [] };
  }),

  refresh: complianceProcedure.mutation(async ({ ctx }) => {
    const db = ctx.prismaWithTenant as unknown as Db;
    const { overview, stored } = await snapshotTenant(db, ctx.tenant.tenantId);
    // stored is 0 when some evidence could not be read: nothing is written, so no false drop.
    return { stored, generatedAt: overview.generatedAt };
  }),
});
