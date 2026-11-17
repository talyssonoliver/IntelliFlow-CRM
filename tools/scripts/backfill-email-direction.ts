/**
 * backfill-email-direction.ts (MVP-001, register #25)
 *
 * Replies were logged on leads as EMAIL activities titled "Reply received: ..." before
 * `lead.logActivity` took a direction, so they carry no metadata.direction and the lead's Emails
 * tab reads them as "Sent". The tab and the write side are fixed (a title starting "Reply
 * received" reads as, and is now stored as, inbound); this script stores the direction on the
 * rows that already exist.
 *
 * What it changes: an EMAIL lead_activities row whose title starts "Reply received" and whose
 * metadata has no usable direction (none, or a value that is not inbound or outbound) gets
 * metadata.direction = 'inbound'. The rest of the metadata is kept. A row that already says
 * inbound or outbound is never touched, so a stored direction always wins.
 *
 * Safety (ADR-069 Class B: a row rewrite on existing production data):
 *   - Dry-run by default: prints every planned change, writes nothing. `--apply` writes.
 *     Running it with --apply on production needs the owner's yes for that run.
 *   - Tenant-scoped: each update is keyed on the row's own id AND tenantId.
 *     `--tenant <id>` and `--lead <id>` narrow the scan.
 *   - Idempotent: a rewritten row has a direction, so it no longer matches and a re-run after a
 *     partial apply changes nothing already done.
 *   - Recovery: the dry-run output lists id, lead, title and the old metadata for every row.
 *     Save it before `--apply`; it is the undo list (put the old metadata back).
 *
 * Usage (from the repo root):
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-email-direction.ts
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-email-direction.ts --tenant <id>
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-email-direction.ts --apply
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isReplyReceivedTitle } from '../../apps/api/src/modules/lead/lead-activity-direction';

const BATCH_SIZE = 200;
const TAG = '[backfill-email-direction]';

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
  leadFilter: string | undefined;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  return {
    isApply: argv.includes('--apply'),
    tenantFilter: argValue(argv, '--tenant'),
    leadFilter: argValue(argv, '--lead'),
  };
}

export interface DirectionFix {
  metadata: Record<string, unknown>;
}

/**
 * The metadata a "Reply received" email should have, or null when the row needs nothing: it is
 * not such an email, it already has a direction, or its metadata is not an object (not touched).
 */
export function planDirectionFix(row: {
  type: string;
  title: string;
  metadata: unknown;
}): DirectionFix | null {
  if (row.type !== 'EMAIL' || !isReplyReceivedTitle(row.title)) return null;
  if (row.metadata !== null && row.metadata !== undefined) {
    if (typeof row.metadata !== 'object' || Array.isArray(row.metadata)) return null;
  }
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (meta['direction'] === 'inbound' || meta['direction'] === 'outbound') return null;
  return { metadata: { ...meta, direction: 'inbound' } };
}

type Prisma = InstanceType<typeof PrismaClient>;

export interface Totals {
  fixed: number;
  skipped: number;
}

function scopeWhere(args: ParsedArgs) {
  return {
    ...(args.tenantFilter ? { tenantId: args.tenantFilter } : {}),
    ...(args.leadFilter ? { leadId: args.leadFilter } : {}),
  };
}

/** One page of the reply emails, in id order, after `cursor`. */
function fetchBatch(prisma: Prisma, args: ParsedArgs, cursor: string | undefined) {
  return prisma.leadActivity.findMany({
    where: {
      ...scopeWhere(args),
      type: 'EMAIL',
      title: { startsWith: 'Reply received', mode: 'insensitive' },
    },
    select: { id: true, tenantId: true, leadId: true, type: true, title: true, metadata: true },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

type ReplyRow = Awaited<ReturnType<typeof fetchBatch>>[number];

async function handleRow(
  prisma: Prisma,
  args: ParsedArgs,
  row: ReplyRow,
  totals: Totals
): Promise<void> {
  const fix = planDirectionFix(row);
  if (!fix) {
    totals.skipped += 1;
    return;
  }
  totals.fixed += 1;
  console.log(
    `${TAG} ${args.isApply ? 'setting' : 'would set'} row=${row.id} tenant=${row.tenantId}` +
      ` lead=${row.leadId} title=${JSON.stringify(row.title)}` +
      ` metadata ${JSON.stringify(row.metadata)} -> ${JSON.stringify(fix.metadata)}`
  );
  if (!args.isApply) return;
  // Scoped to this row's own id AND tenantId: never another tenant's row.
  await prisma.leadActivity.update({
    where: { id: row.id, tenantId: row.tenantId },
    data: { metadata: fix.metadata as never },
  });
}

export async function run(prisma: Prisma, args: ParsedArgs, totals: Totals): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetchBatch(prisma, args, cursor);
    for (const row of rows) await handleRow(prisma, args, row, totals);
    if (rows.length < BATCH_SIZE) return;
    cursor = rows[rows.length - 1]!.id;
  }
}

export async function main(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error(`${TAG} ERROR: DATABASE_URL is not set.`);
    process.exit(1);
    return;
  }
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  console.log(
    `${TAG} mode=${args.isApply ? 'APPLY' : 'DRY-RUN'}` +
      (args.tenantFilter ? ` tenant=${args.tenantFilter}` : ' (all tenants)') +
      (args.leadFilter ? ` lead=${args.leadFilter}` : '')
  );

  const totals: Totals = { fixed: 0, skipped: 0 };
  try {
    await run(prisma, args, totals);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`${TAG} summary:`, { ...totals, mode: args.isApply ? 'APPLY' : 'DRY-RUN' });
}

// CLI entry point guard: importing this module (e.g. from a test) must not
// run main(), connect to a database, or call process.exit().
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('backfill-email-direction.ts')
) {
  main().catch((err) => {
    console.error(`${TAG} FAILED:`, err);
    process.exit(1);
  });
}
