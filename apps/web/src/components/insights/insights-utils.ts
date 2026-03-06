/**
 * AI Insights Utilities
 *
 * Shared helpers for rendering AI insight cards.
 * Extracted from AuthenticatedHomePage.tsx for reuse in /insights page.
 *
 * Task: PG-160 — View All AI Insights page
 */

export interface InsightIconStyle {
  icon: string;
  iconBg: string;
  iconColor: string;
}

export function getInsightIcon(type: string): InsightIconStyle {
  const iconMap: Record<string, InsightIconStyle> = {
    warning: {
      icon: 'warning',
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    opportunity: {
      icon: 'trending_up',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    reminder: {
      icon: 'schedule',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    achievement: {
      icon: 'emoji_events',
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
  };
  return (
    iconMap[type] || {
      icon: 'info',
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-400',
    }
  );
}
