/**
 * backfill-activity-event-times.ts (#1223, UI-005 and UI-003)
 *
 * Two kinds of existing lead_activities rows show the wrong time or unreadable
 * copy in the activity feed. The write side is fixed for new rows; this script
 * rewrites the old ones.
 *
 * 1. Back-dated imports (UI-005). `lead.logActivity` had no time input, so an
 *    import of past outreach stamped every row with the import time and put the
 *    real date in the title ("Outreach email sent 27/09/2026"). For a row whose
 *    title carries one dd/mm/yyyy date that is earlier than its timestamp, the
 *    script sets the timestamp to that date (12:00 UTC: the titles carry no
 *    time) and drops the date from the title.
 *
 * 2. COA pipeline-sync notes (UI-003). Rows with metadata.source
 *    'coa-pipeline-sync' and the old "COA pipeline: X → Y" title get the new
 *    title and body from `describePipelineSyncCopy` (the same function the sync
 *    now writes with), and their timestamp moves to metadata.stageChangedAt.
 *    The metadata is not touched.
 *
 * Safety (ADR-069 Class B: a row rewrite on existing production data):
 *   - Dry-run by default: prints every planned change, writes nothing.
 *     `--apply` writes. Running it with --apply on production needs the
 *     owner's yes for that run.
 *   - Tenant-scoped: each update is keyed on the row's own id AND tenantId.
 *     `--tenant <id>` and `--lead <id>` narrow the scan.
 *   - `--only imports|coa` runs one part.
 *   - Idempotent: a rewritten row no longer matches (no date in the title, no
 *     "COA pipeline:" prefix), so a re-run after a partial apply changes nothing
 *     already done.
 *   - Recovery: the dry-run output lists id, old and new title and timestamp
 *     for every row. Save it before `--apply`; it is the undo list.
 *
 * Usage:
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-activity-event-times.ts
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-activity-event-times.ts --tenant <id> --only coa
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-activity-event-times.ts --apply
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describePipelineSyncCopy } from '../../apps/api/src/modules/inbound/pipeline-sync-copy';

const BATCH_SIZE = 200;
const TAG = '[backfill-activity-event-times]';

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
  leadFilter: string | undefined;
  only: 'imports' | 'coa' | undefined;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const only = argValue(argv, '--only');
  if (only !== undefined && only !== 'imports' && only !== 'coa') {
    throw new Error(`--only must be "imports" or "coa", got "${only}"`);
  }
  return {
    isApply: argv.includes('--apply'),
    tenantFilter: argValue(argv, '--tenant'),
    leadFilter: argValue(argv, '--lead'),
    only,
  };
}

// ---------------------------------------------------------------------------
// Part 1: dates written into titles
// ---------------------------------------------------------------------------

const TITLE_DATE = /(\d{2})\/(\d{2})\/(\d{4})/g;

export interface TitleDateFix {
  title: string;
  timestamp: Date;
}

/**
 * The event date in a title, and the title without it. Null when the title has
 * no date, more than one, or an impossible one.
 */
export function parseTitleDate(title: string): TitleDateFix | null {
  const matches = [...title.matchAll(TITLE_DATE)];
  if (matches.length !== 1) return null;
  const [whole, dd, mm, yyyy] = matches[0]!;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const timestamp = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    timestamp.getUTCFullYear() !== year ||
    timestamp.getUTCMonth() !== month - 1 ||
    timestamp.getUTCDate() !== day
  ) {
    return null;
  }
  // Plain string work on purpose: no backtracking regex over the title.
  const at = title.indexOf(whole);
  let before = title.slice(0, at).trimEnd();
  if (before.toLowerCase().endsWith(' on')) before = before.slice(0, -3).trimEnd();
  const after = title.slice(at + whole.length).trimStart();
  const joiner = after === '' || ':,.;)'.includes(after.charAt(0)) ? '' : ' ';
  const cleaned = `${before}${joiner}${after}`.split(' ').filter(Boolean).join(' ').trim();
  return { title: cleaned, timestamp };
}

/**
 * Rows stamped AFTER the day in their title were back-dated imports: they move
 * to that day and lose the date. Rows stamped ON that day already have the
 * right time, so they keep it and only lose the date from the title. Rows
 * stamped before it (e.g. "Meeting booked for 20/11/2026") are left alone.
 */
export function planTitleDateFix(row: { title: string; timestamp: Date }): TitleDateFix | null {
  const fix = parseTitleDate(row.title);
  if (!fix || !fix.title) return null;
  const stamped = new Date(row.timestamp);
  const sameDay = stamped.toISOString().slice(0, 10) === fix.timestamp.toISOString().slice(0, 10);
  if (sameDay) return { title: fix.title, timestamp: stamped };
  if (stamped <= fix.timestamp) return null;
  return fix;
}

// ---------------------------------------------------------------------------
// Part 2: COA pipeline-sync notes
// ---------------------------------------------------------------------------

export const OLD_COA_TITLE_PREFIX = 'COA pipeline:';

interface CoaRow {
  title: string;
  description: string | null;
  timestamp: Date;
  metadata: unknown;
  lead: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    email: string;
  } | null;
}

export interface CoaFix {
  title: string;
  description: string;
  timestamp: Date;
}

/** from/to: metadata first (new rows), else the old body's "CRM status X → Y". */
export function readStatuses(
  metadata: Record<string, unknown>,
  description: string
): { from: string; to: string } | null {
  if (typeof metadata.fromStatus === 'string' && typeof metadata.toStatus === 'string') {
    return { from: metadata.fromStatus, to: metadata.toStatus };
  }
  const m = /CRM status ([A-Z_]+) → ([A-Z_]+)/.exec(description);
  return m ? { from: m[1]!, to: m[2]! } : null;
}

export function planCoaFix(row: CoaRow, now: Date = new Date()): CoaFix | null {
  if (!row.title.startsWith(OLD_COA_TITLE_PREFIX)) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (meta.source !== 'coa-pipeline-sync') return null;
  if (typeof meta.coaStage !== 'string' || typeof meta.stageChangedAt !== 'string') return null;
  const statuses = readStatuses(meta, row.description ?? '');
  if (!statuses) return null;

  const copy = describePipelineSyncCopy({
    firstName: row.lead?.firstName,
    lastName: row.lead?.lastName,
    company: row.lead?.company,
    email: row.lead?.email,
    coaStage: meta.coaStage,
    stageChangedAt: meta.stageChangedAt,
    from: statuses.from,
    to: statuses.to,
    conversionPending: meta.conversionPending === true,
    refusal:
      meta.qualificationPending === true
        ? {
            score:
              typeof meta.qualificationScore === 'number' ? meta.qualificationScore : undefined,
            minScore:
              typeof meta.qualificationMinScore === 'number'
                ? meta.qualificationMinScore
                : undefined,
          }
        : null,
    wonTag: 'coa-won',
    qualifiedTag: 'coa-qualified',
  });

  const at = new Date(meta.stageChangedAt);
  const timestamp = Number.isNaN(at.getTime()) || at > now ? new Date(row.timestamp) : at;
  return { ...copy, timestamp };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

type Prisma = InstanceType<typeof PrismaClient>;

export interface Totals {
  imports: number;
  coa: number;
  skipped: number;
}

function scopeWhere(args: ParsedArgs) {
  return {
    ...(args.tenantFilter ? { tenantId: args.tenantFilter } : {}),
    ...(args.leadFilter ? { leadId: args.leadFilter } : {}),
  };
}

async function applyFix(
  prisma: Prisma,
  row: { id: string; tenantId: string },
  data: { title: string; description?: string; timestamp: Date }
): Promise<void> {
  // Scoped to this row's own id AND tenantId: never another tenant's row.
  await prisma.leadActivity.update({ where: { id: row.id, tenantId: row.tenantId }, data });
}

interface FixedRow {
  id: string;
  tenantId: string;
  title: string;
  timestamp: Date;
}

/** Walks one query in id order, BATCH_SIZE rows at a time. */
async function forEachBatch<T extends { id: string }>(
  fetch: (page: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  visit: (row: T) => Promise<void>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetch({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) await visit(row);
    if (rows.length < BATCH_SIZE) return;
    cursor = rows[rows.length - 1]!.id;
  }
}

async function handleRow(
  prisma: Prisma,
  args: ParsedArgs,
  kind: 'import' | 'coa',
  row: FixedRow,
  fix: { title: string; description?: string; timestamp: Date } | null,
  totals: Totals
): Promise<void> {
  if (!fix) {
    totals.skipped += 1;
    return;
  }
  totals[kind === 'import' ? 'imports' : 'coa'] += 1;
  console.log(
    `${TAG} ${args.isApply ? 'setting' : 'would set'} ${kind} row=${row.id} tenant=${row.tenantId}` +
      ` timestamp ${row.timestamp.toISOString()} -> ${fix.timestamp.toISOString()}` +
      ` title ${JSON.stringify(row.title)} -> ${JSON.stringify(fix.title)}` +
      (fix.description === undefined ? '' : ` description -> ${JSON.stringify(fix.description)}`)
  );
  if (args.isApply) await applyFix(prisma, row, fix);
}

export async function runImports(prisma: Prisma, args: ParsedArgs, totals: Totals): Promise<void> {
  await forEachBatch(
    (page) =>
      prisma.leadActivity.findMany({
        where: { ...scopeWhere(args), title: { contains: '/' } },
        select: { id: true, tenantId: true, title: true, timestamp: true },
        orderBy: { id: 'asc' },
        ...page,
      }),
    (row) => handleRow(prisma, args, 'import', row, planTitleDateFix(row), totals)
  );
}

export async function runCoa(prisma: Prisma, args: ParsedArgs, totals: Totals): Promise<void> {
  await forEachBatch(
    (page) =>
      prisma.leadActivity.findMany({
        where: {
          ...scopeWhere(args),
          title: { startsWith: OLD_COA_TITLE_PREFIX },
          metadata: { path: ['source'], equals: 'coa-pipeline-sync' },
        },
        select: {
          id: true,
          tenantId: true,
          title: true,
          description: true,
          timestamp: true,
          metadata: true,
          lead: { select: { firstName: true, lastName: true, company: true, email: true } },
        },
        orderBy: { id: 'asc' },
        ...page,
      }),
    (row) => handleRow(prisma, args, 'coa', row, planCoaFix(row), totals)
  );
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
      (args.leadFilter ? ` lead=${args.leadFilter}` : '') +
      (args.only ? ` only=${args.only}` : '')
  );

  const totals: Totals = { imports: 0, coa: 0, skipped: 0 };
  try {
    if (args.only !== 'coa') await runImports(prisma, args, totals);
    if (args.only !== 'imports') await runCoa(prisma, args, totals);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`${TAG} summary:`, { ...totals, mode: args.isApply ? 'APPLY' : 'DRY-RUN' });
}

// CLI entry point guard: importing this module (e.g. from a test) must not
// run main(), connect to a database, or call process.exit().
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('backfill-activity-event-times.ts')
) {
  main().catch((err) => {
    console.error(`${TAG} FAILED:`, err);
    process.exit(1);
  });
}
