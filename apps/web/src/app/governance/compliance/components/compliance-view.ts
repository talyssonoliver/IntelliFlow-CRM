/**
 * Shapes and wording shared by the compliance dashboard, its detail panel and its PDF export
 * (PG-194). Every figure on those comes from the `compliance` tRPC router; this file only turns
 * the router's states into words, colours and icons. It holds no scores.
 */
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@intelliflow/api-client';

export type ComplianceOverview = inferRouterOutputs<AppRouter>['compliance']['overview'];
export type FrameworkView = ComplianceOverview['frameworks'][number];
export type ControlView = FrameworkView['controls'][number];
export type FrameworkStatus = FrameworkView['status'];
export type ControlState = ControlView['state'];
export type TrendView = FrameworkView['trend'];

export const STATUS_LABEL: Record<FrameworkStatus, string> = {
  compliant: 'Compliant',
  attention: 'Attention',
  critical: 'Critical',
  not_measured: 'Not measured',
};

export const CONTROL_STATE: Record<ControlState, { label: string; icon: string; color: string }> = {
  pass: { label: 'Pass', icon: 'check_circle', color: 'text-emerald-500' },
  attention: { label: 'Attention', icon: 'error', color: 'text-amber-500' },
  not_measured: { label: 'Not measured', icon: 'help', color: 'text-muted-foreground' },
};

export const STATUS_STYLE: Record<
  FrameworkStatus,
  {
    badge: string;
    dot: string;
    iconBg: string;
    iconColor: string;
    progress: string;
  }
> = {
  compliant: {
    badge:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    progress: 'bg-emerald-500',
  },
  critical: {
    badge:
      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    iconBg: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    progress: 'bg-red-500',
  },
  attention: {
    badge:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    progress: 'bg-amber-500',
  },
  not_measured: {
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground/60',
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    progress: 'bg-muted-foreground/40',
  },
};

/** "Trend starts tomorrow", or the change in points since the first stored day. */
export function trendText(trend: TrendView): string {
  if (trend.state === 'pending') return trend.reason;
  if (trend.delta === 0) return 'No change';
  return `${trend.delta > 0 ? '+' : ''}${trend.delta} pts`;
}

export function trendDirection(trend: TrendView): 'up' | 'down' | 'flat' | 'pending' {
  if (trend.state === 'pending') return 'pending';
  if (trend.delta > 0) return 'up';
  if (trend.delta < 0) return 'down';
  return 'flat';
}

/**
 * The overall trend: the mean change of the frameworks that have one. Pending until at least one
 * measured framework has two stored days.
 */
export function overallTrend(frameworks: FrameworkView[]): TrendView {
  const deltas = frameworks.flatMap((f) =>
    f.score !== null && f.trend.state === 'available' ? [f.trend.delta] : []
  );
  if (deltas.length === 0) return { state: 'pending', reason: 'Trend starts tomorrow' };
  const mean = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
  return { state: 'available', delta: mean, since: '' };
}

export function scoreText(score: number | null): string {
  return score === null ? 'Not measured' : `${score}%`;
}
