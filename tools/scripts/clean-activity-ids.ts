/**
 * clean-activity-ids.ts (register row 42)
 *
 * Existing lead_activities rows whose title or description carries the COA ledger row id, for example
 * "... COA ledger row cmw5j72u40001p5ug01kf3vot.", get that sentence part removed.
 * New rows are cleaned when they are written (`lead.logActivity`) and when they are shown; this script
 * rewrites the old ones. Only the title and description change; metadata is not touched. The removed
 * text is kept only in the dry-run output (see Recovery), so save it.
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

import { parseArgs as readFlags } from 'node:util';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { cleanActivityText } from '../../packages/validators/src/activity-text';

const BATCH_SIZE = 200;
const TAG = '[clean-activity-ids]';

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
  leadFilter: string | undefined;
}

/** Reads `--apply`, `--tenant <id>` and `--lead <id>`; anything else is ignored. */
export function parseArgs(argv: string[]): ParsedArgs {
  const { values } = readFlags({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      apply: { type: 'boolean' },
      tenant: { type: 'string' },
      lead: { type: 'string' },
    },
  });
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
  return {
    isApply: values.apply === true,
    tenantFilter: text(values.tenant),
    leadFilter: text(values.lead),
  };
}
export interface TextFix {
  title: string;
  description: string;
}

/** The cleaned title and description, or null when neither carries an id. A title that was only an id becomes "Activity". */
export function planCleanup(row: { title: string; description: string | null }): TextFix | null {
  const fix = cleanActivityText(row);
  if (fix.title === row.title && fix.description === (row.description ?? '')) return null;
  return fix;
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
  const page = async (cursor: string | undefined): Promise<ScanRow[]> =>
    prisma.leadActivity.findMany({
      where: scanWhere(args),
      select: { id: true, tenantId: true, title: true, description: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  // Pages are read one after another (each starts after the last row of the one before); the rows of a page are
  // written together, so there is no await inside a loop.
  const pending = async (cursor: string | undefined): Promise<void> => {
    const rows = await page(cursor);
    await Promise.all(rows.map((row) => cleanRow(prisma, args, row, totals)));
    const last = rows.at(-1);
    if (rows.length === BATCH_SIZE && last) await pending(last.id);
  };
  await pending(undefined);
}

function describeRun(args: ParsedArgs): string {
  const scope = args.tenantFilter ? `tenant=${args.tenantFilter}` : '(all tenants)';
  const lead = args.leadFilter ? ' lead=' + args.leadFilter : '';
  return ` mode=${args.isApply ? 'APPLY' : 'DRY-RUN'} ${scope}${lead}`;
}

function openDatabase(url: string): Prisma {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export async function main(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const url = env['DATABASE_URL'];
  if (!url) {
    console.error(`${TAG} ERROR: DATABASE_URL is not set.`);
    return 1;
  }
  const args = parseArgs(argv);
  console.log(describeRun(args));
  const totals: Totals = { cleaned: 0, skipped: 0 };
  const prisma = openDatabase(url);
  try {
    await runCleanup(prisma, args, totals);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`${TAG} summary:`, { ...totals, mode: args.isApply ? 'APPLY' : 'DRY-RUN' });
  return 0;
}

// CLI entry point guard: importing this module (e.g. from a test) must not run main().
if (process.argv[1]?.endsWith('clean-activity-ids.ts')) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`${TAG} FAILED:`, err);
      process.exitCode = 1;
    }
  );
}
