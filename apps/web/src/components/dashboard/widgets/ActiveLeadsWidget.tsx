'use client';

import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

export function ActiveLeadsWidget(_props: Readonly<WidgetProps>) {
  const { data: stats, isLoading: statsLoading } = trpc.lead.stats.useQuery();
  const { data: overview, isLoading: overviewLoading } = trpc.analytics.getOverview.useQuery({});

  const isLoading = statsLoading || overviewLoading;
  const total = stats?.total ?? 0;
  const delta = Number(overview?.leadDelta ?? 0);
  const previous = total - delta;

  return (
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-chart-3/10 flex items-center justify-center text-chart-3">
          <span className="material-symbols-outlined text-lg">person</span>
        </div>
        <h3 className="font-medium text-foreground">Active Leads</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground">
          {isLoading ? '...' : total.toLocaleString('en-GB')}
        </div>
        {!isLoading && previous > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            vs {previous.toLocaleString('en-GB')} last month
          </div>
        )}
      </div>
    </div>
  );
}
