/**
 * ai-monitoring-retention.ts (Supabase egress audit 1126)
 *
 * Rolls `ai_monitoring_events` rows older than N days (default 90) into one row per
 * (UTC day, event type, tenant, model) in `ai_monitoring_daily_summaries` (counts, flagged
 * count, sum, min, max, p50/p95/p99), then deletes the detailed rows it rolled up.
 *
 * NOT SCHEDULED, and it must never be run against production without the owner's yes. Deleting
 * rows is on the owner's list (CLAUDE.md "What must never happen without him").
 *
 * Safety:
 *   - DRY RUN by default: only SELECTs; prints how many rows and days it would roll up.
 *   - --apply needs --owner-approved "<who said yes, when>" (recorded in the log line).
 *   - --apply refuses a Supabase host (production) unless ALLOW_PRODUCTION_RETENTION is set to
 *     the same reference as --owner-approved. The two have to be typed on purpose.
 *   - --days must be at least 7. The cutoff is a whole UTC day, so a day is never half rolled up.
 *   - Each day is one transaction: insert the summaries, check that their event counts add up to
 *     the rows of that day, and only then delete those rows. A mismatch rolls the day back and
 *     stops the run; nothing is deleted on a doubt.
 *   - Idempotent: a re-run inserts nothing twice (the summary key is unique) and deletes only
 *     days that verify.
 *   - `drift` events are kept by default (a few dozen rows, with the p-value, windows and
 *     recommendations in the payload that a summary cannot hold). --include-drift rolls them too.
 *   - The summary keeps no payload: after --apply the payload of a rolled-up event is gone.
 *
 * Note: apps/ai-worker/src/monitoring/monitoring-flush.service.ts already deletes events older
 * than 30 days once a day (cleanupOldEvents). While that runs, nothing older than 30 days is left
 * for this script. To keep history, this must run BEFORE that delete (or that delete be changed
 * to call this roll-up). See docs/operations/supabase-egress-audit-1126.md.
 *
 * Usage:
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/ai-monitoring-retention.ts
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/ai-monitoring-retention.ts --days 60
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/ai-monitoring-retention.ts --apply --owner-approved "Talysson 2026-12-01"
 */
import {
  connect,
  databaseUrl,
  modeOf,
  runWhenInvoked,
  type BackfillPrisma,
} from './lib/backfill-cli';

const TAG = '[ai-monitoring-retention]';
export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionArgs {
  isApply: boolean;
  days: number;
  ownerApproved: string | undefined;
  includeDrift: boolean;
}

/** Parses the flags. Throws on a bad value rather than guessing. */
export function parseArgs(argv: string[]): RetentionArgs {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  let days = DEFAULT_RETENTION_DAYS;
  const rawDays = value('--days');
  if (argv.includes('--days')) {
    days = Number(rawDays);
    if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS) {
      throw new Error(
        `--days must be a whole number of at least ${MIN_RETENTION_DAYS}: ${rawDays}`
      );
    }
  }
  const ownerApproved = value('--owner-approved')?.trim();
  return {
    isApply: argv.includes('--apply'),
    days,
    ownerApproved: ownerApproved ? ownerApproved : undefined,
    includeDrift: argv.includes('--include-drift'),
  };
}

/** Start of the UTC day `days` days before `now`: rows strictly before it are rolled up. */
export function cutoffFor(now: Date, days: number): Date {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(startOfToday - days * DAY_MS);
}

/** True for a Supabase-hosted database, which is production here. */
export function isProductionHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.supabase.co') || host.endsWith('.supabase.com');
  } catch {
    // An unparseable URL is not trusted: treat it as production so --apply refuses it.
    return true;
  }
}

/** Throws unless an --apply run has the owner's reference and, for production, the second key. */
export function assertMayApply(args: RetentionArgs, url: string, env: NodeJS.ProcessEnv): void {
  if (!args.isApply) return;
  if (!args.ownerApproved) {
    throw new Error(
      '--apply needs --owner-approved "<who said yes, and when>": deleting rows is the owner\'s call'
    );
  }
  if (isProductionHost(url) && env['ALLOW_PRODUCTION_RETENTION'] !== args.ownerApproved) {
    throw new Error(
      'refusing to --apply against a Supabase (production) database: set ALLOW_PRODUCTION_RETENTION to the same text as --owner-approved'
    );
  }
}

/** The minimal database surface the script uses (a PrismaClient, or a fake in the tests). */
export interface RetentionDb {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
  $transaction: <T>(
    fn: (tx: RetentionTx) => Promise<T>,
    options?: { timeout?: number }
  ) => Promise<T>;
}
export interface RetentionTx {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

interface DayRow {
  day: string;
  events: number;
}

const TYPE_FILTER_KEEP_DRIFT = `AND "eventType" <> 'drift'`;

function typeFilter(args: RetentionArgs): string {
  return args.includeDrift ? '' : TYPE_FILTER_KEEP_DRIFT;
}

/** Per-day row counts older than the cutoff (read-only). */
export async function daysToRoll(
  db: Pick<RetentionDb, '$queryRawUnsafe'>,
  cutoff: Date,
  args: RetentionArgs
): Promise<DayRow[]> {
  const rows = await db.$queryRawUnsafe<Array<{ day: string; events: number | bigint }>>(
    `SELECT to_char(date_trunc('day', "recordedAt"), 'YYYY-MM-DD') AS day, count(*)::int AS events
       FROM ai_monitoring_events
      WHERE "recordedAt" < $1::timestamp ${typeFilter(args)}
      GROUP BY 1
      ORDER BY 1`,
    cutoff.toISOString()
  );
  return rows.map((r) => ({ day: r.day, events: Number(r.events) }));
}

/**
 * Roll up one UTC day and delete its detailed rows, in the caller's transaction.
 * Returns how many summary rows were written and how many events were deleted. Throws, so the
 * transaction rolls back, when the summaries do not account for every event of the day.
 */
export async function rollUpDay(
  tx: RetentionTx,
  day: string,
  args: RetentionArgs
): Promise<{ summaries: number; deleted: number }> {
  const filter = typeFilter(args);
  const inDay = `"recordedAt" >= $1::date AND "recordedAt" < ($1::date + 1) ${filter}`;

  const inserted = await tx.$executeRawUnsafe(
    `INSERT INTO ai_monitoring_daily_summaries
       (id, day, "eventType", "tenantKey", model, "eventCount", "flaggedCount",
        "valueSum", "valueMin", "valueMax", "valueP50", "valueP95", "valueP99")
     SELECT gen_random_uuid()::text, $1::date, "eventType", COALESCE("tenantId", ''), COALESCE(model, ''),
            count(*)::int,
            (count(*) FILTER (WHERE flagged IS TRUE))::int,
            sum(value), min(value), max(value),
            percentile_disc(0.50) WITHIN GROUP (ORDER BY value),
            percentile_disc(0.95) WITHIN GROUP (ORDER BY value),
            percentile_disc(0.99) WITHIN GROUP (ORDER BY value)
       FROM ai_monitoring_events
      WHERE ${inDay}
      GROUP BY "eventType", COALESCE("tenantId", ''), COALESCE(model, '')
     ON CONFLICT (day, "eventType", "tenantKey", model) DO NOTHING`,
    day
  );

  // The check that makes the delete safe: the day's summaries must account for every event.
  const [{ events }] = await tx.$queryRawUnsafe<Array<{ events: number | bigint }>>(
    `SELECT count(*)::int AS events FROM ai_monitoring_events WHERE ${inDay}`,
    day
  );
  const [{ summarised }] = await tx.$queryRawUnsafe<Array<{ summarised: number | bigint | null }>>(
    `SELECT COALESCE(sum("eventCount"), 0)::int AS summarised
       FROM ai_monitoring_daily_summaries
      WHERE day = $1::date ${filter}`,
    day
  );
  if (Number(events) !== Number(summarised)) {
    throw new Error(
      `${day}: ${Number(events)} events but the summaries hold ${Number(summarised)}; nothing deleted`
    );
  }

  const deleted = await tx.$executeRawUnsafe(
    `DELETE FROM ai_monitoring_events WHERE ${inDay}`,
    day
  );
  return { summaries: inserted, deleted };
}

export interface RetentionResult {
  days: number;
  events: number;
  summaries: number;
  deleted: number;
}

export async function run(
  db: RetentionDb,
  args: RetentionArgs,
  now: Date = new Date(),
  log: (line: string) => void = console.log
): Promise<RetentionResult> {
  const cutoff = cutoffFor(now, args.days);
  const days = await daysToRoll(db, cutoff, args);
  const events = days.reduce((n, d) => n + d.events, 0);

  log(
    `${TAG} mode=${modeOf(args)} cutoff=${cutoff.toISOString()} retentionDays=${args.days} ` +
      `drift=${args.includeDrift ? 'included' : 'kept'} days=${days.length} events=${events}` +
      (args.isApply ? ` ownerApproved="${args.ownerApproved}"` : '')
  );
  for (const d of days) {
    log(`  ${args.isApply ? 'rolling up' : 'would roll up'} ${d.day}: ${d.events} events`);
  }
  if (!args.isApply || days.length === 0)
    return { days: days.length, events, summaries: 0, deleted: 0 };

  let summaries = 0;
  let deleted = 0;
  for (const d of days) {
    const r = await db.$transaction((tx) => rollUpDay(tx, d.day, args), { timeout: 60_000 });
    summaries += r.summaries;
    deleted += r.deleted;
    log(`  ${d.day}: ${r.summaries} summary rows written, ${r.deleted} events deleted`);
  }
  log(`${TAG} done: ${summaries} summary rows written, ${deleted} events deleted`);
  return { days: days.length, events, summaries, deleted };
}

export async function main(): Promise<void> {
  const url = databaseUrl(TAG);
  if (!url) {
    process.exit(1);
    return;
  }
  const args = parseArgs(process.argv);
  assertMayApply(args, url, process.env);
  const prisma: BackfillPrisma = connect(url);
  try {
    await run(prisma as unknown as RetentionDb, args);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI entry point guard: importing this module (a test) must not run main().
runWhenInvoked(import.meta.url, 'ai-monitoring-retention.ts', main, TAG);
