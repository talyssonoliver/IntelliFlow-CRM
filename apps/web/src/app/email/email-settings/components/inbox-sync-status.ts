/**
 * The line under a connected mailbox whose replies are logged (#1177 Outlook, MVP-001 Zoho Mail):
 * what is logged, and when the last round finished.
 */

export const INBOX_SYNC_SCOPE_NOTE =
  'Mail with your leads and contacts, received or sent from this mailbox, is logged here.';

/** "Last synced …" in the reader's own locale, or the waiting note before the first round. */
export function inboxSyncLine(syncedAt: string | null | undefined, locale?: string): string {
  if (!syncedAt) return `${INBOX_SYNC_SCOPE_NOTE} Waiting for the first sync.`;
  const when = new Date(syncedAt);
  if (Number.isNaN(when.getTime())) return `${INBOX_SYNC_SCOPE_NOTE} Waiting for the first sync.`;
  const formatted = when.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return `${INBOX_SYNC_SCOPE_NOTE} Last synced ${formatted}.`;
}
