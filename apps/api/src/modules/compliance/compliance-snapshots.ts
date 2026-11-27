/**
 * Compliance snapshots (PG-194): the stored daily history behind the dashboard's trend.
 *
 * One row per tenant, UTC day and framework, written by the daily job and by the dashboard's
 * Refresh. Writing again the same day replaces that day's row, so a refresh never adds a point.
 */
import {
  FRAMEWORK_IDS,
  buildOverview,
  collectEvidence,
  isCompleteEvidence,
  utcDay,
  type EvidenceDb,
  type Overview,
  type SnapshotPoint,
} from './compliance-evidence';

export interface SnapshotWriter {
  complianceSnapshot: {
    upsert(args: unknown): Promise<unknown>;
  };
}

export interface SnapshotDb extends SnapshotWriter {
  complianceSnapshot: SnapshotWriter['complianceSnapshot'] & {
    findMany(args: unknown): Promise<
      Array<{
        frameworkId: string;
        day: Date;
        score: number | null;
        passing: number;
        attention: number;
        notMeasured: number;
      }>
    >;
  };
  /** Runs `fn` in one database transaction: it commits when `fn` resolves, rolls back when it throws. */
  $transaction<T>(fn: (tx: SnapshotWriter) => Promise<T>): Promise<T>;
}

export async function recordSnapshot(
  db: SnapshotDb,
  tenantId: string,
  overview: Overview,
  now: Date = new Date()
): Promise<number> {
  const day = utcDay(now);
  const write = (tx: SnapshotWriter, f: Overview['frameworks'][number]) =>
    tx.complianceSnapshot.upsert({
      where: { tenantId_day_frameworkId: { tenantId, day, frameworkId: f.id } },
      create: {
        tenantId,
        day,
        frameworkId: f.id,
        score: f.score,
        passing: f.counts.passing,
        attention: f.counts.attention,
        notMeasured: f.counts.notMeasured,
      },
      update: {
        score: f.score,
        passing: f.counts.passing,
        attention: f.counts.attention,
        notMeasured: f.counts.notMeasured,
      },
    });
  // The last framework is written last and is the marker the daily job looks for. Everything is
  // in one transaction, so a failure part-way rolls back and an earlier snapshot of the day (and
  // its marker) is never left mixed with newer rows.
  const last = FRAMEWORK_IDS[FRAMEWORK_IDS.length - 1]!;
  const ordered = [
    ...overview.frameworks.filter((f) => f.id !== last),
    ...overview.frameworks.filter((f) => f.id === last),
  ];
  await db.$transaction(async (tx) => {
    for (const f of ordered) await write(tx, f);
  });
  return overview.frameworks.length;
}

/** The framework whose row marks a day as completely stored. */
export const DAY_MARKER_FRAMEWORK = FRAMEWORK_IDS[FRAMEWORK_IDS.length - 1]!;

export const TREND_WINDOW_DAYS = 90;

/** Stored points per framework for the last `days` days, oldest first. */
export async function readHistory(
  db: SnapshotDb,
  tenantId: string,
  days: number = TREND_WINDOW_DAYS,
  now: Date = new Date()
): Promise<Record<string, SnapshotPoint[]>> {
  const since = new Date(utcDay(now).getTime() - days * 86_400_000);
  const rows = await db.complianceSnapshot.findMany({
    where: { tenantId, day: { gte: since } },
    orderBy: { day: 'asc' },
  });
  const byFramework: Record<string, SnapshotPoint[]> = {};
  for (const r of rows) {
    (byFramework[r.frameworkId] ??= []).push({
      day: r.day.toISOString().slice(0, 10),
      score: r.score,
      passing: r.passing,
      attention: r.attention,
      notMeasured: r.notMeasured,
    });
  }
  return byFramework;
}

/**
 * Evaluate one tenant and store today's snapshot. A day on which some evidence could not be read
 * is not stored: its score would differ from its neighbours only because of the failed read, and
 * the trend would show that as a change. Returns what was stored (0 when skipped).
 */
export async function snapshotTenant(
  db: EvidenceDb & SnapshotDb,
  tenantId: string,
  now: Date = new Date()
): Promise<{ overview: Overview; stored: number }> {
  const evidence = await collectEvidence(db, tenantId, now);
  const overview = buildOverview(evidence);
  if (!isCompleteEvidence(evidence)) return { overview, stored: 0 };
  return { overview, stored: await recordSnapshot(db, tenantId, overview, now) };
}
