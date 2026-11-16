import Link from 'next/link';
import { EmptyState } from '@intelliflow/ui';

export interface AccountsEmptyStateProps {
  readonly hasFilters: boolean;
  readonly onClearFilters: () => void;
}

/**
 * Accounts list with no rows. With filters on it offers "Clear filters". Without filters it says
 * where accounts come from: a company is added here when one of its leads is converted. It links
 * to Leads and keeps the "Create account" action for adding one by hand.
 */
export function AccountsEmptyState({ hasFilters, onClearFilters }: AccountsEmptyStateProps) {
  if (hasFilters) {
    return (
      <EmptyState
        entity="accounts"
        variant="filtered"
        showCta={false}
        action={{ label: 'Clear filters', onClick: onClearFilters }}
      />
    );
  }
  return (
    <div data-testid="accounts-empty-state" className="flex flex-col items-center gap-2">
      <EmptyState
        entity="accounts"
        variant="empty"
        showCta
        ctaHref="/accounts/new"
        description="Companies appear here when you convert one of their leads. You can also add an account by hand."
      />
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          person_search
        </span>
        <span>Go to Leads</span>
      </Link>
    </div>
  );
}
