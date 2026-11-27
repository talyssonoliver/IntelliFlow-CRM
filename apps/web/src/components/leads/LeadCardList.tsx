'use client';

import { EmptyState, TableRowActions } from '@intelliflow/ui';
import type { Lead } from '@/lib/leads/lead-types';
import { leadDisplayName, leadListSubtitle } from '@/lib/leads/lead-format';
import {
  emailComposeHref,
  formatLeadListDate,
  leadMenuActions,
  leadQuickActions,
  type LeadRowActionHandlers,
} from '@/lib/leads/lead-row-actions';
import { LeadStatusBadge } from '@/components/leads/lead-detail';
import { LeadAvatar } from '@/components/leads/LeadAvatar';
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';

export interface LeadCardListProps {
  readonly leads: readonly Lead[];
  readonly handlers: LeadRowActionHandlers;
  readonly onOpen: (lead: Lead) => void;
  readonly timezone?: string;
  readonly emptyMessage: string;
  readonly className?: string;
}

/**
 * The lead list on a phone: one card per lead with the name, company, score, status,
 * created date and the same actions as the desktop table row, so nothing is cut off
 * at 390 px. The desktop table stays as it is.
 */
export function LeadCardList({
  leads,
  handlers,
  onOpen,
  timezone,
  emptyMessage,
  className,
}: LeadCardListProps) {
  if (leads.length === 0) {
    return (
      <div className={className} data-testid="lead-card-list-empty">
        <EmptyState entity="leads" showCta={false} description={emptyMessage} />
      </div>
    );
  }
  return (
    <ul className={`flex flex-col gap-3 ${className ?? ''}`} aria-label="Leads">
      {leads.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          handlers={handlers}
          onOpen={onOpen}
          timezone={timezone}
        />
      ))}
    </ul>
  );
}

function LeadCard({
  lead,
  handlers,
  onOpen,
  timezone,
}: Readonly<{
  lead: Lead;
  handlers: LeadRowActionHandlers;
  onOpen: (lead: Lead) => void;
  timezone?: string;
}>) {
  const name = leadDisplayName(lead);
  const subtitle = leadListSubtitle(lead);
  return (
    <li
      data-testid={`lead-card-${lead.id}`}
      className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <button
        type="button"
        onClick={() => onOpen(lead)}
        className="flex w-full min-w-0 items-center gap-3 text-left"
      >
        <LeadAvatar lead={lead} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{name}</span>
          {subtitle && (
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
          )}
        </span>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LeadScoreBadge
          score={lead.score}
          scoringStatus={lead.scoringStatus}
          scoreConfidence={lead.scoreConfidence}
        />
        <LeadStatusBadge status={lead.status} />
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {formatLeadListDate(lead.createdAt, timezone)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
        <a
          href={emailComposeHref(lead.email)}
          className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
        >
          {lead.email}
        </a>
        <TableRowActions
          quickActions={leadQuickActions(lead)}
          dropdownActions={leadMenuActions(lead, handlers)}
        />
      </div>
    </li>
  );
}
