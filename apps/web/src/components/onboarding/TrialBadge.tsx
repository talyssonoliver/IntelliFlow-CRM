'use client';

/**
 * TrialBadge
 *
 * Lightweight, unobtrusive "Trial: N days left" element displayed in the
 * navigation when the user is on a trial plan.
 *
 * Driven by `trpc.billing.getPlanState`.  Only renders when:
 *  - The user is authenticated.
 *  - The current route is a protected app route.
 *  - The plan state source === 'trial' and daysLeft is a number.
 *
 * Accessibility:
 *  - Rendered as a simple <span> with aria-label for screen readers.
 *  - No role="status" — plain descriptive content (not a live region).
 *  - Material Symbols Outlined icons (ADR-046 / PG-195).
 */

import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { isProtectedAppRoute } from '@/lib/auth/route-protection';
import { cn } from '@intelliflow/ui';

export function TrialBadge({ className }: Readonly<{ className?: string }>) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname() ?? '/';

  const { data: planState } = trpc.billing.getPlanState.useQuery(undefined, {
    enabled: isAuthenticated && isProtectedAppRoute(pathname),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (!planState || planState.source !== 'trial' || typeof planState.daysLeft !== 'number') {
    return null;
  }

  const days = planState.daysLeft;
  const isUrgent = days <= 3;

  return (
    <span
      aria-label={`Trial: ${days} day${days === 1 ? '' : 's'} remaining`}
      data-testid="trial-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        isUrgent
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        className
      )}
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
        hourglass_empty
      </span>
      Trial: {days}d left
    </span>
  );
}
