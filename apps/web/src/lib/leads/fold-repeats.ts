/**
 * Folds repeated entries on a lead's activity list (owner 21/11 on the lead page: "It is
 * duplicating the same information and same lead ... show something like 'See previous'", and
 * "These are all same duplicated data" on an email thread).
 *
 * - AI insights (written by "AI Insights") of the same insight kind are the AI's read on this lead:
 *   the newest stays, the earlier ones fold under it.
 * - Emails with the same subject (ignoring Re:/Fwd:) are one thread: the newest message stays.
 * - Everything else is shown as it is.
 *
 * Input is newest first (as the page orders it); each group keeps the newest as its head, in the
 * position of that newest entry.
 */

export interface FoldableActivity {
  id: string;
  type: string;
  title: string;
  user: string;
  /** AI entries carry the insight kind here (the worker writes every one as SCORE_UPDATE). */
  metadata?: { insightType?: unknown } | null;
}

export interface FoldedActivity<T> {
  head: T;
  /** Earlier entries of the same kind, newest first. */
  previous: T[];
}

const AI_AUTHOR = 'AI Insights';

/** "Re: Fwd: Helping X" -> "helping x". */
export function threadSubject(title: string): string {
  // A loop, not one regex with nested repeats (sonarjs/slow-regex: backtracking on long input).
  let rest = title.trim();
  for (let m = /^(re|fwd|fw):/i.exec(rest); m; m = /^(re|fwd|fw):/i.exec(rest)) {
    rest = rest.slice(m[0].length).trimStart();
  }
  return rest.split(/\s+/).join(' ').toLowerCase();
}

/** The key that makes two entries "the same information"; null when an entry never folds. */
export function repeatKey(activity: FoldableActivity): string | null {
  if (activity.user === AI_AUTHOR) {
    // Same kind of insight only (codex 27/11): every AI entry shares one activity type, so the
    // type alone folded unrelated insights together. Without a kind, only the same title folds.
    const kind = activity.metadata?.insightType;
    return typeof kind === 'string' && kind
      ? `ai:${activity.type}:${kind}`
      : `ai:${activity.type}:title:${activity.title.trim().toLowerCase()}`;
  }
  if (activity.type === 'email' && activity.title.trim()) {
    return `email:${threadSubject(activity.title)}`;
  }
  return null;
}

export function foldRepeats<T extends FoldableActivity>(
  activities: readonly T[]
): FoldedActivity<T>[] {
  const groups: FoldedActivity<T>[] = [];
  const byKey = new Map<string, FoldedActivity<T>>();
  for (const activity of activities) {
    const key = repeatKey(activity);
    const group = key ? byKey.get(key) : undefined;
    if (group) {
      group.previous.push(activity);
      continue;
    }
    const created: FoldedActivity<T> = { head: activity, previous: [] };
    groups.push(created);
    if (key) byKey.set(key, created);
  }
  return groups;
}
