/**
 * What the lead's Emails tab lists (MVP-001): one row per email activity, with which way the mail
 * went. The mail sync records the direction in the activity's metadata (inbound: received from the
 * lead or contact; outbound: sent from the connected mailbox). Mail logged before that was
 * recorded has no direction and keeps reading "Sent", as it always did.
 */
export type EmailDirection = 'inbound' | 'outbound';

export interface LeadEmailRow {
  id: string;
  subject: string;
  status: 'opened' | 'sent';
  /** Null for mail logged before the direction was recorded. */
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

function directionOf(value: string | undefined): EmailDirection | null {
  return value === 'inbound' || value === 'outbound' ? value : null;
}

export function leadEmailRows(activities: EmailActivityLike[]): LeadEmailRow[] {
  return activities
    .filter((activity) => activity.type === 'email')
    .map((activity) => ({
      id: activity.id,
      subject: activity.metadata?.subject || activity.title,
      status: activity.metadata?.opened ? 'opened' : 'sent',
      direction: directionOf(activity.metadata?.direction),
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
