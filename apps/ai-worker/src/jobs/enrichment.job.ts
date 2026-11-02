/**
 * IFC-312 — Enrichment job handler.
 *
 * Consumes `AI_ENRICHMENT` queue. Discriminates by `entityType`. Re-loads the
 * automation flag inside the handler (race safety against flag flips between
 * enqueue and execute) and EARLY RETURNs if disabled.
 *
 * IFC-312 audit fix F2 (2026-04-24): the account branch additionally dispatches
 * `inferAccountIndustry` when `flags.aiIndustryInference` is true and the
 * account's `industry` field is empty. A single AI_ENRICHMENT enqueue from
 * the router covers both toggles; the job reads each flag independently. This
 * fixes the prior Cat-1 dead-toggle state where `inferAccountIndustry` had
 * zero production callers.
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { enrichContact, type EnrichContactResult } from '../contact-enrichment.chain.js';
import { enrichAccount, type EnrichAccountResult } from '../account-enrichment.chain.js';
import {
  inferAccountIndustry,
  type InferAccountIndustryResult,
} from '../account-industry-inference.chain.js';

const logger = pino({
  name: 'enrichment-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export const EnrichmentJobDataSchema = z.object({
  entityType: z.enum(['contact', 'account']),
  entityId: z.string().min(1),
  tenantId: recordIdSchema,
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type EnrichmentJobData = z.infer<typeof EnrichmentJobDataSchema>;

export interface EnrichmentJobResult {
  skipped?: boolean;
  enrichment?: EnrichContactResult | EnrichAccountResult;
  industry?: InferAccountIndustryResult;
}

function isIndustryEmpty(industry: string | null | undefined): boolean {
  return industry === null || industry === undefined || industry.trim() === '';
}

async function processContactEnrichment(
  entityId: string,
  tenantId: string
): Promise<EnrichmentJobResult> {
  const setting = await prisma.contactAutomationSetting.findUnique({ where: { tenantId } });
  if (!setting?.aiEnrichment) {
    logger.info({ entityId, tenantId }, 'enrichment skipped — toggle disabled');
    return { skipped: true };
  }
  const contact = await prisma.contact.findUnique({
    where: { tenantId_id: { tenantId, id: entityId } },
  });
  if (!contact) return { skipped: true };
  const enrichment = await enrichContact({
    contactId: entityId,
    tenantId,
    seed: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      ...(contact.company ? { company: contact.company } : {}),
    },
  });
  return { enrichment };
}

/** Infers the account industry from the tenant's active vocabulary; undefined when it is empty. */
async function inferIndustryFromVocabulary(
  entityId: string,
  tenantId: string,
  account: { name: string; website: string | null; description: string | null }
): Promise<EnrichmentJobResult['industry'] | undefined> {
  const vocab = await prisma.accountIndustryOption.findMany({
    where: { tenantId, isActive: true },
    select: { key: true, label: true },
  });
  if (vocab.length === 0) {
    logger.info({ entityId, tenantId }, 'industry inference skipped — empty vocabulary');
    return undefined;
  }
  return inferAccountIndustry({
    accountId: entityId,
    tenantId,
    seed: {
      name: account.name,
      ...(account.website ? { website: account.website } : {}),
      ...(account.description ? { description: account.description } : {}),
    },
    vocabulary: vocab,
  });
}

export async function processEnrichmentJob(
  job: Job<EnrichmentJobData>
): Promise<EnrichmentJobResult> {
  const data = EnrichmentJobDataSchema.parse(job.data);
  const { entityType, entityId, tenantId } = data;

  try {
    if (entityType === 'contact') return await processContactEnrichment(entityId, tenantId);

    // Account branch — single setting load drives both toggles.
    const setting = await prisma.accountAutomationSetting.findUnique({ where: { tenantId } });
    const wantsEnrichment = !!setting?.aiEnrichment;
    const wantsIndustry = !!setting?.aiIndustryInference;

    if (!wantsEnrichment && !wantsIndustry) {
      logger.info({ entityId, tenantId }, 'enrichment skipped — both toggles disabled');
      return { skipped: true };
    }

    const account = await prisma.account.findUnique({
      where: { tenantId_id: { tenantId, id: entityId } },
    });
    if (!account) return { skipped: true };

    const result: EnrichmentJobResult = {};

    if (wantsEnrichment) {
      result.enrichment = await enrichAccount({
        accountId: entityId,
        tenantId,
        seed: {
          name: account.name,
          ...(account.website ? { website: account.website } : {}),
        },
      });
    }

    if (wantsIndustry && isIndustryEmpty(account.industry)) {
      const industry = await inferIndustryFromVocabulary(entityId, tenantId, account);
      if (industry !== undefined) result.industry = industry;
    }

    return result;
  } catch (err) {
    logger.error({ err, entityType, entityId, tenantId }, 'enrichment job failed');
    throw err; // BullMQ will apply retry policy.
  }
}
