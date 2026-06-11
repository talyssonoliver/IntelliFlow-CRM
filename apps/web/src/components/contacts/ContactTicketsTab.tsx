import { Card, EmptyState } from '@intelliflow/ui';

import { formatTicketMeta, getTicketStatusColor, type TicketViewModel } from './contact-tab-format';

export interface ContactTicketsTabProps {
  /** Tickets for this contact (already normalised to view models). */
  tickets: TicketViewModel[];
  /** Formats an ISO date into a relative-time label (e.g. "2 days ago"). */
  formatRelativeTime: (isoDate: string) => string;
}

/**
 * IFC-256: Contact 360 → Tickets tab. Renders the contact's real tickets (or a
 * proper empty state). Extracted from the route page so it is unit-tested and
 * counted by coverage. The "Create Ticket" action is wired separately (IFC-257).
 */
export function ContactTicketsTab({ tickets, formatRelativeTime }: ContactTicketsTabProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tickets</h3>
        <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
          </svg>{' '}
          Create Ticket
        </button>
      </div>
      <div className="space-y-3" data-testid="contact-tickets-tab">
        {tickets.length === 0 ? (
          <div data-testid="contact-tickets-empty">
            <EmptyState entity="tickets" phase="passive" className="py-2" />
          </div>
        ) : (
          tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${getTicketStatusColor(
                    ticket.status
                  )}`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{ticket.subject}</p>
                  <p className="text-xs text-slate-500">
                    {formatTicketMeta(ticket.ticketNumber, ticket.status, ticket.priority)}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500">{formatRelativeTime(ticket.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
