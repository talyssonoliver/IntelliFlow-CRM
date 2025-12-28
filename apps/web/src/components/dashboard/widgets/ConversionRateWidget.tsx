'use client';

import type { WidgetProps } from './index';

export function ConversionRateWidget(_props: WidgetProps) {
  const conversionRate = 3.2;
  const progress = 65;

  return (
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <span className="material-symbols-outlined text-lg">bolt</span>
        </div>
        <h3 className="font-medium text-slate-700 dark:text-slate-300">Conversion Rate</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-slate-900 dark:text-white">{conversionRate}%</div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-amber-500 h-full rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
