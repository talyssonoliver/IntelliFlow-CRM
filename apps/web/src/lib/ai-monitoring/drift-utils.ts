/**
 * Drift Detection Dashboard Utilities (PG-146)
 *
 * Badge classes, colors, icons, and formatting for drift severity.
 * Pattern: apps/web/src/lib/churn-risk/churn-utils.ts
 */

import type { DriftSeverity } from './types';

const SEVERITY_ORDER: Record<DriftSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-destructive/10 text-destructive';
    case 'high':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'medium':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'low':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'none':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-destructive';
    case 'high':
      return 'text-orange-600 dark:text-orange-400';
    case 'medium':
      return 'text-amber-600 dark:text-amber-400';
    case 'low':
      return 'text-blue-600 dark:text-blue-400';
    case 'none':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

export function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'check_circle';
    case 'none':
      return 'verified';
    default:
      return 'help';
  }
}

export function formatDriftScore(score: number): string {
  return score.toFixed(4);
}

export function formatPValue(pValue: number): string {
  return pValue.toFixed(4);
}

export function getRecommendationPriority(severity: string): number {
  return SEVERITY_ORDER[severity as DriftSeverity] ?? 0;
}

export function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function isStaleData(lastCheck: string | null): boolean {
  if (!lastCheck) return false;
  const diff = Date.now() - new Date(lastCheck).getTime();
  return diff > 3600000; // 1 hour
}
