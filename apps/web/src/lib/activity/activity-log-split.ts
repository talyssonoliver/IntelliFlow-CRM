/**
 * The global Activity Log (MVP-005): what people did (emails, calls, notes, meetings, deals,
 * tasks) comes first; what the system wrote (the COA pipeline sync, score and status changes,
 * the portal) is folded into one "System updates" group, the same way the lead page does it.
 */
import type { ActivityFeedType } from '@intelliflow/domain';

/** Feed types only the system writes. */
export const SYSTEM_FEED_TYPES: ActivityFeedType[] = ['SYSTEM', 'SCORE_UPDATE', 'STATUS_CHANGE'];

/** Every other feed type: the person-written feed asks the server for exactly these. */
export const PERSONAL_FEED_TYPES: ActivityFeedType[] = [
  'EMAIL',
  'CALL',
  'MEETING',
  'NOTE',
  'TASK',
  'CHAT',
  'DOCUMENT',
  'DEAL',
  'TICKET',
  'STAGE_CHANGE',
  'QUALIFICATION',
  'AGENT_ACTION',
  'SLA_ALERT',
  'ASSIGNMENT',
];

/**
 * The author names the API writes for itself, matched exactly: "System" or "System (<source>)".
 * A person called "System Admin" or an email such as system@example.com is not a system author.
 */
const SYSTEM_AUTHOR = /^System(?: \([^)]+\))?$/;

export interface FeedEntryLike {
  id: string;
  type: string;
  actor: { id: string | null; name: string } | null;
}

/** True for an entry the system wrote: a system type, or a "System (...)" author. */
export function isSystemFeedEntry(entry: Pick<FeedEntryLike, 'type' | 'actor'>): boolean {
  if ((SYSTEM_FEED_TYPES as string[]).includes(entry.type)) return true;
  return entry.actor !== null && SYSTEM_AUTHOR.test(entry.actor.name.trim());
}

/**
 * Split loaded entries into the person-written feed and the system updates, keeping their order.
 * With `mineUserId` set, only that person's own entries stay in the feed and the system group is
 * empty ("My activity").
 */
export function splitActivityLog<T extends FeedEntryLike>(
  entries: readonly T[],
  mineUserId: string | null
): { personal: T[]; system: T[] } {
  const personal: T[] = [];
  const system: T[] = [];
  for (const entry of entries) {
    if (isSystemFeedEntry(entry)) system.push(entry);
    else if (mineUserId === null || entry.actor?.id === mineUserId) personal.push(entry);
  }
  return { personal, system: mineUserId === null ? system : [] };
}

/** Both lists joined without repeating an entry, in the order given (newest first from the API). */
export function mergeById<T extends { id: string; timestamp: Date | string }>(
  first: readonly T[],
  second: readonly T[]
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const entry of [...first, ...second]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** The line above the feed when the person-written feed is empty but the system wrote entries. */
export function emptyFeedMessage(opts: {
  mine: boolean;
  filtered: boolean;
  searching: boolean;
  systemCount: number;
}): string {
  if (opts.searching) return 'No activity matches your search';
  if (opts.mine) return 'You have no activity yet';
  if (opts.filtered) return 'No activity matches the selected filter';
  if (opts.systemCount > 0)
    return 'No emails, calls, notes or meetings yet. Only system updates so far.';
  return 'No activity recorded yet';
}
