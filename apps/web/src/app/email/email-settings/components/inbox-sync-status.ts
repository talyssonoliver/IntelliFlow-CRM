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

const PROVIDER_NAME: Record<string, string> = {
  GMAIL: 'Gmail',
  MICROSOFT: 'Outlook',
  ZOHO: 'Zoho Mail',
};

/**
 * The history import's progress, from the real stored counts (no estimate): "Importing email
 * history: 40 of 163 contacts." and, while the provider's rate limits hold it back, that it resumes
 * by itself. Null when nothing is importing.
 */
export function historyImportLine(
  progress: { done: number; total: number; paused: boolean } | null | undefined,
  kind?: string | null
): string | null {
  if (!progress || progress.total <= 0) return null;
  const line = `Importing email history: ${progress.done} of ${progress.total} contacts.`;
  if (!progress.paused) return line;
  const provider = (kind && PROVIDER_NAME[kind]) || 'your mail provider';
  return `${line} Paused by ${provider}'s limits, resumes automatically.`;
}
