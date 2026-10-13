/**
 * backfill-routing-audit-lead-id.ts (#770)
 *
 * RoutingAudit.ticketId is the only identifier column, and lead-routing rows
 * (LeadRoutingService.routeLead, routing.router's assignLead) write the LEAD
 * id into it — mixed in with the real ticket ids TicketRoutingService writes.
 * The additive migration `20261013000000_routing_audit_lead_id` adds a
 * nullable `leadId` column, and both lead-routing writers now set it on every
 * NEW row. This script backfills it on EXISTING rows that predate that change.
 *
 * A row is a lead-routing row if either:
 *   - details.leadId is a string (set by the old assignLead), or
 *   - details.entityType === 'lead' (set by the old LeadRoutingService),
 *     in which case the lead id is ticketId.
 * Anything else (no leadId already set, neither signal present) is a
 * ticket-routing row and is left alone — leadId stays null, which is correct.
 *
 * Safety (ADR-069 Class B — backfill on existing data):
 *   - Tenant-scoped: read and written with the row's own tenantId; nothing is
 *     looked up across tenants. --tenant narrows to one tenant.
 *   - Dry-run by default. Pass --apply to write.
 *   - Idempotent: only rows where leadId IS NULL are considered, so a
 *     re-run after a partial apply changes nothing already backfilled.
 *   - Prepares the migration; does not decide to run itself against
 *     production. Count first (the default), show the owner the count, then
 *     `--apply` only once authorized — against the test DB or production as
 *     directed.
 *
 * Usage:
 *   DATABASE_URL=<test db> pnpm tsx tools/scripts/backfill-routing-audit-lead-id.ts
 *   DATABASE_URL=<test db> pnpm tsx tools/scripts/backfill-routing-audit-lead-id.ts --apply
 *   DATABASE_URL=<test db> pnpm tsx tools/scripts/backfill-routing-audit-lead-id.ts --tenant <tenantId> --apply
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const isApply = process.argv.includes('--apply');
const tenantArgIndex = process.argv.indexOf('--tenant');
const tenantFilter =
  tenantArgIndex !== -1 && process.argv[tenantArgIndex + 1]
    ? process.argv[tenantArgIndex + 1]
    : undefined;
const BATCH_SIZE = 200;

if (!process.env['DATABASE_URL']) {
  console.error('[backfill-routing-audit-lead-id] ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

/** Mirrors routing.router.ts's readLeadId heuristic, for rows with no leadId yet. */
function resolveLegacyLeadId(details: unknown, ticketId: string): string | null {
  if (!details || typeof details !== 'object') return null;
  if ('leadId' in details && typeof (details as Record<string, unknown>).leadId === 'string') {
    return (details as Record<string, unknown>).leadId as string;
  }
  if ('entityType' in details && (details as Record<string, unknown>).entityType === 'lead') {
    return ticketId;
  }
  return null;
}

type Prisma = InstanceType<typeof PrismaClient>;
type RoutingAuditRow = Awaited<ReturnType<Prisma['routingAudit']['findFirstOrThrow']>>;

interface Totals {
  updated: number;
  notLeadRows: number;
}

/** One row: resolve its legacy leadId, log it, and write it when --apply is set. */
async function processRow(prisma: Prisma, audit: RoutingAuditRow, totals: Totals): Promise<void> {
  const leadId = resolveLegacyLeadId(audit.details, audit.ticketId);
  if (!leadId) {
    totals.notLeadRows += 1;
    return;
  }

  totals.updated += 1;
  console.log(
    `[backfill-routing-audit-lead-id] ${isApply ? 'setting' : 'would set'} ` +
      `audit=${audit.id} tenant=${audit.tenantId} leadId=${leadId}`
  );
  if (!isApply) return;

  // Scoped to this row's own id AND tenantId — never another tenant's row.
  await prisma.routingAudit.update({
    where: { id: audit.id, tenantId: audit.tenantId },
    data: { leadId },
  });
}

async function fetchBatch(prisma: Prisma, cursor: string | undefined): Promise<RoutingAuditRow[]> {
  return prisma.routingAudit.findMany({
    where: {
      leadId: null,
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: 'asc' },
  });
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
  const prisma = new PrismaClient({ adapter });

  console.log(
    `[backfill-routing-audit-lead-id] mode=${isApply ? 'APPLY' : 'DRY-RUN'}` +
      (tenantFilter ? ` tenant=${tenantFilter}` : ' (all tenants)')
  );

  const totals: Totals = { updated: 0, notLeadRows: 0 };
  let cursor: string | undefined;

  for (;;) {
    const audits = await fetchBatch(prisma, cursor);
    if (audits.length === 0) break;

    for (const audit of audits) {
      await processRow(prisma, audit, totals);
    }

    cursor = audits[audits.length - 1]!.id;
    if (audits.length < BATCH_SIZE) break;
  }

  console.log('[backfill-routing-audit-lead-id] summary:', {
    ...totals,
    mode: isApply ? 'APPLY' : 'DRY-RUN',
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[backfill-routing-audit-lead-id] FAILED:', err);
  process.exit(1);
});
