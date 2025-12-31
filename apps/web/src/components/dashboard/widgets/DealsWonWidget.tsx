'use client';

import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

interface DealsWonData {
  month: string;
  value: number;
  revenue?: number;
}

export function DealsWonWidget(_props: WidgetProps) {
  const { data: chartData, isLoading } = trpc.analytics.dealsWonTrend.useQuery({ months: 6 });

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-48 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-8 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="flex items-end justify-between h-48 gap-4 px-4 flex-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-1">
              <div className="w-full h-40 rounded-t bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return null;
  }

  const maxValue = Math.max(...chartData.map((d: DealsWonData) => d.value), 1);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Deals Won (Last 6 Months)
        </h3>
        <select className="px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          <option>Last 6 Months</option>
          <option>Last 12 Months</option>
        </select>
      </div>

      {/* Bar Chart */}
      <div className="flex items-end justify-between h-48 gap-4 px-4 flex-1">
        {chartData.map((item: DealsWonData, index: number) => {
          const height = (item.value / maxValue) * 100;
          const isLast = index === chartData.length - 1;

          return (
            <div key={`${item.month}-${index}`} className="flex flex-col items-center gap-2 flex-1">
              <div className="w-full h-40 flex items-end">
                <div
                  className={`w-full rounded-t transition-all ${
                    isLast ? 'bg-ds-primary' : 'bg-ds-primary/60'
                  }`}
                  style={{ height: `${height}%` }}
                  title={`${item.value} deals won`}
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{item.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
