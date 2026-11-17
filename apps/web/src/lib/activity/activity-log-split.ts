/**
 * The global Activity Log (MVP-005): what people did (emails, calls, notes, meetings, deals,
 * tasks) comes first; what the system wrote (the COA pipeline sync, score and status changes,
 * the portal) is folded into one "System updates" group, the same way the lead page does it.
 *
 * The split is made here, on the entries the feed returned, and not by asking the server for a
 * list of types: the feed API applies a type filter after it has limited each source's rows, so a
 * type-filtered query can come back short with no way to reach the older entries.
 */

/** Feed types only the system writes. */
const SYSTEM_FEED_TYPES = new Set(['SYSTEM', 'SCORE_UPDATE', 'STATUS_CHANGE']);

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
  if (SYSTEM_FEED_TYPES.has(entry.type)) return true;
  return entry.actor !== null && SYSTEM_AUTHOR.test(entry.actor.name.trim());
}

export interface ActivityLogOptions {
  /** "All Activity": fold the system's entries into the group. A chosen type shows as it is. */
  fold: boolean;
  /** "My activity": keep only the signed-in person's own entries, and no system group. */
  mine: boolean;
  /** The signed-in person; with `mine` on and no id yet, nothing matches. */
  userId: string | null;
}

/**
 * Split the loaded entries into the person-written feed and the system updates, keeping their
 * order. "My activity" applies in every view, including a chosen type.
 */
export function splitActivityLog<T extends FeedEntryLike>(
  entries: readonly T[],
  { fold, mine, userId }: ActivityLogOptions
): { personal: T[]; system: T[] } {
  const isMine = (entry: T) => userId !== null && entry.actor?.id === userId;
  const personal: T[] = [];
  const system: T[] = [];
  for (const entry of entries) {
    if (fold && isSystemFeedEntry(entry)) {
      system.push(entry);
    } else if (!mine || isMine(entry)) {
      personal.push(entry);
    }
  }
  return { personal, system: mine ? [] : system };
}

/** The line above the feed when the person-written feed is empty. */
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
