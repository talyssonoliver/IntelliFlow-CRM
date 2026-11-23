/**
 * Daily compliance snapshots (PG-194).
 *
 * Its own timer, started from `startBackgroundJobs` only (never from test servers). Each tick
 * stores today's snapshot for up to `COMPLIANCE_SNAPSHOT_BATCH` active firms that have none yet,
 * so after the first tick of a UTC day the next ticks find nothing and cost one query. Disabled
 * under test, on serverless runtimes and when `COMPLIANCE_SNAPSHOT_INTERVAL_MS=0`. Replicas are
 * safe: the snapshot row is unique per tenant, day and framework and a repeat write replaces it.
 *
 * A failing firm is logged by tenant id and skipped; it never stops the rest of the batch.
 */
import { utcDay, type EvidenceDb } from './compliance-evidence';
import { DAY_MARKER_FRAMEWORK, snapshotTenant, type SnapshotDb } from './compliance-snapshots';

export const DEFAULT_COMPLIANCE_SNAPSHOT_INTERVAL_MS = 3_600_000;
export const COMPLIANCE_SNAPSHOT_BATCH = 25;

/** A firm that failed is put aside in this process for this long, so it cannot starve the others. */
export const COMPLIANCE_SNAPSHOT_RETRY_MS = 6 * 3_600_000;
const deferred = new Map<string, number>();

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let active: Promise<unknown> | null = null;

/** Test hook: forget the firms put aside. */
export function resetComplianceSnapshotDeferrals(): void {
  deferred.clear();
}

export function complianceSnapshotIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  const raw = env.COMPLIANCE_SNAPSHOT_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_COMPLIANCE_SNAPSHOT_INTERVAL_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_COMPLIANCE_SNAPSHOT_INTERVAL_MS;
  return Math.floor(value);
}

export interface ComplianceSnapshotJobDb extends EvidenceDb, SnapshotDb {
  tenant: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
  };
}

export interface ComplianceSnapshotReport {
  tenants: number;
  failed: number;
}

export async function runComplianceSnapshots(
  db: ComplianceSnapshotJobDb,
  now: Date = new Date(),
  log: Pick<Console, 'warn'> = console
): Promise<ComplianceSnapshotReport> {
  const day = utcDay(now);
  for (const [id, until] of deferred) if (until <= now.getTime()) deferred.delete(id);
  const tenants = await db.tenant.findMany({
    where: {
      status: 'ACTIVE',
      // A day counts as done only when its last row (the marker) is stored.
      complianceSnapshots: { none: { day, frameworkId: DAY_MARKER_FRAMEWORK } },
      ...(deferred.size > 0 ? { id: { notIn: [...deferred.keys()] } } : {}),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: COMPLIANCE_SNAPSHOT_BATCH,
  });
  let failed = 0;
  for (const t of tenants) {
    try {
      const { stored } = await snapshotTenant(db, t.id, now);
      if (stored === 0) {
        // Some evidence could not be read: try again later, not on every tick.
        failed += 1;
        deferred.set(t.id, now.getTime() + COMPLIANCE_SNAPSHOT_RETRY_MS);
      }
    } catch (error) {
      failed += 1;
      deferred.set(t.id, now.getTime() + COMPLIANCE_SNAPSHOT_RETRY_MS);
      log.warn(
        `[compliance-snapshot] tenant ${t.id} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { tenants: tenants.length, failed };
}

export async function createComplianceSnapshotDb(): Promise<ComplianceSnapshotJobDb> {
  const { prisma } = await import('@intelliflow/db');
  return prisma as unknown as ComplianceSnapshotJobDb;
}

export interface StartComplianceSnapshotOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

export function startComplianceSnapshotScheduler({
  intervalMs,
  run,
  log = console,
}: StartComplianceSnapshotOptions): boolean {
  if (intervalMs <= 0 || timer !== null) return false;
  timer = setInterval(() => {
    if (timer === null || running) return;
    running = true;
    active = run()
      .catch((error: unknown) => {
        log.warn(
          `[compliance-snapshot] tick failed: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        running = false;
        active = null;
      });
  }, intervalMs);
  timer.unref?.();
  log.info(`[compliance-snapshot] started (every ${String(intervalMs)} ms)`);
  return true;
}

export async function stopComplianceSnapshotScheduler(): Promise<void> {
  if (timer !== null) clearInterval(timer);
  timer = null;
  const inflight = active;
  running = false;
  await inflight?.catch(() => undefined);
}
