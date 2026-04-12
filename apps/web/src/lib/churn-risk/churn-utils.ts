/**
 * Churn Risk Dashboard Utilities (PG-143)
 *
 * Badge classes, icons, colors, engagement helpers, and SLA formatting.
 * Located in lib/churn-risk/ alongside hooks and types per project conventions.
 */

import type { ChurnRiskLevel } from '@intelliflow/domain';

export function getRiskBadgeClass(level: ChurnRiskLevel): string {
  switch (level) {
    case 'CRITICAL':
      return 'bg-destructive/10 text-destructive';
    case 'HIGH':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'LOW':
      return 'bg-primary/10 text-primary';
    case 'MINIMAL':
      return 'bg-success/10 text-success';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function getEngagementColor(score: number): string {
  if (score < 30) return 'bg-destructive';
  if (score < 60) return 'bg-amber-500';
  return 'bg-success';
}

export function getEngagementBgClass(score: number): string {
  if (score < 30) return 'bg-destructive/10 text-destructive';
  if (score < 60) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-success/10 text-success';
}

export function formatSlaCountdown(deadline: string): { text: string; isOverdue: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) {
    const overHours = Math.abs(Math.floor(diff / 3600000));
    return {
      text: overHours < 24 ? `${overHours}h overdue` : `${Math.floor(overHours / 24)}d overdue`,
      isOverdue: true,
    };
  }
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return { text: `${hours}h left`, isOverdue: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d left`, isOverdue: false };
}
