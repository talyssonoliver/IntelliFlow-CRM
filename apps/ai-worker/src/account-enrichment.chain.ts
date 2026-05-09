/**
 * IFC-312 — Account enrichment chain.
 *
 * Mirrors `contact-enrichment.chain.ts` but writes to the Account row. The
 * adapter may emit an `industry` field; we cross-check it against the tenant's
 * `AccountIndustryOption` vocabulary and drop it if no matching key exists
 * (the authoritative path for `industry` is `account-industry-inference.chain`).
 */

import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { getEnrichmentAdapter, type AccountSeed } from './shared/enrichment-adapter.js';

const logger = pino({
  name: 'account-enrichment.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

export interface EnrichAccountInput {
  accountId: string;
  tenantId: string;
  seed: AccountSeed;
}

export type EnrichAccountResult =
  | {
      success: true;
      updated: number;
      modelVersion: string;
      source: 'llm' | 'adapter' | 'fallback';
    }
  | { success: false; reason: string };

const FIELD_MAP: Record<string, string> = {
  industry: 'industry',
  employees: 'employees',
  revenue: 'revenue',
  description: 'description',
  website: 'website',
};

function isEmpty(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    (typeof v === 'string' && v.trim() === '') ||
    (typeof v === 'number' && Number.isNaN(v))
  );
}

/**
 * Validate an industry key against the tenant's active vocabulary.
 * Returns the key if allowed, undefined otherwise.
 */
async function resolveValidIndustryKey(
  industry: string,
  tenantId: string
): Promise<string | undefined> {
  try {
    const vocabulary = await prisma.accountIndustryOption.findMany({
      where: { tenantId, isActive: true },
      select: { key: true },
    });
    const allowed = new Set(vocabulary.map((v: { key: string }) => v.key));
    return allowed.has(industry) ? industry : undefined;
  } catch (err) {
    logger.warn({ err, tenantId }, 'vocabulary lookup failed');
    return undefined;
  }
}

/**
 * Build the Prisma `data` patch from enrichment output.
 * Only writes fields where the current record is empty.
 */
function buildEnrichmentPatch(
  enrichment: Record<string, unknown>,
  current: Record<string, unknown>,
  validIndustryKey: string | undefined
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [enrichKey, colKey] of Object.entries(FIELD_MAP)) {
    if (enrichKey === 'industry') {
      if (validIndustryKey && isEmpty(current[colKey])) {
        data[colKey] = validIndustryKey;
      }
      continue;
    }
    const enrichVal = enrichment[enrichKey];
    if (enrichVal === undefined || enrichVal === null) continue;
    if (isEmpty(current[colKey])) {
      data[colKey] = enrichVal;
    }
  }
  return data;
}

export async function enrichAccount(input: EnrichAccountInput): Promise<EnrichAccountResult> {
  const { accountId, tenantId, seed } = input;

  if (!seed.name || seed.name.trim() === '') {
    return { success: false, reason: 'insufficient-seed' };
  }

  let current: Record<string, unknown> | null;
  try {
    current = (await prisma.account.findUnique({
      where: { tenantId_id: { tenantId, id: accountId } },
    })) as Record<string, unknown> | null;
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'findUnique failed');
    return { success: false, reason: 'db-lookup-error' };
  }
  if (!current) {
    return { success: false, reason: 'account-not-found' };
  }

  const adapter = getEnrichmentAdapter();
  const enrichment = await adapter.enrichAccount(seed, tenantId);
  if (!enrichment) {
    return { success: false, reason: 'adapter-returned-null' };
  }

  // Validate industry against tenant vocabulary — drop if not present.
  const validIndustryKey = enrichment.industry
    ? await resolveValidIndustryKey(enrichment.industry, tenantId)
    : undefined;

  const data = buildEnrichmentPatch(
    enrichment as Record<string, unknown>,
    current,
    validIndustryKey
  );

  if (Object.keys(data).length === 0) {
    return {
      success: true,
      updated: 0,
      modelVersion: enrichment.modelVersion,
      source: enrichment.source,
    };
  }

  try {
    await prisma.account.update({
      where: { tenantId_id: { tenantId, id: accountId } },
      data,
    });
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'Prisma update failed');
    return { success: false, reason: 'db-update-error' };
  }

  logger.info(
    { accountId, tenantId, fields: Object.keys(data), modelVersion: enrichment.modelVersion },
    'account enriched'
  );

  return {
    success: true,
    updated: Object.keys(data).length,
    modelVersion: enrichment.modelVersion,
    source: enrichment.source,
  };
}
