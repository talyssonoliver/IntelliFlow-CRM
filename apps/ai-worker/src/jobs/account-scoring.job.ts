/**
 * IFC-312 — Account scoring job handler.
 *
 * Consumes `AI_ACCOUNT_SCORING` queue. Re-checks `aiAccountScoring` toggle.
 * Loads fresh signals from the DB (contact count, open deals, revenue) and
 * runs `scoreAccount` chain.
 *
 * IFC-312 audit fix F4 (2026-04-24): sentinel branch for nightly fan-out.
 * When `tenantId === '__scheduled__'`, enumerate active tenants and enqueue
 * real per-account scoring jobs (cap PER_TENANT_CAP per tick).
 */

import type { Job, Queue } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { scoreAccount } from '../account-scoring.chain.js';

const logger = pino({
  name: 'account-scoring-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const SCHEDULED_SENTINEL = '__scheduled__';
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PER_TENANT_CAP = 500;

export const AccountScoringJobDataSchema = z.object({
  accountId: z.string().min(1),
  tenantId: z.string().min(1),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type AccountScoringJobData = z.infer<typeof AccountScoringJobDataSchema>;

export interface AccountScoringJobResult {
  skipped?: boolean;
  score?: number;
  fannedOut?: { accounts: number; tenants: number };
}

async function dispatchScheduledAccountScoring(
  job: Job<AccountScoringJobData>
): Promise<AccountScoringJobResult> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const accountTenants = await (prisma.account as any).groupBy({
    by: ['tenantId'],
    where: { updatedAt: { gte: since } },
    _count: true,
  });
  const tenantIds: string[] = accountTenants.map((row: any) => row.tenantId as string);
  const queue = (job as unknown as { queue: Queue }).queue;

  let accountEnqueued = 0;
  let activeTenants = 0;

  for (const tenantId of tenantIds) {
    const setting = await prisma.accountAutomationSetting.findUnique({ where: { tenantId } });
    if (!setting?.aiAccountScoring) continue;
    activeTenants += 1;

    const accounts = await prisma.account.findMany({
      where: { tenantId, updatedAt: { gte: since } },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TENANT_CAP,
    });
    for (const a of accounts) {
      await queue.add('score', {
        accountId: a.id,
        tenantId,
        _otelCarrier: {},
      });
      accountEnqueued += 1;
    }
  }

  logger.info(
    { tenants: activeTenants, accounts: accountEnqueued },
    'scheduled-account-scoring fan-out complete'
  );
  return { fannedOut: { accounts: accountEnqueued, tenants: activeTenants } };
}

export async function processAccountScoringJob(
  job: Job<AccountScoringJobData>
): Promise<AccountScoringJobResult> {
  const data = AccountScoringJobDataSchema.parse(job.data);
  const { accountId, tenantId } = data;

  // IFC-312 audit fix F4: nightly cron sentinel branch.
  if (tenantId === SCHEDULED_SENTINEL || accountId === SCHEDULED_SENTINEL) {
    return dispatchScheduledAccountScoring(job);
  }

  try {
    const setting = await prisma.accountAutomationSetting.findUnique({ where: { tenantId } });
    if (!setting?.aiAccountScoring) {
      logger.info({ accountId, tenantId }, 'account-scoring skipped — toggle disabled');
      return { skipped: true };
    }

    const [contactCount, openDealCount, account] = await Promise.all([
      prisma.contact.count({ where: { tenantId, accountId } }),
      prisma.opportunity.count({
        where: { tenantId, accountId, closedAt: null },
      }),
      prisma.account.findUnique({ where: { tenantId_id: { tenantId, id: accountId } } }),
    ]);

    if (!account) return { skipped: true };

    const totalRevenue = account.revenue ? Number(account.revenue) : 0;

    const result = await scoreAccount({
      accountId,
      tenantId,
      signals: {
        contactCount,
        openDealCount,
        totalRevenue,
      },
    });

    if (!result.success) return { skipped: true };
    return { score: result.score };
  } catch (err) {
    logger.error({ err, accountId, tenantId }, 'account-scoring job failed');
    throw err;
  }
}
