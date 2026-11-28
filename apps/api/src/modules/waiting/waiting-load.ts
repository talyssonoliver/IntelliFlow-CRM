/**
 * Loads what pickWaiting needs for one tenant (MVP-014). Every query carries the tenant id;
 * leads and contacts also carry the caller's owner scope, so a rep sees only their own people,
 * the same as the leads list.
 *
 * The `waiting.list` card and the leads-list filter now decide this in SQL (waiting-sql.ts); this
 * loader stays as the reference the SQL is proven equal to (tests/integration/waiting-sql.test.ts and
 * waiting-lead-filter.test.ts) and has no production caller. Mail rows are read through the
 * visibility policy (register #64): a colleague's personal-mailbox mail does not make a lead
 * "waiting" on someone else's card.
 */

import { visibleEmailWhere, type MailViewer, type PrismaClient } from '@intelliflow/db';
import {
  activityRowDirection,
  bouncedAddresses,
  isUnsentOutbound,
  isUntaggedRecordLog,
  personKey,
  pickWaiting,
  recordDirection,
  splitAddresses,
  withoutDismissed,
  type MailEvent,
  type WaitingItem,
  type WaitingKind,
  type WaitingPerson,
} from './waiting-for-reply';

/** The tag tools/scripts/clean-automated-leads.ts puts on a lead it archives (status LOST). */
export const AUTOMATED_SENDER_TAG = 'automated-sender';
const PEOPLE_CAP = 20000;
// Rows read per table, newest first. A table that fills the cap only covers history back to its oldest
// row, so every source is cut to the shortest such window (see coverageFloor).
export const MAIL_CAP = 50000;

type Scope = Record<string, unknown> & { tenantId: string };

interface PersonRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
}

export function toPerson(kind: WaitingKind, r: PersonRow): WaitingPerson {
  const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  // The same fallback chain as the lead's display name: person, then company, then email (#45).
  return {
    kind,
    id: r.id,
    name: name || r.company?.trim() || r.email,
    email: r.email,
    company: r.company,
  };
}

async function loadPeople(
  db: PrismaClient,
  leadScope: Scope,
  contactScope: Scope
): Promise<WaitingPerson[]> {
  const select = { id: true, firstName: true, lastName: true, email: true, company: true };
  const [leads, contacts] = await Promise.all([
    // Ordered, so a tenant past the cap loses the same people every time, not a random few.
    db.lead.findMany({
      where: leadScope,
      select: { ...select, status: true, tags: true },
      orderBy: { id: 'asc' },
      take: PEOPLE_CAP,
    }),
    db.contact.findMany({ where: contactScope, select, orderBy: { id: 'asc' }, take: PEOPLE_CAP }),
  ]);
  return [
    // A lead archived as an automated sender (register #57) is nobody's wait.
    ...leads
      .filter((r) => !(r.status === 'LOST' && (r.tags ?? []).includes(AUTOMATED_SENDER_TAG)))
      .map((r) => toPerson('lead', r as PersonRow)),
    ...contacts.map((r) => toPerson('contact', r as PersonRow)),
  ];
}

interface RecordRow {
  id: string;
  subject: string;
  status: string;
  metadata: unknown;
  userId: string | null;
  contactId: string | null;
  fromEmail: string;
  toEmail: string;
  ccEmails: string | null;
  bccEmails: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

/** The one clock a record is judged by everywhere: when it was sent, else when it was created. */
const recordTime = (r: RecordRow): Date => r.sentAt ?? r.createdAt;

const RECORD_SELECT = {
  id: true,
  subject: true,
  status: true,
  metadata: true,
  userId: true,
  contactId: true,
  fromEmail: true,
  toEmail: true,
  ccEmails: true,
  bccEmails: true,
  sentAt: true,
  createdAt: true,
};

/**
 * email_records, newest first by their event time, in two streams so that ordering, the cap and the
 * coverage floor all use the same clock: rows with a sentAt are read by sentAt, rows without one
 * (received by webhook, still unsent) by createdAt. Each stream is one source for coverageFloor.
 */
async function loadRecords(
  db: PrismaClient,
  viewer: MailViewer,
  cap: number
): Promise<{ sent: RecordRow[]; unsent: RecordRow[] }> {
  const { tenantId } = viewer;
  // Deliberate policy (register #64): "answered" is judged from the mail this viewer may read. A
  // reply sent from a colleague's personal mailbox and not logged to the lead or contact is that
  // colleague's private mail, so the lead keeps showing as waiting until the reply is logged.
  const visible = await visibleEmailWhere(db as never, viewer);
  const [sent, unsent] = await Promise.all([
    db.emailRecord.findMany({
      where: { tenantId, AND: [visible], sentAt: { not: null } },
      select: RECORD_SELECT,
      orderBy: { sentAt: 'desc' },
      take: cap,
    }),
    db.emailRecord.findMany({
      where: { tenantId, AND: [visible], sentAt: null },
      select: RECORD_SELECT,
      orderBy: { createdAt: 'desc' },
      take: cap,
    }),
  ]);
  return { sent: sent as RecordRow[], unsent: unsent as RecordRow[] };
}
/** Who a record did not really reach: nobody when it left, everybody when it never did. */
function unreached(r: RecordRow): { all: boolean; addresses: Set<string> } {
  return { all: isUnsentOutbound(r), addresses: bouncedAddresses(r.metadata) };
}

/** Person key to lower-cased email, for every lead and contact. */
function emailsByKey(people: WaitingPerson[]): Map<string, string> {
  return new Map(people.map((p) => [personKey(p.kind, p.id), p.email.toLowerCase()]));
}

/** The email_records row an activity logs (the Inbox's log to contact, synced mail), if any. */
function loggedRecordId(r: { metadata: unknown }): string | undefined {
  const id = (r.metadata as { emailRecordId?: unknown } | null)?.emailRecordId;
  return typeof id === 'string' ? id : undefined;
}

interface ActivityRow {
  title: string;
  timestamp: Date;
  metadata: unknown;
}

interface ActivityRows {
  leadRows: (ActivityRow & { leadId: string })[];
  contactRows: (ActivityRow & { contactId: string })[];
}

async function loadActivityRows(
  db: PrismaClient,
  tenantId: string,
  cap: number
): Promise<ActivityRows> {
  const select = { title: true, timestamp: true, metadata: true };
  const where = { tenantId, type: 'EMAIL' as const };
  const [leadRows, contactRows] = await Promise.all([
    db.leadActivity.findMany({
      where,
      select: { ...select, leadId: true },
      orderBy: { timestamp: 'desc' },
      take: cap,
    }),
    db.contactActivity.findMany({
      where,
      select: { ...select, contactId: true },
      orderBy: { timestamp: 'desc' },
      take: cap,
    }),
  ]);
  return { leadRows, contactRows };
}

/**
 * The instant after which every source is complete. A table that returned `cap` rows may have more
 * history it did not read, and the oldest row it did read (it reads newest first) marks how far back
 * it is complete. Reply and inbound can live in different tables, so a reply stored only in a capped
 * email_records table must not be dropped while the inbound it answers stays in a table that was not
 * capped: every source is cut to the shortest window, so each is judged on the same history.
 */
export function coverageFloor(sources: { times: Date[] }[], cap: number): number {
  let floor = -Infinity;
  for (const s of sources) {
    if (s.times.length < cap) continue;
    const oldest = s.times.reduce((min, t) => Math.min(min, t.getTime()), Infinity);
    floor = Math.max(floor, oldest);
  }
  return floor;
}

/**
 * Activity rows (lead and contact) as mail events. An activity that logs an email record is read
 * at that record's time and, when it carries no direction of its own, in that record's direction,
 * so it is judged on the same clock as the record and still links a person whose address differs
 * from the mail's. An outbound activity whose record never reached that person (not sent, or
 * bounced for their address) is not a reply. An activity that logs a record outside the rows read
 * is dropped when it carries no direction, since nothing says which way the mail went.
 */
function activityMail(
  rows: ActivityRows,
  people: WaitingPerson[],
  records: RecordRow[],
  floor: number
): MailEvent[] {
  const emails = emailsByKey(people);
  const byId = new Map(records.map((r) => [r.id, r]));
  const toEvent = (key: string, r: ActivityRow): MailEvent | undefined => {
    const id = loggedRecordId(r);
    const rec = id ? byId.get(id) : undefined;
    if (!rec && isUntaggedRecordLog(r.metadata)) return undefined;
    const direction =
      rec && isUntaggedRecordLog(r.metadata) ? recordDirection(rec) : activityRowDirection(r);
    const at = rec ? recordTime(rec) : r.timestamp;
    if (!direction || at.getTime() <= floor) return undefined;
    if (rec && direction === 'outbound') {
      const m = unreached(rec);
      if (m.all || m.addresses.has(emails.get(key) ?? '')) return undefined;
    }
    return { key, direction, at, subject: r.title, ref: id };
  };
  const events: MailEvent[] = [];
  const add = (key: string, r: ActivityRow) => {
    const e = toEvent(key, r);
    if (e) events.push(e);
  };
  for (const r of rows.leadRows) add(personKey('lead', r.leadId), r);
  for (const r of rows.contactRows) add(personKey('contact', r.contactId), r);
  return events;
}
/** email_records as mail events, matched to people by contact link or by address. */
function recordMail(records: RecordRow[], people: WaitingPerson[], floor: number): MailEvent[] {
  const keysByEmail = new Map<string, string[]>();
  for (const p of people) {
    const e = p.email.toLowerCase();
    keysByEmail.set(e, [...(keysByEmail.get(e) ?? []), personKey(p.kind, p.id)]);
  }
  const emails = emailsByKey(people);

  const events: MailEvent[] = [];
  for (const r of records) {
    const direction = recordDirection(r);
    const at = recordTime(r);
    if (!direction || at.getTime() <= floor) continue;
    // Everyone the mail went to counts, Bcc included, except addresses it bounced for.
    const bounced = bouncedAddresses(r.metadata);
    const addresses =
      direction === 'inbound'
        ? splitAddresses(r.fromEmail)
        : [
            ...splitAddresses(r.toEmail),
            ...splitAddresses(r.ccEmails),
            ...splitAddresses(r.bccEmails),
          ];
    const keys = new Set(
      addresses.filter((a) => !bounced.has(a)).flatMap((a) => keysByEmail.get(a) ?? [])
    );
    const linked = r.contactId ? personKey('contact', r.contactId) : undefined;
    if (linked && !bounced.has(emails.get(linked) ?? '')) keys.add(linked);
    for (const key of keys) events.push({ key, direction, at, subject: r.subject, ref: r.id });
  }
  return events;
}

/** Everyone waiting for our reply in the tenant, oldest first, less those marked handled. */
export async function loadWaiting(
  db: PrismaClient,
  viewer: MailViewer,
  leadScope: Scope,
  contactScope: Scope,
  cap: number = MAIL_CAP
): Promise<WaitingItem[]> {
  const people = await loadPeople(db, leadScope, contactScope);
  const { sent, unsent } = await loadRecords(db, viewer, cap);
  const records = [...sent, ...unsent];
  const rows = await loadActivityRows(db, viewer.tenantId, cap);
  const floor = coverageFloor(
    [
      { times: sent.map(recordTime) },
      { times: unsent.map(recordTime) },
      { times: rows.leadRows.map((r) => r.timestamp) },
      { times: rows.contactRows.map((r) => r.timestamp) },
    ],
    cap
  );
  const waiting = pickWaiting(people, [
    ...activityMail(rows, people, records, floor),
    ...recordMail(records, people, floor),
  ]);
  // "Handled without a reply" (MVP-012): the tenant's dismissals hide the waits they were made for.
  const dismissals = await db.waitingDismissal.findMany({
    where: { tenantId: viewer.tenantId },
    select: { personKey: true, since: true, latestAt: true },
  });
  return withoutDismissed(waiting, dismissals);
}
