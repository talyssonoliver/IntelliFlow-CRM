'use client';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { DASHBOARD_REFETCH_INTERVAL_MS, computeDeltaPercent } from '@/lib/dashboard/kpi-calculator';
import { KpiCard, KpiTrendBadge } from '../KpiCard';
import type { WidgetProps } from './index';

export function TotalLeadsWidget({ initialData }: Readonly<WidgetProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: stats,
    isLoading,
    error,
  } = trpc.lead.stats.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    ...(initialData == null
      ? {}
      : {
          initialData: initialData as NonNullable<
            Parameters<typeof trpc.lead.stats.useQuery>[1]
          >['initialData'],
        }),
  });
  const { data: overview } = trpc.analytics.getOverview.useQuery(
    {},
    { enabled: isAuthenticated && !authLoading, refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );

  // Loading draws the shared card in its pending state, so on a phone it already has the row
  // layout and nothing jumps when the count arrives.
  if (isLoading || authLoading) {
    return <KpiCard label="Total Leads" icon="group" value={null} pending />;
  }

  // A failed background refresh keeps the count already loaded; "Couldn't load" is only
  // for a request that never produced one.
  if (error && !stats) {
    return <KpiCard label="Total Leads" icon="group" value={null} failed />;
  }

  if (!stats) {
    return null;
  }

  const total = stats.total;
  const delta = Number(overview?.leadDelta ?? 0);
  const previous = total - delta;

  return (
    <KpiCard
      label="Total Leads"
      icon="group"
      value={total.toLocaleString('en-GB')}
      badge={
        overview ? (
          <KpiTrendBadge deltaPercent={computeDeltaPercent(delta, previous)} previous={previous} />
        ) : undefined
      }
    />
  );
}
