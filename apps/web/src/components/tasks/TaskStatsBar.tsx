'use client';

import { Card, Skeleton } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';

interface StatPill {
  readonly label: string;
  readonly value: number;
  readonly icon: string;
  readonly color: string;
}

export function TaskStatsBar() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const { data: stats, isLoading } = api.task.stats.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  if (isLoading || authLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-6 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <div>
                <Skeleton className="h-3 w-12 mb-1" />
                <Skeleton className="h-6 w-8" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!stats) return null;

  const pills: StatPill[] = [
    {
      label: 'Total',
      value: stats.total,
      icon: 'assignment',
      color: 'text-slate-600 dark:text-slate-400',
    },
    {
      label: 'In Progress',
      value: stats.byStatus?.IN_PROGRESS ?? 0,
      icon: 'pending_actions',
      color: 'text-primary',
    },
    {
      label: 'Overdue',
      value: stats.overdue,
      icon: 'timer_off',
      color: 'text-destructive',
    },
    {
      label: 'Due Today',
      value: stats.dueToday,
      icon: 'today',
      color: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-6 flex-wrap">
        {pills.map((pill) => (
          <div key={pill.label} className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-xl ${pill.color}`}
              aria-hidden="true"
            >
              {pill.icon}
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{pill.label}</p>
              <p className={`text-lg font-bold ${pill.color}`}>{pill.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
