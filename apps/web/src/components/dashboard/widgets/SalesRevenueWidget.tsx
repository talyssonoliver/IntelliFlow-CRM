'use client';

import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

export function SalesRevenueWidget(_props: Readonly<WidgetProps>) {
  const { data, isLoading } = trpc.analytics.getOverview.useQuery({});

  const revenue = Number(data?.totalRevenue ?? 0);
  const delta = Number(data?.revenueDelta ?? 0);
  const isOnTrack = delta >= 0;

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col animate-pulse">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-lg bg-muted" />
          <div className="w-16 h-5 rounded bg-muted" />
        </div>
        <div className="h-4 w-24 bg-muted rounded mt-4" />
        <div className="h-9 w-32 bg-muted rounded mt-1" />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-ds-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-ds-primary">payments</span>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
            isOnTrack
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {isOnTrack ? 'On track' : 'Behind'}
        </span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Sales Revenue</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {revenue.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })}
      </p>
    </div>
  );
}
