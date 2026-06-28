'use client';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';
import type { WidgetProps } from './index';

export function ActiveDealsWidget(_props: Readonly<WidgetProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isLoading } = trpc.analytics.getOverview.useQuery(
    {},
    { enabled: isAuthenticated && !authLoading, refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );

  // While auth is resolving or the query is disabled/pending, `data` is
  // undefined — show a pending indicator rather than a real-looking 0.
  const pending = authLoading || isLoading || !data;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-primary" aria-hidden="true">
            handshake
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-4">Active Deals</p>
      <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
        {pending ? '...' : (data?.openOpportunities ?? 0)}
      </p>
    </div>
  );
}
