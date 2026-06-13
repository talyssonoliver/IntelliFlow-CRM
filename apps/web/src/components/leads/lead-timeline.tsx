'use client';

import { EmptyState } from '@intelliflow/ui';
import {
  type ActivityType,
  getActivityIcon,
  getActivityIconBg,
  formatRelativeTime,
} from '@/lib/leads/lead-format';

/**
 * Lead 360 activity timeline (PG-061).
 *
 * A focused, presentational chronological list of a lead's recent activities,
 * mirroring the `contacts/ActivityTimeline.tsx` sibling convention. Rendered in
 * the Lead Detail "Recent Activity" overview. Consumes real `lead.activities`
 * data (no mocking). The rich, filterable activity tab (reactions / comments /
 * deep-links) remains in the page and is intentionally out of this component's
 * scope.
 */

// Structural subset of the page-level `Activity` model — `Activity` is
// assignable to this, so call sites need no coercion.
export interface LeadTimelineActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  user: string;
}

export interface LeadTimelineProps {
  /** Activities to display (already ordered most-recent-first by the caller). */
  activities: ReadonlyArray<LeadTimelineActivity>;
  /** Optional cap on the number of rows rendered. */
  limit?: number;
  /** IANA timezone for relative-time formatting. */
  timezone?: string;
}

export function LeadTimeline({ activities, limit, timezone }: Readonly<LeadTimelineProps>) {
  if (activities.length === 0) {
    return <EmptyState entity="activity" phase="passive" />;
  }

  const visible = typeof limit === 'number' ? activities.slice(0, limit) : activities;

  return (
    <ul aria-label="Lead activity timeline" className="space-y-4">
      {visible.map((activity) => (
        <li key={activity.id} className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityIconBg(activity.type)}`}
          >
            <span className="material-symbols-outlined !text-[16px]">
              {getActivityIcon(activity.type)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{activity.title}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {activity.description}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {activity.user} • {formatRelativeTime(activity.timestamp, timezone)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
