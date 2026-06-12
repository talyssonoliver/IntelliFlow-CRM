/**
 * Shared lead activity + date formatting helpers.
 *
 * Extracted verbatim from `app/leads/[id]/page.tsx` (PG-061) so that both the
 * Lead 360 page and the extracted `LeadTimeline` component consume one source of
 * truth — avoiding duplicated icon maps / relative-time logic. Follows the
 * PG-059 `lib/leads/*` extraction convention.
 */

// Activity types matching the database enum (UI-facing variant).
export type ActivityType =
  | 'web_form'
  | 'score_update'
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'status_change'
  | 'qualification';

/** Material-symbol icon name for an activity type. */
export function getActivityIcon(type: Readonly<ActivityType>): string {
  const icons: Record<ActivityType, string> = {
    web_form: 'web',
    score_update: 'psychology',
    email: 'mail',
    call: 'call',
    note: 'edit_note',
    meeting: 'event',
    status_change: 'person_add',
    qualification: 'verified',
  };
  return icons[type];
}

/** Tailwind badge background/text classes for an activity type. */
export function getActivityIconBg(type: Readonly<ActivityType>): string {
  const colors: Record<ActivityType, string> = {
    web_form: 'bg-blue-100 dark:bg-slate-800 text-blue-600',
    score_update: 'bg-purple-100 dark:bg-slate-800 text-purple-600',
    email: 'bg-orange-100 dark:bg-slate-800 text-orange-600',
    call: 'bg-green-100 dark:bg-slate-800 text-green-600',
    note: 'bg-amber-100 dark:bg-slate-800 text-amber-600',
    meeting: 'bg-indigo-100 dark:bg-slate-800 text-indigo-600',
    status_change: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
    qualification: 'bg-teal-100 dark:bg-slate-800 text-teal-600',
  };
  return colors[type];
}

/**
 * Human-friendly relative time: `Nm ago`, `Nh ago`, `Yesterday`, `N days ago`,
 * or a localised date for anything a week or older.
 */
export function formatRelativeTime(dateString: string, timezone: string = 'Europe/London'): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
}
