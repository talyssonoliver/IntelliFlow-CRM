'use client';

import type { WidgetProps } from './index';

interface TrafficSource {
  name: string;
  percentage: number;
  color: string;
}

const sources: TrafficSource[] = [
  { name: 'Direct', percentage: 35, color: 'bg-ds-primary' },
  { name: 'Organic', percentage: 28, color: 'bg-emerald-500' },
  { name: 'Referral', percentage: 22, color: 'bg-amber-500' },
  { name: 'Social', percentage: 15, color: 'bg-violet-500' },
];

export function TrafficSourcesWidget(_props: WidgetProps) {
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
        {sources.map((source) => (
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
