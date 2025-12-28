'use client';

import type { WidgetProps } from './index';

export function RevenueWidget({ config }: WidgetProps) {
  const timeRange = (config?.timeRange as string) || 'month';

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-slate-900 dark:text-white font-semibold">Total Revenue</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">$124,500</span>
            <span className="text-xs font-medium text-emerald-500 flex items-center bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
              +12.5%
            </span>
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            className={`px-2 py-1 rounded transition-colors ${
              timeRange === 'week'
                ? 'text-ds-primary font-medium bg-ds-primary/10'
                : 'text-slate-400 hover:text-ds-primary'
            }`}
          >
            This Week
          </button>
          <button
            className={`px-2 py-1 rounded transition-colors ${
              timeRange === 'month'
                ? 'text-ds-primary font-medium bg-ds-primary/10'
                : 'text-slate-400 hover:text-ds-primary'
            }`}
          >
            This Month
          </button>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="flex-1 flex items-end justify-between gap-1 w-full px-2">
        {[40, 65, 50, 75, 60, 85, 95].map((height, i) => (
          <div
            key={i}
            className={`w-full rounded-t-sm transition-all ${
              i === 6
                ? 'bg-ds-primary'
                : `bg-blue-${100 + i * 100} dark:bg-blue-${900 - i * 100}/${30 + i * 10}`
            }`}
            style={{ height: `${height}%` }}
          >
            {i === 6 && (
              <div className="relative">
                <div className="absolute top-2 right-2 size-2 bg-white rounded-full animate-pulse" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-slate-400">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>
    </div>
  );
}
