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

/**
 * True for an activity that only logs an email_records row against a person (the Inbox's log to
 * contact) and carries no direction of its own: the record is counted with its real direction.
 */
export function isUntaggedRecordLog(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || metadataDirection(metadata)) return false;
  return Boolean((metadata as { emailRecordId?: unknown }).emailRecordId);
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
 * a DELIVERED row without a user is inbound and any other sent status is outbound. An outbound
 * mail only counts once it left (SENT, DELIVERED, OPENED, CLICKED): a stored outbound direction
 * on a FAILED, BOUNCED or still PENDING record is not a reply.
 */
export function recordDirection(row: {
  status: string;
  metadata: unknown;
  userId?: string | null;
}): ActivityDirection | undefined {
  const stored = metadataDirection(row.metadata);
  if (stored === 'inbound') return 'inbound';
  if (!stored && row.status === 'DELIVERED' && !row.userId) return 'inbound';
  return (SENT_STATUSES as readonly string[]).includes(row.status) ? 'outbound' : undefined;
}

/**
 * True when the record is a mail of ours that never left (see recordDirection): not sent, and not
 * received. CRM sends carry no stored direction, so an untagged FAILED, BOUNCED or PENDING record
 * counts the same as a tagged one.
 */
export function isUnsentOutbound(row: { status: string; metadata: unknown }): boolean {
  return metadataDirection(row.metadata) !== 'inbound' && recordDirection(row) === undefined;
}

/**
 * Addresses a send bounced or was rejected for, as the bounce reader records them on the record
 * (a partly bounced mail keeps its status, so the status alone does not say who it reached).
 */
export function bouncedAddresses(metadata: unknown): Set<string> {
  const out = new Set<string>();
  if (!metadata || typeof metadata !== 'object') return out;
  const m = metadata as Record<string, unknown>;
  for (const key of ['bouncedRecipients', 'hardBouncedRecipients', 'rejectedRecipients']) {
    const list = m[key];
    if (!Array.isArray(list)) continue;
    for (const a of list) if (typeof a === 'string') splitAddresses(a).forEach((x) => out.add(x));
  }
  return out;
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

/**
 * Who is waiting, oldest first. Pure: no clock, no database. A lead and a contact with the same
 * email are one person, so their histories are merged before deciding: a reply logged against
 * the contact answers a mail logged against the lead. The person is then listed as the lead(s),
 * so every lead stays in the leads filter, or as the contact(s) when there is no lead.
 */
export function pickWaiting(people: WaitingPerson[], mail: MailEvent[]): WaitingItem[] {
  const byKey = new Map<string, MailEvent[]>();
  for (const e of mail) byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);

  const byEmail = new Map<string, WaitingPerson[]>();
  for (const p of people) {
    const email = p.email.toLowerCase();
    byEmail.set(email, [...(byEmail.get(email) ?? []), p]);
  }

  const items: WaitingItem[] = [];
  for (const group of byEmail.values()) {
    const events = group.flatMap((p) => byKey.get(personKey(p.kind, p.id)) ?? []);
    const open = unansweredSince(events);
    if (!open) continue;
    const leads = group.filter((p) => p.kind === 'lead');
    for (const p of leads.length > 0 ? leads : group) {
      items.push({ ...p, since: open.since, subject: open.subject, unanswered: open.count });
    }
  }
  return items.sort((a, b) => a.since.getTime() - b.since.getTime() || a.id.localeCompare(b.id));
}
