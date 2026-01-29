'use client';

import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

interface TrafficSourceData {
  name: string;
  percentage: number;
  color: string;
}

export function TrafficSourcesWidget(_props: WidgetProps) {
  const { data: sources, isLoading } = trpc.analytics.trafficSources.useQuery();

  if (isLoading) {
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

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">pie_chart</span>
        Traffic Sources
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
            <span className="text-sm text-slate-600 dark:text-slate-400 flex-1">
              {source.name}
            </span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {source.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
