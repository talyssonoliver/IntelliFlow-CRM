/**
 * Loads what pickWaiting needs for one tenant (MVP-014). Every query carries the tenant id;
 * leads and contacts also carry the caller's owner scope, so a rep sees only their own people,
 * the same as the leads list.
 */

import type { PrismaClient } from '@intelliflow/db';
import {
  activityRowDirection,
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
// Newest first, so a tenant past the cap loses its oldest history, never its latest replies.
const MAIL_CAP = 50000;

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

/** Activity rows (lead and contact) as mail events. */
async function loadActivityMail(db: PrismaClient, tenantId: string): Promise<MailEvent[]> {
  const select = { title: true, timestamp: true, metadata: true };
  const where = { tenantId, type: 'EMAIL' as const };
  const [leadRows, contactRows] = await Promise.all([
    db.leadActivity.findMany({
      where,
      select: { ...select, leadId: true },
      orderBy: { timestamp: 'desc' },
      take: MAIL_CAP,
    }),
    db.contactActivity.findMany({
      where,
      select: { ...select, contactId: true },
      orderBy: { timestamp: 'desc' },
      take: MAIL_CAP,
    }),
  ]);
  const toEvent = (key: string, r: { title: string; timestamp: Date; metadata: unknown }) => ({
    key,
    direction: activityRowDirection(r),
    at: r.timestamp,
    subject: r.title,
  });
  return [
    ...leadRows.map((r) => toEvent(personKey('lead', r.leadId), r)),
    ...contactRows.map((r) => toEvent(personKey('contact', r.contactId), r)),
  ];
}

/** email_records as mail events, matched to people by contact link or by address. */
async function loadRecordMail(
  db: PrismaClient,
  tenantId: string,
  people: WaitingPerson[]
): Promise<MailEvent[]> {
  const rows = await db.emailRecord.findMany({
    where: { tenantId },
    select: {
      subject: true,
      status: true,
      metadata: true,
      userId: true,
      contactId: true,
      fromEmail: true,
      toEmail: true,
      ccEmails: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAIL_CAP,
  });

  const keysByEmail = new Map<string, string[]>();
  for (const p of people) {
    const e = p.email.toLowerCase();
    keysByEmail.set(e, [...(keysByEmail.get(e) ?? []), personKey(p.kind, p.id)]);
  }

  const events: MailEvent[] = [];
  for (const r of rows) {
    const direction = recordDirection(r);
    if (!direction) continue;
    const addresses =
      direction === 'inbound'
        ? splitAddresses(r.fromEmail)
        : [...splitAddresses(r.toEmail), ...splitAddresses(r.ccEmails)];
    const keys = new Set(addresses.flatMap((a) => keysByEmail.get(a) ?? []));
    if (r.contactId) keys.add(personKey('contact', r.contactId));
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
  contactScope: Scope
): Promise<WaitingItem[]> {
  const people = await loadPeople(db, leadScope, contactScope);
  const [activityMail, recordMail] = await Promise.all([
    loadActivityMail(db, tenantId),
    loadRecordMail(db, tenantId, people),
  ]);
  return pickWaiting(people, [...activityMail, ...recordMail]);
}
