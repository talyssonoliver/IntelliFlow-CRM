/**
 * The line under a connected Google mailbox whose calendar syncs both ways (MVP-013): what syncs, and
 * when the last round finished.
 */

/** After this long without a finished round the line says the sync may not be running. */
const STALE_AFTER_MS = 2 * 60 * 60_000;

export const CALENDAR_SYNC_SCOPE_NOTE =
  'Your appointments appear in Google Calendar and your Google events in Aurora.';

/** "Last synced …" in the reader's own locale, or the waiting note before the first round. */
export function calendarSyncLine(
  syncedAt: string | null | undefined,
  locale?: string,
  now: number = Date.now()
): string {
  const when = syncedAt ? new Date(syncedAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return `${CALENDAR_SYNC_SCOPE_NOTE} Waiting for the first sync.`;
  }
  const formatted = when.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const stale = now - when.getTime() > STALE_AFTER_MS ? ' It has not synced for a while.' : '';
  return `${CALENDAR_SYNC_SCOPE_NOTE} Last synced ${formatted}.${stale}`;
}
