/**
 * Clearing of the locations kept for files an erasure left outside the CRM's storage
 * (IFC-316). The location stays on the erasure record for UNMANAGED_LOCATION_DAYS so an
 * administrator can find the file; after that it is cleared.
 *
 * Its own hourly timer, started from `startBackgroundJobs` only (so in the combined worker, never
 * from test servers), like the compliance snapshots. One statement clears every firm's expired
 * rows and nothing else: rows younger than the limit are left alone. Replicas and a repeated run
 * are safe: clearing an already cleared location changes nothing. Opening the privacy requests
 * page still clears the firm's own expired rows as a fallback.
 *
 * Disabled under test, on serverless runtimes and when `DSAR_KEPT_LOCATIONS_INTERVAL_MS=0`.
 */
import { UNMANAGED_LOCATION_DAYS } from '@intelliflow/domain';

/**
 * Hourly, not daily: a worker that restarts or redeploys more than once a day never reaches a
 * 24-hour tick, so the first tick must come soon after start. Each tick is one idempotent
 * statement that only touches rows already past the 30 days, and an hour late is still within
 * the product's promise (the location is also never shown after the 30 days).
 */
export const DEFAULT_KEPT_LOCATIONS_INTERVAL_MS = 3_600_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let active: Promise<unknown> | null = null;

export function keptLocationsIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  const raw = env.DSAR_KEPT_LOCATIONS_INTERVAL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_KEPT_LOCATIONS_INTERVAL_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_KEPT_LOCATIONS_INTERVAL_MS;
  return Math.floor(value);
}

/** The slice of the stored-object repository this job uses. */
export interface KeptLocationsStore {
  /** Clears the kept locations of every firm whose erasure completed before `before`. */
  expireAllLocators(before: Date): Promise<number>;
}

export interface KeptLocationsReport {
  cleared: number;
}

/** One sweep: clears every firm's locations older than the limit. */
export async function runKeptLocationsSweep(
  store: KeptLocationsStore,
  now: Date = new Date()
): Promise<KeptLocationsReport> {
  const before = new Date(now.getTime() - UNMANAGED_LOCATION_DAYS * 86_400_000);
  return { cleared: await store.expireAllLocators(before) };
}

export async function createKeptLocationsStore(): Promise<KeptLocationsStore> {
  const [{ prisma }, { PrismaStoredObjectRepository }] = await Promise.all([
    import('@intelliflow/db'),
    import('@intelliflow/adapters'),
  ]);
  return new PrismaStoredObjectRepository(prisma as never);
}

export interface StartKeptLocationsOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

export function startKeptLocationsScheduler({
  intervalMs,
  run,
  log = console,
}: StartKeptLocationsOptions): boolean {
  if (intervalMs <= 0 || timer !== null) return false;
  timer = setInterval(() => {
    if (timer === null || running) return;
    running = true;
    active = run()
      .catch((error: unknown) => {
        // No personal data in the log: the error class only.
        log.warn(
          `[kept-locations] tick failed: ${error instanceof Error ? error.name : 'unknown'}`
        );
      })
      .finally(() => {
        running = false;
        active = null;
      });
  }, intervalMs);
  timer.unref?.();
  log.info(`[kept-locations] started (every ${String(intervalMs)} ms)`);
  return true;
}

export async function stopKeptLocationsScheduler(): Promise<void> {
  if (timer !== null) clearInterval(timer);
  timer = null;
  const inflight = active;
  running = false;
  await inflight?.catch(() => undefined);
}
