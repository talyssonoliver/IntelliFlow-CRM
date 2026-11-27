/**
 * Outlook inbox sync scheduler (#1177).
 *
 * The sync runs on its own timer, never inside the bounce scan's tick: a slow Graph read then
 * delays only the next sync tick, and the bounce scan and its heartbeat keep their own pace.
 * Disabled under test, on serverless runtimes, with `EMAIL_INBOX_SYNC=off`, or with
 * `EMAIL_INBOX_SYNC_INTERVAL_MS=0`. A tick is skipped while the previous one is still running;
 * replicas are safe because each mailbox is claimed with a lease. A mailbox is read at most
 * every five minutes (its `nextSyncAt`), so the tick only finds the due ones.
 */
import { inboxSyncEnabled } from './outlook-inbox-sync';

export const DEFAULT_INBOX_SYNC_TICK_MS = 60_000;

interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null;
  /** The tick in flight; also what makes an overlapping tick skip. */
  inflight: Promise<void> | null;
}

const state: SchedulerState = { timer: null, inflight: null };

/** The tick interval, or 0 when the sync must not run in this process. */
export function inboxSyncIntervalFromEnv(env: NodeJS.ProcessEnv): number {
  if (env.NODE_ENV === 'test' || env.VITEST) return 0;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return 0;
  if (!inboxSyncEnabled(env)) return 0;
  const raw = (env.EMAIL_INBOX_SYNC_INTERVAL_MS ?? '').trim();
  const value = raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_INBOX_SYNC_TICK_MS;
}

export interface StartInboxSyncOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  log?: Pick<Console, 'warn' | 'info'>;
}

function tick(run: () => Promise<unknown>, log: Pick<Console, 'warn'>): void {
  if (state.timer === null || state.inflight !== null) return;
  state.inflight = run()
    .then(() => undefined)
    .catch((error: unknown) => {
      log.warn(
        `[email-inbox-sync] tick failed: ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      state.inflight = null;
    });
}

/** Starts the timer; false when disabled or already started. */
export function startInboxSync({ intervalMs, run, log = console }: StartInboxSyncOptions): boolean {
  if (intervalMs <= 0 || state.timer !== null) return false;
  state.timer = setInterval(() => tick(run, log), intervalMs);
  state.timer.unref?.();
  log.info(`[email-inbox-sync] started (every ${String(intervalMs)} ms)`);
  return true;
}

/** Stops the timer and waits for a tick in flight (SIGTERM, tests). */
export async function stopInboxSync(): Promise<void> {
  if (state.timer !== null) clearInterval(state.timer);
  state.timer = null;
  await state.inflight;
}
