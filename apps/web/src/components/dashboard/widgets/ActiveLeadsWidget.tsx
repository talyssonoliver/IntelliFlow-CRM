'use client';

import type { WidgetProps } from './index';

export function ActiveLeadsWidget(_props: WidgetProps) {
  return (
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center text-violet-600 dark:text-violet-400">
          <span className="material-symbols-outlined text-lg">person</span>
        </div>
        <h3 className="font-medium text-slate-700 dark:text-slate-300">Active Leads</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-slate-900 dark:text-white">1,240</div>
        <div className="text-xs text-slate-500 mt-1">vs 1,100 last month</div>
      </div>
    </div>
  );
}
