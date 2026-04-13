/**
 * Shared utilities for press/media pages.
 * Used by /press listing and /press/[id] detail pages.
 */

/** Format an ISO date string as "Month Day, Year" in UTC. */
export function formatPressDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Tailwind class map for press release category badges (replaces inline styles). */
const PRESS_CATEGORY_STYLES: Record<string, string> = {
  Product: 'bg-primary/10 text-primary',
  Security: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Partnership: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  Company: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const DEFAULT_CATEGORY_STYLE = 'bg-slate-500/10 text-slate-500 dark:text-slate-400';

/** Get Tailwind classes for a press release category badge. */
export function getCategoryStyle(category: string): string {
  return PRESS_CATEGORY_STYLES[category] ?? DEFAULT_CATEGORY_STYLE;
}
