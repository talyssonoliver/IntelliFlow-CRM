/**
 * Loads what pickWaiting needs for one tenant (MVP-014). Every query carries the tenant id;
 * leads and contacts also carry the caller's owner scope, so a rep sees only their own people,
 * the same as the leads list.
 */

import type { PrismaClient } from '@intelliflow/db';
import {
  activityRowDirection,
  bouncedAddresses,
  isUnsentOutbound,
  isUntaggedRecordLog,
  personKey,
  pickWaiting,
  recordDirection,
  splitAddresses,
  type MailEvent,
  type WaitingItem,
  type WaitingKind,
  type WaitingPerson,
} from './waiting-for-reply';

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

function toPerson(kind: WaitingKind, r: PersonRow): WaitingPerson {
  const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  return { kind, id: r.id, name: name || r.email, email: r.email, company: r.company };
}

async function loadPeople(
  db: PrismaClient,
  leadScope: Scope,
  contactScope: Scope
): Promise<WaitingPerson[]> {
  const select = { id: true, firstName: true, lastName: true, email: true, company: true };
  const [leads, contacts] = await Promise.all([
    db.lead.findMany({ where: leadScope, select, take: PEOPLE_CAP }),
    db.contact.findMany({ where: contactScope, select, take: PEOPLE_CAP }),
  ]);
  return [
    ...leads.map((r) => toPerson('lead', r as PersonRow)),
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

async function loadRecords(db: PrismaClient, tenantId: string, cap: number): Promise<RecordRow[]> {
  return (await db.emailRecord.findMany({
    where: { tenantId },
    select: {
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
    },
    orderBy: { createdAt: 'desc' },
    take: cap,
  })) as RecordRow[];
}
/** Who a record did not really reach: nobody when it left, everybody when it never did. */
function unreached(r: RecordRow): { all: boolean; addresses: Set<string> } {
  return { all: isUnsentOutbound(r), addresses: bouncedAddresses(r.metadata) };
}

/** Person key to lower-cased email, for every lead and contact. */
function emailsByKey(people: WaitingPerson[]): Map<string, string> {
  return new Map(people.map((p) => [personKey(p.kind, p.id), p.email.toLowerCase()]));
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
 * Activity rows (lead and contact) as mail events. An outbound activity that logs a record which
 * never reached that person (not sent, or bounced for their address) is not a reply.
 */
function activityMail(
  rows: ActivityRows,
  people: WaitingPerson[],
  records: RecordRow[],
  floor: number
): MailEvent[] {
  const emails = emailsByKey(people);
  const missed = new Map(records.map((r) => [r.id, unreached(r)]));
  const toEvent = (key: string, r: ActivityRow) => ({
    key,
    direction: activityRowDirection(r),
    at: r.timestamp,
    subject: r.title,
  });
  const reached = (key: string, r: ActivityRow): boolean => {
    if (r.timestamp.getTime() <= floor || isUntaggedRecordLog(r.metadata)) return false;
    const id = (r.metadata as { emailRecordId?: unknown } | null)?.emailRecordId;
    const m = typeof id === 'string' ? missed.get(id) : undefined;
    return !m || (!m.all && !m.addresses.has(emails.get(key) ?? ''));
  };
  const events: MailEvent[] = [];
  for (const r of rows.leadRows) {
    const key = personKey('lead', r.leadId);
    if (reached(key, r)) events.push(toEvent(key, r));
  }
  for (const r of rows.contactRows) {
    const key = personKey('contact', r.contactId);
    if (reached(key, r)) events.push(toEvent(key, r));
  }
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
    if (!direction || r.createdAt.getTime() <= floor) continue;
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
    const at = r.sentAt ?? r.createdAt;
    for (const key of keys) events.push({ key, direction, at, subject: r.subject });
  }
  return events;
}

/** Everyone waiting for our reply in the tenant, oldest first. */
export async function loadWaiting(
  db: PrismaClient,
  tenantId: string,
  leadScope: Scope,
  contactScope: Scope,
  cap: number = MAIL_CAP
): Promise<WaitingItem[]> {
  const people = await loadPeople(db, leadScope, contactScope);
  const records = await loadRecords(db, tenantId, cap);
  const rows = await loadActivityRows(db, tenantId, cap);
  const floor = coverageFloor(
    [
      { times: records.map((r) => r.createdAt) },
      { times: rows.leadRows.map((r) => r.timestamp) },
      { times: rows.contactRows.map((r) => r.timestamp) },
    ],
    cap
  );
  return pickWaiting(people, [
    ...activityMail(rows, people, records, floor),
    ...recordMail(records, people, floor),
  ]);
}
