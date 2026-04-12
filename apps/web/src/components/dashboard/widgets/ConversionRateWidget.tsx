'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
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
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-warning-muted flex items-center justify-center text-warning">
          <span className="material-symbols-outlined text-lg">bolt</span>
        </div>
        <h3 className="font-medium text-foreground">Conversion Rate</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground">
          {isLoading ? '...' : `${conversionRate.toFixed(1)}%`}
        </div>
        <div className="w-full bg-muted h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-warning h-full rounded-full transition-all"
            style={{ width: `${isLoading ? 0 : progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
