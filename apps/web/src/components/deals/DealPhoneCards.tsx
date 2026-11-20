'use client';

/**
 * The deals list on a phone (#43): one card per deal, with the stage and the probability the
 * table hides below md. Each card is a link to the deal, so a tap anywhere on it opens the deal.
 */
import * as React from 'react';
import Link from 'next/link';
import { type Deal, formatCurrencyFull } from './types';
import { DealAvatar, ProbabilityBar, StageBadge, formatDate } from './DealBadges';

const PHONE_QUERY = '(max-width: 767px)';

/** True below the md breakpoint. False on the server and before the first measurement. */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE_QUERY);
    setPhone(query.matches);
    const onChange = () => setPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return phone;
}

export function DealPhoneCards({
  deals,
  timezone,
  renderActions,
}: Readonly<{
  deals: readonly Deal[];
  timezone: string;
  /** The row actions (view, edit, move stage, delete) the table has; beside the card, not inside its link. */
  renderActions?: (deal: Deal) => React.ReactNode;
}>) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Deals">
      {deals.map((deal) => (
        <li
          key={deal.id}
          className="flex items-start rounded-xl border border-border bg-card shadow-sm"
        >
          <Link
            href={`/deals/${deal.id}`}
            className="block min-w-0 flex-1 rounded-xl p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <DealAvatar deal={deal} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {deal.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{deal.accountName}</span>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatCurrencyFull(deal.value)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StageBadge stage={deal.stage} />
              <ProbabilityBar probability={deal.probability} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Close date: {formatDate(deal.expectedCloseDate, timezone)}
              {deal.ownerName ? ` · ${deal.ownerName}` : ''}
            </p>
          </Link>
          {renderActions && <div className="shrink-0 p-2">{renderActions(deal)}</div>}
        </li>
      ))}
    </ul>
  );
}
