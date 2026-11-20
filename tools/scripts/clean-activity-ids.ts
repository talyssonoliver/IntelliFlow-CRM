/**
 * clean-activity-ids.ts (register row 42)
 *
 * Existing lead_activities rows whose title or description carries a machine id, for example
 * "... COA ledger row cmw5j72u40001p5ug01kf3vot.", get the id (and the label in front of it) removed.
 * New rows are cleaned when they are written (`lead.logActivity`) and when they are shown; this script
 * rewrites the old ones. Metadata is not touched, so nothing is lost.
 *
 * Safety (ADR-069 Class B: a row rewrite on existing production data):
 *   - Dry run by default: prints every planned change and writes nothing. `--apply` writes.
 *   - Tenant scoped: each update is keyed on the row's own id AND tenantId.
 *     `--tenant <id>` and `--lead <id>` narrow the scan.
 *   - Idempotent: a cleaned row no longer carries an id, so a re-run changes nothing.
 *   - Recovery: the dry-run output lists id, old and new text for every row. Save it before `--apply`.
 *
 * Usage:
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/clean-activity-ids.ts
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/clean-activity-ids.ts --tenant <id> --apply
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { stripMachineIds } from '../../packages/validators/src/activity-text';

const BATCH_SIZE = 200;
const TAG = '[clean-activity-ids]';

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

export interface TextFix {
  title: string;
  description: string;
}

/** The cleaned title and description, or null when neither carries an id (or cleaning would empty the title). */
export function planCleanup(row: { title: string; description: string | null }): TextFix | null {
  const description = row.description ?? '';
  const title = stripMachineIds(row.title);
  const cleanedDescription = stripMachineIds(description);
  if (title === '') return null;
  if (title === row.title && cleanedDescription === description) return null;
  return { title, description: cleanedDescription };
}

type Prisma = InstanceType<typeof PrismaClient>;

export interface Totals {
  cleaned: number;
  skipped: number;
}

interface ScanRow {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
}

function scanWhere(args: ParsedArgs) {
  return {
    ...(args.tenantFilter ? { tenantId: args.tenantFilter } : {}),
    ...(args.leadFilter ? { leadId: args.leadFilter } : {}),
  };
}

async function cleanRow(
  prisma: Prisma,
  args: ParsedArgs,
  row: ScanRow,
  totals: Totals
): Promise<void> {
  const fix = planCleanup(row);
  if (!fix) {
    totals.skipped += 1;
    return;
  }
  totals.cleaned += 1;
  console.log(
    `${TAG} ${args.isApply ? 'cleaning' : 'would clean'} row=${row.id} tenant=${row.tenantId}` +
      ` title ${JSON.stringify(row.title)} -> ${JSON.stringify(fix.title)}` +
      ` description ${JSON.stringify(row.description)} -> ${JSON.stringify(fix.description)}`
  );
  if (!args.isApply) return;
  // Scoped to this row's own id AND tenantId: never another tenant's row.
  await prisma.leadActivity.update({ where: { id: row.id, tenantId: row.tenantId }, data: fix });
}

export async function runCleanup(prisma: Prisma, args: ParsedArgs, totals: Totals): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows: ScanRow[] = await prisma.leadActivity.findMany({
      where: scanWhere(args),
      select: { id: true, tenantId: true, title: true, description: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) await cleanRow(prisma, args, row, totals);
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
  const totals: Totals = { cleaned: 0, skipped: 0 };
  try {
    await runCleanup(prisma, args, totals);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`${TAG} summary:`, { ...totals, mode: args.isApply ? 'APPLY' : 'DRY-RUN' });
}

// CLI entry point guard: importing this module (e.g. from a test) must not run main().
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('clean-activity-ids.ts')
) {
  main().catch((err) => {
    console.error(`${TAG} FAILED:`, err);
    process.exit(1);
  });
}
