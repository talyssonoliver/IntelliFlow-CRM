/**
 * StatusHistory's calculations, kept out of the component so they can be tested (#1216: its
 * tests used to copy them, and tested a getDeltaColorClass signature the component did not have).
 */

export interface HistoryDelta {
  completed: number;
  in_progress: number;
  blocked: number;
  backlog: number;
}

export type TrendDirection = 'up' | 'down' | 'stable';

export interface TrendData {
  direction: TrendDirection;
  value: number;
}

/** How many of the newest entries the trend sums. */
export const TREND_WINDOW = 5;

/**
 * The completion trend over the newest entries (entries are newest first): the sum of their
 * completed deltas. Null with fewer than two entries.
 */
export function calculateTrend(
  entries: ReadonlyArray<{ delta?: Partial<HistoryDelta> }>
): TrendData | null {
  if (entries.length < 2) return null;

  const totalCompleted = entries
    .slice(0, Math.min(TREND_WINDOW, entries.length))
    .reduce((sum, e) => sum + (e.delta?.completed || 0), 0);

  if (totalCompleted > 0) return { direction: 'up', value: totalCompleted };
  if (totalCompleted < 0) return { direction: 'down', value: Math.abs(totalCompleted) };
  return { direction: 'stable', value: 0 };
}

/** A time for an entry from today, a date and time for an older one (en-GB). */
export function formatTimestamp(timestamp: string, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return date.toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** More completed is good and more blocked is bad; other counts are neutral. */
export function getDeltaColorClass(label: string, isPositive: boolean): string {
  if (label === 'completed') return isPositive ? 'text-green-600' : 'text-red-600';
  if (label === 'blocked') return isPositive ? 'text-red-600' : 'text-green-600';
  return 'text-gray-500';
}

export function getTrendIcon(direction: Readonly<TrendDirection>): {
  name: string;
  className: string;
} {
  if (direction === 'up') return { name: 'trending_up', className: 'text-green-600' };
  if (direction === 'down') return { name: 'trending_down', className: 'text-red-600' };
  return { name: 'remove', className: 'text-gray-500' };
}

export function getTrendText(trend: Readonly<TrendData>): { content: string; className: string } {
  if (trend.direction === 'stable') return { content: 'No change', className: 'text-gray-700' };
  const label = trend.direction === 'up' ? 'completed' : 'regressed';
  const content = `${trend.value} task${trend.value === 1 ? '' : 's'} ${label}`;
  const className = trend.direction === 'up' ? 'text-green-600' : 'text-red-600';
  return { content, className };
}
