/**
 * IFC-312 — Entity insight job handler.
 *
 * Consumes `AI_ENTITY_INSIGHT` queue. Discriminates by `entityType` to dispatch
 * to contact-insight or account-insight chain. Re-checks `aiInsightGeneration`
 * flag before running. Distinct from the lead-only `INSIGHT_QUEUE = 'ai-insights'`.
 *
 * IFC-312 audit fix F4 (2026-04-24): sentinel branch handles the nightly cron
 * fan-out. When `tenantId === '__scheduled__'`, enumerate active tenants and
 * enqueue real per-entity jobs for contacts + accounts with recent activity.
 */

import type { Job, Queue } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { generateContactInsight } from '../contact-insight.chain.js';
import { generateAccountInsight } from '../account-insight.chain.js';

const logger = pino({
  name: 'entity-insight-job',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const SCHEDULED_SENTINEL = '__scheduled__';
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PER_TENANT_CAP = 500;

export const EntityInsightJobDataSchema = z.object({
  entityType: z.enum(['contact', 'account']),
  entityId: z.string().min(1),
  tenantId: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});
export type EntityInsightJobData = z.infer<typeof EntityInsightJobDataSchema>;

export interface EntityInsightJobResult {
  skipped?: boolean;
  result?: unknown;
  fannedOut?: { contacts: number; accounts: number; tenants: number };
}

/**
 * Group entity-id rows by tenant, capping each tenant's list at `cap`. Rows are
 * assumed pre-ordered (most-recent first) so the per-tenant cap keeps the newest.
 */
function groupCappedIdsByTenant(
  rows: Array<{ id: string; tenantId: string }>,
  cap: number
): Map<string, string[]> {
  const byTenant = new Map<string, string[]>();
  for (const row of rows) {
    const ids = byTenant.get(row.tenantId) ?? [];
    if (ids.length < cap) {
      ids.push(row.id);
      byTenant.set(row.tenantId, ids);
    }
  }
  return byTenant;
}

async function dispatchScheduledEntityInsights(
  job: Job<EntityInsightJobData>
): Promise<EntityInsightJobResult> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const contactTenants = await (prisma.contact as any).groupBy({
    by: ['tenantId'],
    where: { updatedAt: { gte: since } },
    _count: true,
  });
  const accountTenants = await (prisma.account as any).groupBy({
    by: ['tenantId'],
    where: { updatedAt: { gte: since } },
    _count: true,
  });
  const tenantIds = Array.from(
    new Set<string>([
      ...contactTenants.map((row: any) => row.tenantId as string),
      ...accountTenants.map((row: any) => row.tenantId as string),
    ])
  );

  let contactEnqueued = 0;
  let accountEnqueued = 0;
  const queue = (job as unknown as { queue: Queue }).queue;

  // NP-018 fix: batch both settings lookups before the loop (was 2N findUnique calls).
  const [contactSettingRows, accountSettingRows] = await Promise.all([
    prisma.contactAutomationSetting.findMany({
      where: { tenantId: { in: tenantIds }, aiInsightGeneration: true },
      select: { tenantId: true },
    }),
    prisma.accountAutomationSetting.findMany({
      where: { tenantId: { in: tenantIds }, aiInsightGeneration: true },
      select: { tenantId: true },
    }),
  ]);
  const contactInsightTenants = new Set(
    contactSettingRows.map((r: { tenantId: string }) => r.tenantId)
  );
  const accountInsightTenants = new Set(
    accountSettingRows.map((r: { tenantId: string }) => r.tenantId)
  );

  // Batch the per-tenant entity scans into ONE query per entity type across all
  // enabled tenants, then group + cap PER_TENANT_CAP in memory (was one findMany
  // per tenant per entity — DB query count scaled with tenant count). Global take
  // bounds the query; tenants truncated by skew are picked up on the next tick.
  const contactTenantIds = tenantIds.filter((t) => contactInsightTenants.has(t));
  const accountTenantIds = tenantIds.filter((t) => accountInsightTenants.has(t));

  const contactsByTenant = groupCappedIdsByTenant(
    contactTenantIds.length === 0
      ? []
      : await prisma.contact.findMany({
          where: { tenantId: { in: contactTenantIds }, updatedAt: { gte: since } },
          select: { id: true, tenantId: true },
          orderBy: { updatedAt: 'desc' },
          take: PER_TENANT_CAP * contactTenantIds.length,
        }),
    PER_TENANT_CAP
  );
  const accountsByTenant = groupCappedIdsByTenant(
    accountTenantIds.length === 0
      ? []
      : await prisma.account.findMany({
          where: { tenantId: { in: accountTenantIds }, updatedAt: { gte: since } },
          select: { id: true, tenantId: true },
          orderBy: { updatedAt: 'desc' },
          take: PER_TENANT_CAP * accountTenantIds.length,
        }),
    PER_TENANT_CAP
  );

  for (const tenantId of tenantIds) {
    for (const entityId of contactsByTenant.get(tenantId) ?? []) {
      await queue.add('insight', { entityType: 'contact', entityId, tenantId, _otelCarrier: {} });
      contactEnqueued += 1;
    }
    for (const entityId of accountsByTenant.get(tenantId) ?? []) {
      await queue.add('insight', { entityType: 'account', entityId, tenantId, _otelCarrier: {} });
      accountEnqueued += 1;
    }
  }

  logger.info(
    { tenants: tenantIds.length, contacts: contactEnqueued, accounts: accountEnqueued },
    'scheduled-entity-insight-refresh fan-out complete'
  );
  return {
    fannedOut: {
      contacts: contactEnqueued,
      accounts: accountEnqueued,
      tenants: tenantIds.length,
    },
  };
}

export async function processEntityInsightJob(
  job: Job<EntityInsightJobData>
): Promise<EntityInsightJobResult> {
  const data = EntityInsightJobDataSchema.parse(job.data);
  const { entityType, entityId, tenantId, context } = data;

  // IFC-312 audit fix F4: nightly cron sentinel branch.
  if (tenantId === SCHEDULED_SENTINEL || entityId === SCHEDULED_SENTINEL) {
    return dispatchScheduledEntityInsights(job);
  }

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
