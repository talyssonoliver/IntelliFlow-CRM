/**
 * IFC-312 — Enrichment job handler.
 *
 * Consumes `AI_ENRICHMENT` queue. Discriminates by `entityType`. Re-loads the
 * automation flag inside the handler (race safety against flag flips between
 * enqueue and execute) and EARLY RETURNs if disabled.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { enrichContact } from '../contact-enrichment.chain.js';
import { enrichAccount } from '../account-enrichment.chain.js';

const logger = pino({
  name: 'enrichment-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const EnrichmentJobDataSchema = z.object({
  entityType: z.enum(['contact', 'account']),
  entityId: z.string().min(1),
  tenantId: z.string().min(1),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type EnrichmentJobData = z.infer<typeof EnrichmentJobDataSchema>;

export async function processEnrichmentJob(job: Job<EnrichmentJobData>): Promise<{
  skipped?: boolean;
  result?: unknown;
}> {
  const data = EnrichmentJobDataSchema.parse(job.data);
  const { entityType, entityId, tenantId } = data;

  // Re-check automation flag at job start (race safety).
  try {
    if (entityType === 'contact') {
      const setting = await prisma.contactAutomationSetting.findUnique({ where: { tenantId } });
      if (!setting?.aiEnrichment) {
        logger.info({ entityId, tenantId }, 'enrichment skipped — toggle disabled');
        return { skipped: true };
      }
      const contact = await prisma.contact.findUnique({
        where: { tenantId_id: { tenantId, id: entityId } },
      });
      if (!contact) return { skipped: true };
      const result = await enrichContact({
        contactId: entityId,
        tenantId,
        seed: {
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          ...(contact.company ? { company: contact.company } : {}),
        },
      });
      return { result };
    }

    const setting = await prisma.accountAutomationSetting.findUnique({ where: { tenantId } });
    if (!setting?.aiEnrichment) {
      logger.info({ entityId, tenantId }, 'enrichment skipped — toggle disabled');
      return { skipped: true };
    }
    const account = await prisma.account.findUnique({
      where: { tenantId_id: { tenantId, id: entityId } },
    });
    if (!account) return { skipped: true };
    const result = await enrichAccount({
      accountId: entityId,
      tenantId,
      seed: {
        name: account.name,
        ...(account.website ? { website: account.website } : {}),
      },
    });
    return { result };
  } catch (err) {
    logger.error({ err, entityType, entityId, tenantId }, 'enrichment job failed');
    throw err; // BullMQ will apply retry policy.
  }
}
