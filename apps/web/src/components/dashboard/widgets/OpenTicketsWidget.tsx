'use client';

import type { WidgetProps } from './index';

export function OpenTicketsWidget(_props: WidgetProps) {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-ds-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-ds-primary">confirmation_number</span>
        </div>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          3 Urgent
        </span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Open Tickets</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">42</p>
    </div>
  );
}
