'use client';

/**
 * TicketCard — Card/grid view for ticket list (PG-137)
 *
 * @implements AC-13 (Components extracted to components/tickets/)
 */

import { Card } from '@intelliflow/ui';
import { SLAIndicator } from './SLAIndicator';
import { getPriorityConfig } from '@/lib/tickets/ticket-utils';
import type { TicketListItem } from './types';

interface TicketCardProps {
  ticket: TicketListItem;
  onClick: () => void;
  onQuickAction?: (action: 'resolve' | 'escalate' | 'assign') => void;
  compact?: boolean;
}

export function TicketCard({ ticket, onClick, onQuickAction, compact = false }: Readonly<TicketCardProps>) {
  const priorityConfig = getPriorityConfig(ticket.priority);

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer group bg-card border-border"
      onClick={onClick}
      role="article"
      aria-label={`Ticket ${ticket.ticketNumber}: ${ticket.subject}`}
    >
      {/* Header: Subject + Ticket ID */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-primary">#{ticket.ticketNumber}</span>
          <h3 className="text-sm font-semibold text-foreground truncate mt-0.5">
            {ticket.subject}
          </h3>
        </div>
        <SLAIndicator
          slaStatus={ticket.slaStatus}
          slaTimeRemaining={ticket.slaTimeRemaining}
          size="sm"
        />
      </div>

      {/* Middle: Contact, Priority */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground truncate">{ticket.contactName}</span>
        <span className="text-muted-foreground">·</span>
        <div
          className={`flex items-center gap-1 text-xs font-semibold uppercase ${priorityConfig.text}`}
        >
          <span
            className="material-symbols-outlined text-[14px]"
            style={{
              fontVariationSettings: ticket.priority === 'CRITICAL' ? "'FILL' 1" : undefined,
            }}
          >
            {priorityConfig.icon}
          </span>
          {priorityConfig.label}
        </div>
      </div>

      {/* Bottom: Assignee + Timestamp + Quick Actions */}
      {!compact && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            {ticket.assignee ? (
              <>
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                  {ticket.assigneeAvatar}
                </div>
                <span className="text-xs text-muted-foreground">{ticket.assignee}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">Unassigned</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{ticket.updatedAt}</span>
        </div>
      )}

      {/* Quick Actions (hover) */}
      {onQuickAction && (
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAction('resolve');
            }}
            className="flex-1 py-1 text-[10px] font-semibold rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            aria-label="Resolve ticket"
          >
            Resolve
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAction('escalate');
            }}
            className="flex-1 py-1 text-[10px] font-semibold rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            aria-label="Escalate ticket"
          >
            Escalate
          </button>
        </div>
      )}
    </Card>
  );
}
