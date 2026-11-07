'use client';

import { trpc } from '@/lib/trpc';
import { KpiCard } from '../KpiCard';
import type { WidgetProps } from './index';

export function ActiveLeadsWidget(_props: Readonly<WidgetProps>) {
  const { data: stats, isLoading: statsLoading } = trpc.lead.stats.useQuery();
  const { data: overview, isLoading: overviewLoading } = trpc.analytics.getOverview.useQuery({});

  const isLoading = statsLoading || overviewLoading;
  const total = stats?.total ?? 0;
  const delta = Number(overview?.leadDelta ?? 0);
  const previous = total - delta;

  return (
    <KpiCard
      variant="compact"
      label="Active Leads"
      icon="person"
      iconClassName="bg-chart-3/10 text-chart-3"
      pending={isLoading}
      value={total.toLocaleString('en-GB')}
      footer={
        !isLoading && previous > 0 ? (
          <div className="text-xs text-muted-foreground mt-1">
            vs {previous.toLocaleString('en-GB')} last month
          </div>
        ) : undefined
      }
    />
  );
}
