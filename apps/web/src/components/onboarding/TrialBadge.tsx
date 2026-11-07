'use client';

/**
 * TrialBadge
 *
 * Lightweight "Trial: N days left" link to the plan choice, or "Trial ended: choose a plan"`n * once the trial has passed (#1220),
 * displayed in the navigation when the user is on a trial plan.
 *
 * Driven by `trpc.billing.getPlanState`.  Only renders when:
 *  - The user is authenticated.
 *  - The current route is not a sign-in, sign-up or similar auth page. The badge is
 *    fetched on every other page so it does not depend on which page loaded first.
 *  - The plan state source === 'trial' and daysLeft is a number.
 *    A partner-granted PARTNER_FREE plan reports source 'partner' and never shows a badge.
 *
 * Accessibility:
 *  - Rendered as a link with aria-label for screen readers.
 *  - No role="status" — plain descriptive content (not a live region).
 *  - Material Symbols Outlined icons (ADR-046 / PG-195).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { isPublicAuthRoute } from '@/lib/auth/route-protection';
import { cn } from '@intelliflow/ui';

export function TrialBadge({ className }: Readonly<{ className?: string }>) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname() ?? '/';

  const { data: planState } = trpc.billing.getPlanState.useQuery(undefined, {
    enabled: isAuthenticated && !isPublicAuthRoute(pathname),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (!planState || planState.source !== 'trial' || typeof planState.daysLeft !== 'number') {
    return null;
  }

  const ended = planState.status === 'TRIAL_ENDED';
  const days = planState.daysLeft;
  const isUrgent = ended || days <= 3;
  const dayWord = `day${days === 1 ? '' : 's'}`;
  // An ended trial says so and leads to the plan choice, never "0 days left" (#1220).
  const label = ended ? 'Trial ended: choose a plan' : `Trial: ${days}d left`;
  // Phones have no room for the full label next to the bell, the account menu and the menu button:
  // 390-639px get the short label, narrower phones the icon alone (the link keeps its aria-label).
  const shortLabel = ended ? 'Trial ended' : `Trial: ${days}d`;
  const ariaLabel = ended
    ? 'Your trial has ended. Choose a plan'
    : `Trial: ${days} ${dayWord} remaining. Choose a plan`;

  return (
    <Link
      href="/billing/plans"
      aria-label={ariaLabel}
      title={ended ? 'Your trial has ended. Choose a plan to keep going' : 'Choose a plan'}
      data-testid="trial-badge"
      data-trial-status={ended ? 'ended' : 'active'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isUrgent
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        className
      )}
    >
      <span
        className="material-symbols-outlined text-[14px] min-[390px]:max-sm:!hidden lg:max-[1439px]:!hidden"
        aria-hidden="true"
      >
        hourglass_empty
      </span>
      <span className="hidden sm:inline">{label}</span>
      <span className="max-[389px]:hidden sm:hidden">{shortLabel}</span>
    </Link>
  );
}
