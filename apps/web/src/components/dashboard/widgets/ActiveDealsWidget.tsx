'use client';

import type { WidgetProps } from './index';

export function ActiveDealsWidget(_props: WidgetProps) {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-ds-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-ds-primary">handshake</span>
        </div>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Active Deals</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">18</p>
    </div>
  );
}
