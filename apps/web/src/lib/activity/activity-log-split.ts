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

/** The automated authors the API names, such as "AI Insights" and "AI Scoring Agent". */
const AI_AUTHOR = /^AI [A-Z][\w ]*$/;

export interface FeedEntryLike {
  id: string;
  type: string;
  /** Where the entry comes from (LEAD_ACTIVITY, TICKET_ACTIVITY, EMAIL...). */
  source?: string;
  actor: { id: string | null; name: string } | null;
}

/**
 * True for an entry the system wrote:
 * - a "System (...)" author;
 * - a ticket entry never counts otherwise: ticket entries carry no author id, and a human reply
 *   to a ticket is typed SYSTEM;
 * - a score update or system event;
 * - a status change with no person behind it. A status change a person made (converting a lead, a
 *   bulk status change) carries that person as its author and stays in their activity.
 */
export function isSystemFeedEntry(
  entry: Pick<FeedEntryLike, 'type' | 'actor'> & { source?: string }
): boolean {
  const hasPerson = !!entry.actor?.id;
  const name = entry.actor?.name.trim() ?? '';
  // The API falls back to the display name "System" for some entries a person wrote (it carries
  // their id), so the name only counts when no person is attached.
  if (!hasPerson && (SYSTEM_AUTHOR.test(name) || AI_AUTHOR.test(name))) return true;
  if (entry.source === 'TICKET_ACTIVITY') return false;
  if (!SYSTEM_FEED_TYPES.has(entry.type)) return false;
  // A status change is a person's when it has a person id or an email as its author.
  return entry.type !== 'STATUS_CHANGE' || (!hasPerson && !name.includes('@'));
}

export interface ActivityLogOptions {
  /** "All Activity": fold the system's entries into the group. A chosen type shows as it is. */
  fold: boolean;
  /** "My activity": keep only the signed-in person's own entries, and no system group. */
  mine: boolean;
  /** The signed-in person; with `mine` on and no id yet, nothing matches. */
  userId: string | null;
  /**
   * The signed-in person's email. Lead activity written through logActivity carries the author's
   * email and no id: those entries match on it, ignoring case. A display name is not used: it is
   * not unique, so a namesake's entries would pass as his. (Ticket entries carry only a display
   * name, so they stay out of My activity until the API records the author's id.)
   */
  userEmail?: string | null;
}

/**
 * Split the loaded entries into the person-written feed and the system updates, keeping their
 * order. "My activity" applies in every view, including a chosen type.
 */
export function splitActivityLog<T extends FeedEntryLike>(
  entries: readonly T[],
  { fold, mine, userId, userEmail = null }: ActivityLogOptions
): { personal: T[]; system: T[] } {
  const email = userEmail?.trim().toLowerCase() ?? '';
  const isMine = (entry: T) => {
    if (!entry.actor) return false;
    if (entry.actor.id) return userId !== null && entry.actor.id === userId;
    return email !== '' && entry.actor.name.trim().toLowerCase() === email;
  };
  const personal: T[] = [];
  const system: T[] = [];
  for (const entry of entries) {
    // What the signed-in person did stays in their feed, whatever its type.
    if (fold && isSystemFeedEntry(entry) && !isMine(entry)) {
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
