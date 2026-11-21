/**
 * One ticket activity row as a unified feed item. The feed and the search both list ticket
 * activity, so the mapping lives here once. The actor id is the author's user id (null for the
 * customer, the system and entries written before it was stored).
 */
import type { UnifiedActivityItem } from '@intelliflow/domain';
import { TICKET_ACTIVITY_TYPE_MAP } from './activity-feed-type-maps';

export interface TicketActivityRow {
  id: string;
  type: string;
  content: string;
  isInternal: boolean;
  timestamp: Date;
  authorId: string | null;
  authorName: string;
  systemEventData: unknown;
  ticket: { id: string; subject: string; ticketNumber: string } | null;
}

export function toTicketActivityItem(r: TicketActivityRow): UnifiedActivityItem {
  return {
    id: `ticket_${r.id}`,
    source: 'TICKET_ACTIVITY' as const,
    type: TICKET_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
    title: r.content.length > 100 ? r.content.slice(0, 100) + '...' : r.content,
    description: r.isInternal ? '[Internal note]' : null,
    timestamp: r.timestamp,
    actor: { id: r.authorId ?? null, name: r.authorName },
    entity: r.ticket
      ? {
          id: r.ticket.id,
          type: 'TICKET' as const,
          name: `${r.ticket.ticketNumber}: ${r.ticket.subject}`,
        }
      : null,
    metadata: r.systemEventData as Record<string, unknown> | null,
  };
}
