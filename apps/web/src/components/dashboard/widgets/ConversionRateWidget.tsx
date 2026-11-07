'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { KpiCard } from '../KpiCard';
import type { WidgetProps } from './index';

export function ConversionRateWidget(_props: Readonly<WidgetProps>) {
  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 30);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, []);

  const { data, isLoading } = trpc.analytics.getLeadMetrics.useQuery(dateRange);

  const conversionRate = Number(data?.conversionRate ?? 0);
  const progress = Math.min(conversionRate * 10, 100);

  return (
    <KpiCard
      variant="compact"
      label="Conversion Rate"
      icon="bolt"
      iconClassName="bg-warning-muted text-warning"
      pending={isLoading}
      value={`${conversionRate.toFixed(1)}%`}
      footer={
        <div className="w-full bg-muted h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-warning h-full rounded-full transition-all"
            style={{ width: `${isLoading ? 0 : progress}%` }}
          />
        </div>
      }
    />
  );
}
