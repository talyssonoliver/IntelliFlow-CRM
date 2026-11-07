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

  if (isLoading || authLoading) {
    return (
      <div className="p-4 sm:p-6 h-full flex flex-col animate-pulse">
        <div className="flex items-start justify-between">
          <div className="size-9 sm:size-12 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="w-16 h-5 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 mt-4" />
        <div className="h-9 w-32 rounded bg-slate-200 dark:bg-slate-700 mt-1" />
      </div>
    );
  }

  if (error) {
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
