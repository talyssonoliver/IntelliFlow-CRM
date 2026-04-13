'use client';

import { EmptyState } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

export function TopPerformersWidget(_props: Readonly<WidgetProps>) {
  const { data: performers, isLoading } = trpc.analytics.topPerformers.useQuery();

  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">leaderboard</span> Top Performers
      </h3>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {(() => {
          if (isLoading) {
            return Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                <div className="w-4 h-4 bg-muted rounded" />
                <div className="size-8 rounded-full bg-muted" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded mt-1" />
                </div>
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            ));
          }
          if (performers?.length) {
            return performers.map((performer, index) => {
              const initials = performer.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const revenue = Number(performer.totalRevenue);
              return (
                <div
                  key={performer.userId}
                  className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                >
                  <span className="text-sm font-bold text-slate-400 w-4">{index + 1}</span>
                  <div className="size-8 rounded-full bg-ds-primary/10 flex items-center justify-center text-ds-primary text-xs font-bold">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {performer.name}
                    </p>
                    <p className="text-xs text-slate-500">{performer.dealCount} deals</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {revenue.toLocaleString('en-GB', {
                      style: 'currency',
                      currency: 'GBP',
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              );
            });
          }
          return <EmptyState entity="deals" phase="passive" className="py-2" />;
        })()}
      </div>
    </div>
  );
}
