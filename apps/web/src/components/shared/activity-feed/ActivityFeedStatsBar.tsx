'use client';

/**
 * Activity Feed Stats Bar
 * IFC-202: Compact horizontal stats display for activity feed
 *
 * Shows total activity count and breakdown by type as small pill badges.
 * Designed to sit in feed headers (home page, dashboard widget, activity page).
 */

import {
  useActivityFeedStats,
  type UseActivityFeedStatsOptions,
} from '@/hooks/useActivityFeedStats';

const TIME_WINDOW_LABELS: Record<string, string> = {
  '24h': 'past 24h',
  '7d': 'past 7 days',
  '30d': 'past 30 days',
  all: 'all time',
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  STATUS_CHANGE: {
    label: 'Status',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  NOTE: {
    label: 'Notes',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  EMAIL: {
    label: 'Emails',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  CALL: {
    label: 'Calls',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  MEETING: {
    label: 'Meetings',
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  TASK: {
    label: 'Tasks',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  DEAL: {
    label: 'Deals',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  SYSTEM: {
    label: 'System',
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  CHAT: {
    label: 'Chat',
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  ASSIGNMENT: {
    label: 'Assigned',
    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  },
  CREATION: {
    label: 'Created',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  },
};

interface ActivityFeedStatsBarProps extends UseActivityFeedStatsOptions {
  /** Show type breakdown pills. Defaults to true. */
  showBreakdown?: boolean;
  /** Max number of type pills to show. Defaults to 4. */
  maxTypes?: number;
  /** Additional CSS class */
  className?: string;
}

export function ActivityFeedStatsBar({
  showBreakdown = true,
  maxTypes = 4,
  className = '',
  ...queryOptions
}: Readonly<ActivityFeedStatsBarProps>) {
  const { stats, isLoading } = useActivityFeedStats(queryOptions);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 animate-pulse ${className}`}>
        <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    );
  }

  if (!stats) return null;

  const windowLabel = TIME_WINDOW_LABELS[stats.timeWindow] ?? stats.timeWindow;
  const topTypes = [...stats.byType]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTypes)
    .filter((t) => t.count > 0);

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* Total count badge */}
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
        <span className="font-bold text-slate-900 dark:text-white">{stats.total}</span>
        <span>{stats.total === 1 ? 'activity' : 'activities'}</span>
        <span className="text-slate-400 dark:text-slate-500">{windowLabel}</span>
      </span>

      {/* Type breakdown pills */}
      {showBreakdown && topTypes.length > 0 && (
        <>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          {topTypes.map((t) => {
            const config = TYPE_CONFIG[t.type] ?? {
              label: t.type,
              color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
            };
            return (
              <span
                key={t.type}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${config.color}`}
              >
                {config.label}
                <span className="font-bold">{t.count}</span>
              </span>
            );
          })}
        </>
      )}
    </div>
  );
}
