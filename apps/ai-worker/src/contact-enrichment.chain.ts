/**
 * IFC-312 — Contact enrichment chain.
 *
 * Consumes the shared EnrichmentProvider port (`shared/enrichment-adapter.ts`)
 * and writes only empty fields on the Contact row. Fill-only-empty-fields
 * discipline is enforced here, not in the adapter. All Prisma writes are
 * tenant-scoped via the composite `tenantId_id` unique. Errors never throw
 * to the caller — the job handler expects `{success, reason?}` shape.
 *
 * Trigger: enqueued from `contact.router.ts` create/update procedures when
 * `flags.aiEnrichment === true`. Job handler at `jobs/enrichment.job.ts`
 * re-verifies the toggle before invoking this chain.
 */

import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { getEnrichmentAdapter, type ContactSeed } from './shared/enrichment-adapter.js';

const logger = pino({ name: 'contact-enrichment.chain', level: process.env['LOG_LEVEL'] ?? 'info' });

export interface EnrichContactInput {
  contactId: string;
  tenantId: string;
  seed: ContactSeed;
}

export type EnrichContactResult =
  | {
      success: true;
      updated: number;
      modelVersion: string;
      source: 'llm' | 'adapter' | 'fallback';
    }
  | { success: false; reason: string };

/**
 * Map of enrichment output field -> Contact column name. Only these fields
 * are candidates for fill-only-empty writes. `jobTitle` → `title` (Contact
 * model uses the shorter name). `linkedinUrl` → `linkedInUrl` (schema casing).
 */
const FIELD_MAP: Record<string, string> = {
  company: 'company',
  jobTitle: 'title',
  city: 'city',
  country: 'country',
  linkedinUrl: 'linkedInUrl',
};

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export async function enrichContact(input: EnrichContactInput): Promise<EnrichContactResult> {
  const { contactId, tenantId, seed } = input;

  if (!seed.email || seed.email.trim() === '') {
    return { success: false, reason: 'insufficient-seed' };
  }

  let current: Record<string, unknown> | null;
  try {
    current = (await prisma.contact.findUnique({
      where: { tenantId_id: { tenantId, id: contactId } },
    })) as Record<string, unknown> | null;
  } catch (err) {
    logger.warn({ err, contactId, tenantId }, 'findUnique failed');
    return { success: false, reason: 'db-lookup-error' };
  }
  if (!current) {
    return { success: false, reason: 'contact-not-found' };
  }

  const adapter = getEnrichmentAdapter();
  const enrichment = await adapter.enrichContact(seed, tenantId);
  if (!enrichment) {
    return { success: false, reason: 'adapter-returned-null' };
  }

  // Build fill-only-empty-fields diff.
  const data: Record<string, unknown> = {};
  for (const [enrichKey, colKey] of Object.entries(FIELD_MAP)) {
    const enrichVal = (enrichment as Record<string, unknown>)[enrichKey];
    if (enrichVal === undefined || enrichVal === null) continue;
    if (isEmpty(current[colKey])) {
      data[colKey] = enrichVal;
    }
  }

  if (Object.keys(data).length === 0) {
    return {
      success: true,
      updated: 0,
      modelVersion: enrichment.modelVersion,
      source: enrichment.source,
    };
  }

  try {
    await prisma.contact.update({
      where: { tenantId_id: { tenantId, id: contactId } },
      data,
    });
  } catch (err) {
    logger.warn({ err, contactId, tenantId }, 'Prisma update failed');
    return { success: false, reason: 'db-update-error' };
  }

  logger.info(
    { contactId, tenantId, fields: Object.keys(data), modelVersion: enrichment.modelVersion },
    'contact enriched'
  );

  return {
    success: true,
    updated: Object.keys(data).length,
    modelVersion: enrichment.modelVersion,
    source: enrichment.source,
  };
}
