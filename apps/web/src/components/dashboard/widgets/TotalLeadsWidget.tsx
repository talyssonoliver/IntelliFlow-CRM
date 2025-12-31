'use client';

import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

export function TotalLeadsWidget(_props: WidgetProps) {
  const { data: stats, isLoading, error } = trpc.lead.stats.useQuery();

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col animate-pulse">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="w-16 h-5 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 mt-4" />
        <div className="h-9 w-32 rounded bg-slate-200 dark:bg-slate-700 mt-1" />
      </div>
    );
  }

  if (error || !stats) {
    return null;
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-ds-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-ds-primary">group</span>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
          <span className="material-symbols-outlined text-lg">trending_up</span>
          +12%
        </span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Total Leads</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {stats.total.toLocaleString()}
      </p>
    </div>
  );
}
