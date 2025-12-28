'use client';

import type { WidgetProps } from './index';

const chartData = [
  { month: 'Jul', value: 45 },
  { month: 'Aug', value: 65 },
  { month: 'Sep', value: 55 },
  { month: 'Oct', value: 70 },
  { month: 'Nov', value: 80 },
  { month: 'Dec', value: 95 },
];

export function DealsWonWidget(_props: WidgetProps) {
  const maxValue = 100;

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
        {chartData.map((item, index) => {
          const height = (item.value / maxValue) * 100;
          const isLast = index === chartData.length - 1;

          return (
            <div key={item.month} className="flex flex-col items-center gap-2 flex-1">
              <div className="w-full h-40 flex items-end">
                <div
                  className={`w-full rounded-t transition-all ${
                    isLast ? 'bg-ds-primary' : 'bg-ds-primary/60'
                  }`}
                  style={{ height: `${height}%` }}
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
