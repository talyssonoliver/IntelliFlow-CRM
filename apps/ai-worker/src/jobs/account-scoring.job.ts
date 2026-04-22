/**
 * IFC-312 — Account scoring job handler.
 *
 * Consumes `AI_ACCOUNT_SCORING` queue. Re-checks `aiAccountScoring` toggle.
 * Loads fresh signals from the DB (contact count, open deals, revenue) and
 * runs `scoreAccount` chain.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { scoreAccount } from '../account-scoring.chain.js';

const logger = pino({
  name: 'account-scoring-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const AccountScoringJobDataSchema = z.object({
  accountId: z.string().min(1),
  tenantId: z.string().min(1),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type AccountScoringJobData = z.infer<typeof AccountScoringJobDataSchema>;

export async function processAccountScoringJob(job: Job<AccountScoringJobData>): Promise<{
  skipped?: boolean;
  score?: number;
}> {
  const data = AccountScoringJobDataSchema.parse(job.data);
  const { accountId, tenantId } = data;

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
