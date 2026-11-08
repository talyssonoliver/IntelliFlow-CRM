/**
 * backfill-tenant-trial-ends-at.ts (#1220)
 *
 * The additive migration `20261107120000_tenant_trial_ends_at` adds a nullable
 * `tenants.trialEndsAt`, and new self-service sign-ups now store it. Existing tenants
 * hold NULL, and the API falls back to createdAt + 14 days for them, which already reads
 * "0 days left" for most. The owner's rule (2026-11-07): every existing trial tenant gets
 * a fresh trial ending 14 days after the deploy date.
 *
 * A tenant gets a value only when ALL hold:
 *   - trialEndsAt IS NULL (idempotent: a re-run never moves a stored end),
 *   - source = 'DIRECT' (a partner-provisioned tenant was granted its plan, not a trial),
 *   - plan <> 'PARTNER_FREE',
 *   - it has no live subscription (ACTIVE or PAST_DUE): a paying tenant isn't on a trial.
 *
 * Safety (ADR-069 Class B: it rewrites existing rows):
 *   - Dry-run by default: prints how many tenants and which, writes nothing.
 *   - --apply also needs --start <ISO date>, the deploy date the 14 days count from, so a
 *     run can't silently use "now".
 *   - Each write repeats the eligibility check in its WHERE, so a tenant that started paying
 *     between the read and the write is left alone.
 *   - It does not decide to run itself against production. Run the dry run, show the owner
 *     the count, and apply only with the owner's yes, against the database named.
 *
 * Usage:
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-tenant-trial-ends-at.ts
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/backfill-tenant-trial-ends-at.ts --start 2026-11-10 --apply
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ParsedArgs {
  isApply: boolean;
  start: Date | undefined;
}

/** Parses `--apply` and `--start <ISO date>`; an unparseable date is an error, not "now". */
export function parseArgs(argv: string[]): ParsedArgs {
  const isApply = argv.includes('--apply');
  const at = argv.indexOf('--start');
  const raw = at !== -1 ? argv[at + 1] : undefined;
  if (raw === undefined) return { isApply, start: undefined };
  const start = new Date(raw);
  if (Number.isNaN(start.getTime())) throw new Error(`--start is not a date: ${raw}`);
  return { isApply, start };
}

/** When a trial counted from `start` ends. */
export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

type Prisma = InstanceType<typeof PrismaClient>;

/** The tenants the rule covers, minus the paying ones. Also the WHERE of every write. */
export function eligibleWhere(payingIds: string[]) {
  return {
    trialEndsAt: null,
    source: 'DIRECT' as const,
    plan: { not: 'PARTNER_FREE' as const },
    id: { notIn: payingIds },
  };
}

/** Tenant ids with a live paid subscription: never put on a trial. */
export async function payingTenantIds(prisma: Prisma): Promise<string[]> {
  const rows = await prisma.stripeSubscription.findMany({
    where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
    select: { tenantId: true },
  });
  return [...new Set(rows.map((r) => r.tenantId))];
}

export async function run(prisma: Prisma, args: ParsedArgs, log = console.log): Promise<number> {
  if (args.isApply && !args.start) {
    throw new Error('--apply needs --start <deploy date>: the 14 days count from it');
  }
  const start = args.start ?? new Date();
  const ends = trialEndFrom(start);
  const paying = await payingTenantIds(prisma);
  const where = eligibleWhere(paying);

  const tenants = await prisma.tenant.findMany({
    where,
    select: { id: true, slug: true, createdAt: true, plan: true },
    orderBy: { createdAt: 'asc' },
  });

  log(
    `[backfill-tenant-trial-ends-at] mode=${args.isApply ? 'APPLY' : 'DRY-RUN'} ` +
      `start=${start.toISOString()} trialEndsAt=${ends.toISOString()} ` +
      `tenants=${tenants.length} skippedPaying=${paying.length}`
  );
  for (const t of tenants) {
    log(
      `  ${args.isApply ? 'setting' : 'would set'} ${t.id} (${t.plan}, created ${t.createdAt.toISOString()})`
    );
  }
  if (!args.isApply || tenants.length === 0) return tenants.length;

  // The WHERE repeats the rule, so nothing that stopped qualifying since the read is touched.
  const { count } = await prisma.tenant.updateMany({
    where: { AND: [where, { id: { in: tenants.map((t) => t.id) } }] },
    data: { trialEndsAt: ends },
  });
  log(`[backfill-tenant-trial-ends-at] updated ${count} of ${tenants.length}`);
  return count;
}

export async function main(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('[backfill-tenant-trial-ends-at] ERROR: DATABASE_URL is not set.');
    process.exit(1);
    return;
  }
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });
  try {
    await run(prisma, args);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI entry point guard — importing this module (e.g. from a test) must not run main().
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('backfill-tenant-trial-ends-at.ts')
) {
  main().catch((err) => {
    console.error('[backfill-tenant-trial-ends-at] FAILED:', err);
    process.exit(1);
  });
}
