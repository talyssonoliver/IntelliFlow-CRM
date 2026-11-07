'use client';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';
import { KpiCard } from '../KpiCard';
import type { WidgetProps } from './index';

export function ActiveDealsWidget(_props: Readonly<WidgetProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isLoading, isError } = trpc.analytics.getOverview.useQuery(
    {},
    { enabled: isAuthenticated && !authLoading, refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );

  // While auth is resolving or the query is disabled/pending, `data` is
  // undefined — show a pending indicator rather than a real-looking 0.
  const pending = !isError && (authLoading || isLoading || !data);

  return (
    <KpiCard
      label="Active Deals"
      icon="handshake"
      iconClassName="bg-primary/10 text-primary"
      pending={pending}
      failed={isError}
      value={data?.openOpportunities ?? 0}
    />
  );
}
