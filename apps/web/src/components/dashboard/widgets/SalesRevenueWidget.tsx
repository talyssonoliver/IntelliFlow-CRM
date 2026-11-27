'use client';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  formatGBP,
  isTrendingUp,
} from '@/lib/dashboard/kpi-calculator';
import { KpiCard } from '../KpiCard';
import type { WidgetProps } from './index';

export function SalesRevenueWidget(_props: Readonly<WidgetProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isLoading, isError } = trpc.analytics.getOverview.useQuery(
    {},
    { enabled: isAuthenticated && !authLoading, refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );

  const revenue = Number(data?.totalRevenue ?? 0);
  const delta = Number(data?.revenueDelta ?? 0);
  const isOnTrack = isTrendingUp(delta);

  // A failed background refresh keeps the revenue already loaded; "Couldn't load" is
  // only for a request that never produced any.
  if (isError && !data) {
    return <KpiCard label="Sales Revenue" icon="payments" value={null} failed />;
  }

  // Show the skeleton while auth is resolving or the query is disabled/pending
  // (`data` undefined) rather than rendering a real-looking £0 / "On track".
  if (isLoading || authLoading || !data) {
    return <KpiCard label="Sales Revenue" icon="payments" value={null} pending />;
  }

  return (
    <KpiCard
      label="Sales Revenue"
      icon="payments"
      value={formatGBP(revenue)}
      // No revenue is neither on track nor behind: show no verdict at £0.
      badge={
        revenue === 0 ? undefined : (
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
              isOnTrack
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}
          >
            {isOnTrack ? 'On track' : 'Behind'}
          </span>
        )
      }
    />
  );
}
