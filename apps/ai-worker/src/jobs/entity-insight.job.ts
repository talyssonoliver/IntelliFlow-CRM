/**
 * IFC-312 — Entity insight job handler.
 *
 * Consumes `AI_ENTITY_INSIGHT` queue. Discriminates by `entityType` to dispatch
 * to contact-insight or account-insight chain. Re-checks `aiInsightGeneration`
 * flag before running. Distinct from the lead-only `INSIGHT_QUEUE = 'ai-insights'`.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { generateContactInsight } from '../contact-insight.chain.js';
import { generateAccountInsight } from '../account-insight.chain.js';

const logger = pino({
  name: 'entity-insight-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const EntityInsightJobDataSchema = z.object({
  entityType: z.enum(['contact', 'account']),
  entityId: z.string().min(1),
  tenantId: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type EntityInsightJobData = z.infer<typeof EntityInsightJobDataSchema>;

export async function processEntityInsightJob(job: Job<EntityInsightJobData>): Promise<{
  skipped?: boolean;
  result?: unknown;
}> {
  const data = EntityInsightJobDataSchema.parse(job.data);
  const { entityType, entityId, tenantId, context } = data;

  try {
    if (entityType === 'contact') {
      const setting = await prisma.contactAutomationSetting.findUnique({ where: { tenantId } });
      if (!setting?.aiInsightGeneration) return { skipped: true };
      const result = await generateContactInsight({
        contactId: entityId,
        tenantId,
        context: (context as any) ?? { activities: [], emails: [] },
      });
      return { result };
    }

    const setting = await prisma.accountAutomationSetting.findUnique({ where: { tenantId } });
    if (!setting?.aiInsightGeneration) return { skipped: true };
    const result = await generateAccountInsight({
      accountId: entityId,
      tenantId,
      context: (context as any) ?? {},
    });
    return { result };
  } catch (err) {
    logger.error({ err, entityType, entityId, tenantId }, 'entity-insight job failed');
    throw err;
  }
}
