'use client';

import { trpc } from '@/lib/trpc';
import { isEmptySeries } from '@/lib/charts/empty-series';
import { ChartEmptyState, ChartUnavailable } from '@/components/shared/ChartEmptyState';
import { useAuth } from '@/lib/auth/AuthContext';
import type { WidgetProps } from './index';

interface TrafficSourceData {
  name: string;
  percentage: number;
  color: string;
}

export function TrafficSourcesWidget(_props: Readonly<WidgetProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: sources,
    isLoading,
    isError: requestFailed,
    refetch,
  } = trpc.analytics.trafficSources.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });
  // A failed background refresh keeps the figures already loaded (React Query keeps
  // `data`); "Couldn't load" is only for a request that never produced any.
  const isError = requestFailed && !sources;

  if (isLoading || authLoading) {
    return (
      <div className="p-5 h-full flex flex-col animate-pulse">
        <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-700 mb-4" />
        <div className="flex items-center justify-center flex-1 mb-4">
          <div className="size-24 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 w-full rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !sources || isEmptySeries(sources)) {
    return (
      <div className="p-5 h-full flex flex-col">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-400" aria-hidden="true">
            pie_chart
          </span>{' '}
          Traffic Sources
        </h3>
        {isError ? (
          <ChartUnavailable
            message="Couldn't load traffic sources."
            onRetry={() => void refetch()}
          />
        ) : (
          <ChartEmptyState />
        )}
      </div>
    );
  }

  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">pie_chart</span> Traffic Sources
      </h3>

      {/* Simple donut representation */}
      <div className="flex items-center justify-center flex-1 mb-4">
        <div className="relative size-24">
          <div className="size-full rounded-full border-8 border-slate-100 dark:border-slate-700" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-slate-900 dark:text-white">100%</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {sources.map((source: TrafficSourceData) => (
          <div key={source.name} className="flex items-center gap-2">
            <div className={`size-3 rounded-full ${source.color}`} />
            <span className="text-sm text-slate-600 dark:text-slate-400 flex-1">{source.name}</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {source.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
