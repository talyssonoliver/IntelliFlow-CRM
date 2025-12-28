'use client';

import type { WidgetProps } from './index';

interface Performer {
  id: string;
  name: string;
  avatar: string;
  deals: number;
  revenue: string;
}

const performers: Performer[] = [
  { id: '1', name: 'Sarah Johnson', avatar: 'SJ', deals: 12, revenue: '$45,200' },
  { id: '2', name: 'Mike Chen', avatar: 'MC', deals: 10, revenue: '$38,500' },
  { id: '3', name: 'Emily Davis', avatar: 'ED', deals: 8, revenue: '$32,100' },
  { id: '4', name: 'James Wilson', avatar: 'JW', deals: 7, revenue: '$28,900' },
];

export function TopPerformersWidget(_props: WidgetProps) {
  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">leaderboard</span>
        Top Performers
      </h3>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {performers.map((performer, index) => (
          <div
            key={performer.id}
            className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
          >
            <span className="text-sm font-bold text-slate-400 w-4">{index + 1}</span>
            <div className="size-8 rounded-full bg-ds-primary/10 flex items-center justify-center text-ds-primary text-xs font-bold">
              {performer.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {performer.name}
              </p>
              <p className="text-xs text-slate-500">{performer.deals} deals</p>
            </div>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {performer.revenue}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
