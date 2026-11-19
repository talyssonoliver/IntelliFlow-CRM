/**
 * MVP-014 "Who is waiting": leads and contacts whose latest email to us has had no reply.
 *
 * A person is waiting when they have an inbound email and no outbound email to them after it.
 * `since` is the earliest inbound email after our last outbound one, so "waiting 2 days" counts
 * from the first message that went unanswered, not from the latest nudge. Oldest first.
 *
 * Direction comes from the stored `metadata.direction` ('inbound' | 'outbound'). Rows that
 * predate it are read the way the Emails tab reads them: an EMAIL activity titled "Reply
 * received ..." is inbound, any other EMAIL activity is outbound. Mail sent from inside the CRM
 * is stored without a direction or a lead link, so a sent record addressed to the person's
 * email counts as outbound.
 */

import { activityDirection, type ActivityDirection } from '../lead/lead-activity-direction';

export type WaitingKind = 'lead' | 'contact';

export interface WaitingPerson {
  kind: WaitingKind;
  id: string;
  name: string;
  email: string;
  company: string | null;
}

export interface MailEvent {
  /** `lead:<id>` or `contact:<id>` (see personKey). */
  key: string;
  direction: ActivityDirection;
  at: Date;
  subject: string;
}

export interface WaitingItem extends WaitingPerson {
  /** The first inbound email that has had no reply since. */
  since: Date;
  subject: string;
  /** Inbound emails received since our last outbound one. */
  unanswered: number;
}

export const personKey = (kind: WaitingKind, id: string): string => `${kind}:${id}`;

/** Outbound statuses that mean the mail really left; drafts, failures and bounces do not. */
export const SENT_STATUSES = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] as const;

function metadataDirection(metadata: unknown): ActivityDirection | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const value = (metadata as { direction?: unknown }).direction;
  return value === 'inbound' || value === 'outbound' ? value : undefined;
}

/** Direction of a lead/contact EMAIL activity row; untagged rows read as the Emails tab does. */
export function activityRowDirection(row: { title: string; metadata: unknown }): ActivityDirection {
  const stored = metadataDirection(row.metadata);
  return activityDirection({ type: 'EMAIL', title: row.title, direction: stored }) ?? 'outbound';
}

/**
 * Direction of an email_records row, or undefined when it is not a mail that left or arrived.
 * Synced mail stores its direction. Without one, the inbound email webhook stores received mail
 * as DELIVERED with no sender user, while mail sent from the CRM always has the sending user, so
 * a DELIVERED row without a user is inbound and any other sent status is outbound.
 */
export function recordDirection(row: {
  status: string;
  metadata: unknown;
  userId?: string | null;
}): ActivityDirection | undefined {
  const stored = metadataDirection(row.metadata);
  if (stored) return stored;
  if (row.status === 'DELIVERED' && !row.userId) return 'inbound';
  return (SENT_STATUSES as readonly string[]).includes(row.status) ? 'outbound' : undefined;
}
/** Lower-cased addresses in a comma, semicolon or space separated list. */
export function splitAddresses(list: string | null | undefined): string[] {
  if (!list) return [];
  return list
    .split(/[,;\s]+/)
    .map(bareAddress)
    .filter((a) => a.includes('@'));
}

/** "<a@b.c>" or "a@b.c>" to "a@b.c", lower-cased (no regex: nothing to backtrack). */
function bareAddress(part: string): string {
  const open = part.indexOf('<');
  const close = part.indexOf('>', open + 1);
  const inner = part.slice(open + 1, close === -1 ? undefined : close);
  return inner.trim().toLowerCase();
}

function unansweredSince(
  events: MailEvent[]
): { since: Date; subject: string; count: number } | null {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let lastOutbound = -Infinity;
  for (const e of sorted) if (e.direction === 'outbound') lastOutbound = e.at.getTime();
  const open = sorted.filter((e) => e.direction === 'inbound' && e.at.getTime() > lastOutbound);
  const first = open[0];
  // The same mail can reach a person twice (synced mail logs an activity and a record).
  const distinct = new Set(open.map((e) => e.at.getTime())).size;
  return first ? { since: first.at, subject: first.subject, count: distinct } : null;
}

/** Who is waiting, oldest first. Pure: no clock, no database. */
export function pickWaiting(people: WaitingPerson[], mail: MailEvent[]): WaitingItem[] {
  const byKey = new Map<string, MailEvent[]>();
  for (const e of mail) byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);

  const items: WaitingItem[] = [];
  for (const p of people) {
    const open = unansweredSince(byKey.get(personKey(p.kind, p.id)) ?? []);
    if (open)
      items.push({ ...p, since: open.since, subject: open.subject, unanswered: open.count });
  }
  // One person can be both a lead and a contact (same email): list them once, as the lead,
  // so the card never counts one sender twice and every lead stays in the leads filter.
  const leadEmails = new Set(
    items.filter((i) => i.kind === 'lead').map((i) => i.email.toLowerCase())
  );
  const unique = items.filter((i) => i.kind === 'lead' || !leadEmails.has(i.email.toLowerCase()));
  return unique.sort((a, b) => a.since.getTime() - b.since.getTime() || a.id.localeCompare(b.id));
}
