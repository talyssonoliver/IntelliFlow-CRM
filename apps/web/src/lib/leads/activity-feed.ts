/**
 * Lead activity feed (MVP-005). The owner's own emails, calls, notes and meetings come first,
 * newest first; entries written by the system (the COA pipeline sync, the portal, AI score and
 * status changes) are folded into one expandable "System updates (n)" line instead of
 * crowding them out.
 */

export type FeedFilter = 'all' | 'email' | 'call' | 'note' | 'meeting';

/** The activity type filters the lead page offers. */
export const ACTIVITY_TYPE_FILTERS: ReadonlyArray<{
  value: FeedFilter;
  label: string;
  icon: string;
}> = [
  { value: 'all', label: 'All', icon: '📋' },
  { value: 'email', label: 'Emails', icon: '📧' },
  { value: 'call', label: 'Calls', icon: '📞' },
  { value: 'note', label: 'Notes', icon: '📝' },
  { value: 'meeting', label: 'Meetings', icon: '📅' },
];

/** Activity types that only the system writes. */
const SYSTEM_TYPES = new Set(['score_update', 'status_change']);

/**
 * The author names the API writes for itself, matched exactly: "System" or "System (<source>)".
 * A person's email such as system@example.com is not a system author.
 */
const SYSTEM_AUTHOR = /^System(?: \([^)]+\))?$/;

export interface FeedActivity {
  type: string;
  user: string;
  timestamp: string;
}

/**
 * True for entries the system wrote rather than a person: score and status changes, and anything
 * whose author is "System (...)" (the API writes "System (COA sync)" and "System (portal)").
 */
export function isSystemActivity(activity: Pick<FeedActivity, 'type' | 'user'>): boolean {
  return SYSTEM_TYPES.has(activity.type) || SYSTEM_AUTHOR.test(activity.user.trim());
}

function newestFirst<T extends FeedActivity>(a: T, b: T): number {
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
}

/**
 * Split the activities that pass `matches` (the person and search filters) into the person-written
 * feed and the folded system updates, both newest first. A type filter other than "all" shows
 * only that type of person-written activity, so the system group is empty then.
 */
export function splitActivityFeed<T extends FeedActivity>(
  activities: readonly T[],
  typeFilter: FeedFilter,
  matches: (activity: T) => boolean
): { personal: T[]; system: T[] } {
  const personal: T[] = [];
  const system: T[] = [];
  for (const activity of activities) {
    if (!matches(activity)) continue;
    if (isSystemActivity(activity)) {
      if (typeFilter === 'all') system.push(activity);
    } else if (typeFilter === 'all' || activity.type === typeFilter) {
      personal.push(activity);
    }
  }
  return { personal: personal.sort(newestFirst), system: system.sort(newestFirst) };
}

/** The "Filter by people" box is only useful when the workspace has more than one person. */
export function showPeopleFilter(workspaceMemberCount: number): boolean {
  return workspaceMemberCount > 1;
}
