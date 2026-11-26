'use client';

/**
 * Banner shown to a workspace admin whose workspace has no business type yet.
 * Until they choose, the workspace is gated like "Something else" (core CRM, AI and reports);
 * nothing they already have is hidden because of it (the backfill keeps modules that hold data).
 */

import Link from 'next/link';
import { useEnabledModules } from '@/hooks/useEnabledModules';

export function BusinessTypeBanner({ className = '' }: Readonly<{ className?: string }>) {
  const { needsBusinessType } = useEnabledModules();
  if (!needsBusinessType) return null;

  return (
    <output
      data-testid="business-type-banner"
      className={`flex flex-col gap-3 sm:flex-row sm:items-center rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          storefront
        </span>
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Tell us what kind of business this is.</strong> It
          decides which tools your workspace gets (for example Cases for law firms, Tickets for
          agencies).
        </p>
      </div>
      <Link
        href="/settings/workspace"
        className="whitespace-nowrap rounded-md bg-amber-900 px-3 text-center py-1.5 font-medium text-amber-50 hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-amber-200 dark:text-amber-950"
      >
        Choose business type
      </Link>
    </output>
  );
}
