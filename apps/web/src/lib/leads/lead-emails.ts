/**
 * What the lead's Emails tab lists (MVP-001): one row per email activity, with which way the mail
 * went. The mail sync records the direction in the activity's metadata (inbound: received from the
 * lead or contact; outbound: sent from the connected mailbox). Mail logged before that was
 * recorded has no direction and keeps reading "Sent", as it always did, except a reply: a
 * title that starts "Reply received" reads as received.
 */
export type EmailDirection = 'inbound' | 'outbound';

export interface LeadEmailRow {
  id: string;
  subject: string;
  status: 'opened' | 'sent';
  /** Null for mail logged before the direction was recorded, unless its title says it is a reply. */
  direction: EmailDirection | null;
  sentAt: string;
  openCount: number;
}

/** The part of an activity the rows are built from. */
export interface EmailActivityLike {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  metadata?: {
    subject?: string;
    opened?: boolean;
    openCount?: number;
    direction?: string;
  } | null;
}

const REPLY_RECEIVED_TITLE = /^reply received\b/i;

/** The stored direction; with none, a "Reply received" title is inbound, anything else unknown. */
function directionOf(value: string | undefined, title: string): EmailDirection | null {
  if (value === 'inbound' || value === 'outbound') return value;
  return REPLY_RECEIVED_TITLE.test(title.trim()) ? 'inbound' : null;
}

export function leadEmailRows(activities: EmailActivityLike[]): LeadEmailRow[] {
  return activities
    .filter((activity) => activity.type === 'email')
    .map((activity) => ({
      id: activity.id,
      subject: activity.metadata?.subject || activity.title,
      status: activity.metadata?.opened ? 'opened' : 'sent',
      direction: directionOf(activity.metadata?.direction, activity.title),
      sentAt: activity.timestamp,
      openCount: activity.metadata?.openCount || 0,
    }));
}

/** The badge on a row: mail received from the lead says so; the rest reads as it always did. */
export function emailRowLabel(
  row: Pick<LeadEmailRow, 'direction' | 'status' | 'openCount'>
): string {
  if (row.direction === 'inbound') return 'Received';
  return row.status === 'opened' ? `Opened ${row.openCount}x` : 'Sent';
}
