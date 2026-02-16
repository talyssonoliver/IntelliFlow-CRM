/**
 * Lead Scoring Dashboard Utilities (PG-148)
 */

import type { ScoreTier } from '@intelliflow/ui';

export function getScoreTierBadgeClass(tier: ScoreTier): string {
  switch (tier) {
    case 'hot':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'warm':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 'cold':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400';
  }
}

export function getScoreTierIcon(tier: ScoreTier): string {
  switch (tier) {
    case 'hot':
      return 'local_fire_department';
    case 'warm':
      return 'wb_sunny';
    case 'cold':
      return 'ac_unit';
  }
}

export function getScoreTierLabel(tier: ScoreTier): string {
  switch (tier) {
    case 'hot':
      return 'Hot';
    case 'warm':
      return 'Warm';
    case 'cold':
      return 'Cold';
  }
}

export function formatModelVersion(version: string): string {
  const parts = version.split(':');
  if (parts.length >= 3) {
    return `${parts[2]}`;
  }
  return version.length > 20 ? version.slice(0, 20) + '...' : version;
}

export function formatScoredAt(isoDate: string): string {
  const now = Date.now();
  const scored = new Date(isoDate).getTime();
  const diffMs = now - scored;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
