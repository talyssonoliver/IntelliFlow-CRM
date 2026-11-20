/**
 * The open rate on a lead's profile card, from the CRM's own email records for the lead's address.
 * Until now the card read only the lead's activities, whose metadata carries open data for few
 * mails, so it showed a dash for leads who had been mailed and had opened mail.
 *
 * A mail counts as a tracked send when it left (SENT, DELIVERED, OPENED, CLICKED) to the address (To,
 * Cc or Bcc, not an address it bounced for) and was sent from the CRM itself, or was opened at all, so
 * mail with no tracking cannot make an open rate of "0%". Mail sent from the CRM has the sending user
 * and stores no direction. Mail synced from a connected mailbox's Sent folder also has the user but
 * stores `direction` and a sync `source` (it carries no open tracking), and mail logged by hand has no
 * user, so neither counts as a send unless it was opened.
 *
 * It is opened when the record says so: openCount above 0, an openedAt, or the status OPENED/CLICKED.
 */

export interface EngagementRecord {
  status: string;
  userId: string | null;
  metadata: unknown;
  openCount: number | null;
  openedAt: Date | null;
  toEmail: string;
  ccEmails: string | null;
  bccEmails: string | null;
}

const LEFT = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'];

/** Lower-cased addresses in a comma, semicolon or space separated list (display names dropped). */
function addresses(list: string | null | undefined): string[] {
  return (list ?? '')
    .split(/[,;\s<>]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes('@'));
}

function bounced(metadata: unknown): Set<string> {
  const out = new Set<string>();
  const m = (metadata ?? {}) as Record<string, unknown>;
  for (const key of ['bouncedRecipients', 'hardBouncedRecipients', 'rejectedRecipients']) {
    const list = m[key];
    if (Array.isArray(list))
      for (const a of list) if (typeof a === 'string') out.add(a.toLowerCase());
  }
  return out;
}

/** Mail the CRM read from a mailbox (it stores a direction and a source), not mail the CRM sent. */
function isSynced(metadata: unknown): boolean {
  const m = (metadata ?? {}) as { direction?: unknown; source?: unknown };
  return typeof m.direction === 'string' || typeof m.source === 'string';
}

function isOpened(r: EngagementRecord): boolean {
  return (
    (r.openCount ?? 0) > 0 || r.openedAt !== null || r.status === 'OPENED' || r.status === 'CLICKED'
  );
}

export function leadEmailEngagement(
  records: readonly EngagementRecord[],
  address: string
): { sent: number; opened: number } {
  const to = address.trim().toLowerCase();
  let sent = 0;
  let opened = 0;
  for (const r of records) {
    const direction = (r.metadata as { direction?: unknown } | null)?.direction;
    if (direction === 'inbound' || !LEFT.includes(r.status)) continue;
    const reached = [...addresses(r.toEmail), ...addresses(r.ccEmails), ...addresses(r.bccEmails)];
    if (!reached.includes(to) || bounced(r.metadata).has(to)) continue;
    const wasOpened = isOpened(r);
    const sentFromCrm = r.userId !== null && !isSynced(r.metadata);
    if (!sentFromCrm && !wasOpened) continue; // synced or logged mail carries no tracking
    sent += 1;
    if (wasOpened) opened += 1;
  }
  return { sent, opened };
}
