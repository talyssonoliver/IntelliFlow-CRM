import { describe, it, expect } from 'vitest';
import {
  activityRowDirection,
  personKey,
  pickWaiting,
  recordDirection,
  splitAddresses,
  type MailEvent,
  type WaitingPerson,
} from '../waiting-for-reply';
import { loadWaiting } from '../waiting-load';
import { narrowToWaiting } from '../waiting-lead-filter';

const day = (d: number, h = 9) => new Date(Date.UTC(2026, 10, d, h));

const jane: WaitingPerson = {
  kind: 'lead',
  id: 'lead-1',
  name: 'Jane Example',
  email: 'jane@example.invalid',
  company: 'Example Ltd',
};
const omar: WaitingPerson = {
  kind: 'contact',
  id: 'contact-1',
  name: 'Omar Example',
  email: 'omar@example.invalid',
  company: null,
};

const mail = (
  p: WaitingPerson,
  direction: 'inbound' | 'outbound',
  at: Date,
  subject = 's'
): MailEvent => ({ key: personKey(p.kind, p.id), direction, at, subject });

describe('pickWaiting', () => {
  it('lists an inbound email that has no reply', () => {
    const items = pickWaiting([jane], [mail(jane, 'inbound', day(10), 'Quote?')]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'lead-1',
      kind: 'lead',
      subject: 'Quote?',
      unanswered: 1,
    });
    expect(items[0]?.since).toEqual(day(10));
  });

  it('drops the person once a later outbound email goes to them', () => {
    const events = [mail(jane, 'inbound', day(10)), mail(jane, 'outbound', day(11))];
    expect(pickWaiting([jane], events)).toEqual([]);
  });

  it('keeps the person when the outbound email came before the inbound one', () => {
    const events = [mail(jane, 'outbound', day(9)), mail(jane, 'inbound', day(10))];
    expect(pickWaiting([jane], events)).toHaveLength(1);
  });

  it('counts the wait from the first unanswered email, not the latest', () => {
    const events = [
      mail(jane, 'outbound', day(8)),
      mail(jane, 'inbound', day(10)),
      mail(jane, 'inbound', day(12)),
    ];
    const [item] = pickWaiting([jane], events);
    expect(item?.since).toEqual(day(10));
    expect(item?.unanswered).toBe(2);
  });

  it('lists the longest wait first, leads and contacts together', () => {
    const items = pickWaiting(
      [jane, omar],
      [mail(jane, 'inbound', day(14)), mail(omar, 'inbound', day(10))]
    );
    expect(items.map((i) => i.id)).toEqual(['contact-1', 'lead-1']);
  });

  it('ignores mail for people it was not asked about', () => {
    const other = { ...jane, id: 'lead-9' };
    expect(pickWaiting([jane], [mail(other, 'inbound', day(10))])).toEqual([]);
  });
});

describe('one person, two records', () => {
  it('lists a lead and a contact with the same email once, as the lead', () => {
    const twin: WaitingPerson = { ...omar, email: jane.email };
    const items = pickWaiting(
      [jane, twin],
      [mail(jane, 'inbound', day(10)), mail(twin, 'inbound', day(10))]
    );
    expect(items.map((i) => i.kind + ':' + i.id)).toEqual(['lead:lead-1']);
  });

  it('counts a mail that arrives as both an activity and a record once', () => {
    const [item] = pickWaiting(
      [jane],
      [mail(jane, 'inbound', day(10)), mail(jane, 'inbound', day(10))]
    );
    expect(item?.unanswered).toBe(1);
  });
});

describe('direction helpers', () => {
  it('reads the stored direction, then the title, then falls back to outbound', () => {
    expect(activityRowDirection({ title: 'x', metadata: { direction: 'inbound' } })).toBe(
      'inbound'
    );
    expect(activityRowDirection({ title: 'Reply received: hi', metadata: null })).toBe('inbound');
    expect(activityRowDirection({ title: 'Intro email', metadata: {} })).toBe('outbound');
  });

  it('counts only mail that really left as outbound', () => {
    expect(recordDirection({ status: 'SENT', metadata: null })).toBe('outbound');
    expect(recordDirection({ status: 'DELIVERED', metadata: {}, userId: 'u1' })).toBe('outbound');
    // Webhook mail: DELIVERED, no direction, no sender user.
    expect(recordDirection({ status: 'DELIVERED', metadata: {}, userId: null })).toBe('inbound');
    expect(recordDirection({ status: 'PENDING', metadata: null })).toBeUndefined();
    expect(recordDirection({ status: 'BOUNCED', metadata: null })).toBeUndefined();
    expect(recordDirection({ status: 'DELIVERED', metadata: { direction: 'inbound' } })).toBe(
      'inbound'
    );
  });

  it('splits address lists, with or without display names', () => {
    expect(splitAddresses('A@Example.invalid, Bo <b@example.invalid>; nonsense')).toEqual([
      'a@example.invalid',
      'b@example.invalid',
    ]);
    expect(splitAddresses(null)).toEqual([]);
  });
});

// A small fake of the Prisma calls the loader makes. It applies the `tenantId` and owner filters
// the loader passes, so a test fails if the loader forgets to scope a query.
function fakeDb(tables: {
  leads: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  leadActivities: Record<string, unknown>[];
  contactActivities: Record<string, unknown>[];
  emails: Record<string, unknown>[];
}) {
  const match = (rows: Record<string, unknown>[], where: Record<string, unknown>) =>
    rows.filter((r) =>
      Object.entries(where).every(([k, v]) =>
        v && typeof v === 'object' && 'in' in v
          ? (v as { in: unknown[] }).in.includes(r[k])
          : r[k] === v
      )
    );
  const table = (rows: Record<string, unknown>[]) => ({
    findMany: async ({ where }: { where: Record<string, unknown> }) => match(rows, where),
  });
  return {
    lead: table(tables.leads),
    contact: table(tables.contacts),
    leadActivity: table(tables.leadActivities),
    contactActivity: table(tables.contactActivities),
    emailRecord: table(tables.emails),
  } as never;
}

const leadRow = (id: string, tenantId: string, ownerId = 'u1') => ({
  id,
  tenantId,
  ownerId,
  firstName: id,
  lastName: 'Lead',
  email: `${id}@example.invalid`,
  company: null,
});

const tables = () => ({
  leads: [leadRow('lead-a', 't1'), leadRow('lead-b', 't1'), leadRow('lead-z', 't2')],
  contacts: [{ ...leadRow('contact-a', 't1'), firstName: 'Con', lastName: 'Tact' }],
  leadActivities: [
    // lead-a wrote in and was never answered
    {
      leadId: 'lead-a',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Re: quote',
      timestamp: day(10),
      metadata: { direction: 'inbound' },
    },
    // lead-b wrote in, then we replied
    {
      leadId: 'lead-b',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Re: call',
      timestamp: day(10),
      metadata: { direction: 'inbound' },
    },
    {
      leadId: 'lead-b',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Call',
      timestamp: day(11),
      metadata: { direction: 'outbound' },
    },
    // another tenant's lead is waiting too
    {
      leadId: 'lead-z',
      tenantId: 't2',
      type: 'EMAIL',
      title: 'Hi',
      timestamp: day(9),
      metadata: { direction: 'inbound' },
    },
  ],
  contactActivities: [],
  emails: [
    // contact-a wrote in by synced mail, with no activity row
    {
      tenantId: 't1',
      subject: 'Hello',
      status: 'DELIVERED',
      metadata: { direction: 'inbound' },
      contactId: null,
      fromEmail: 'contact-a@example.invalid',
      toEmail: 'me@example.invalid',
      ccEmails: null,
      sentAt: day(12),
      createdAt: day(12),
    },
    // we answered lead-b's second email from inside the CRM: no direction, no link
    {
      tenantId: 't1',
      subject: 'Sent from CRM',
      status: 'SENT',
      metadata: null,
      contactId: null,
      fromEmail: 'me@example.invalid',
      toEmail: 'lead-a@example.invalid',
      ccEmails: null,
      sentAt: day(13),
      createdAt: day(13),
    },
  ],
});

describe('loadWaiting', () => {
  const scope = { tenantId: 't1' };

  it('is tenant-scoped: another tenant waiting person never appears', async () => {
    const items = await loadWaiting(fakeDb(tables()), 't1', scope, scope);
    expect(items.map((i) => i.id)).not.toContain('lead-z');
  });

  it('lists inbound with no reply and drops replied people', async () => {
    const t = tables();
    // Without the CRM-sent mail, lead-a is still waiting.
    t.emails = t.emails.filter((e) => e.subject !== 'Sent from CRM');
    const items = await loadWaiting(fakeDb(t), 't1', scope, scope);
    expect(items.map((i) => i.id)).toEqual(['lead-a', 'contact-a']);
  });

  it('counts mail sent from inside the CRM, addressed to the person, as a reply', async () => {
    const items = await loadWaiting(fakeDb(tables()), 't1', scope, scope);
    expect(items.map((i) => i.id)).toEqual(['contact-a']);
  });

  it('respects the owner scope the caller passes', async () => {
    const t = tables();
    t.leads = [leadRow('lead-a', 't1', 'u2'), leadRow('lead-b', 't1', 'u1')];
    t.emails = [];
    const items = await loadWaiting(
      fakeDb(t),
      't1',
      { tenantId: 't1', ownerId: 'u1' },
      { tenantId: 't1', id: { in: [] } }
    );
    expect(items.map((i) => i.id)).toEqual([]);
  });
});

describe('names', () => {
  it('falls back to the email when a lead has no name', async () => {
    const t = tables();
    t.leads = [{ ...leadRow('lead-a', 't1'), firstName: null, lastName: null } as never];
    t.emails = [];
    const items = await loadWaiting(
      fakeDb(t),
      't1',
      { tenantId: 't1' },
      { tenantId: 't1', id: { in: [] } }
    );
    expect(items[0]?.name).toBe('lead-a@example.invalid');
  });
});

describe('webhook mail', () => {
  it('lists the sender, and does not clear a lead who is only copied on it', async () => {
    const t = tables();
    // lead-b wrote in earlier and is waiting; being copied on lead-a's mail must not clear it.
    t.leadActivities = [t.leadActivities[1]!];
    t.contactActivities = [];
    t.emails = [
      {
        tenantId: 't1',
        subject: 'Question',
        status: 'DELIVERED',
        metadata: { threadId: 'x' },
        userId: null,
        contactId: null,
        fromEmail: 'lead-a@example.invalid',
        toEmail: 'me@example.invalid',
        ccEmails: 'lead-b@example.invalid',
        sentAt: null,
        createdAt: day(12),
      } as never,
    ];
    const items = await loadWaiting(fakeDb(t), 't1', { tenantId: 't1' }, { tenantId: 't1' });
    expect(items.map((i) => i.id)).toEqual(['lead-b', 'lead-a']);
  });
});

describe('narrowToWaiting (the leads-list filter)', () => {
  const ctx = (db: unknown) =>
    ({
      tenant: {
        tenantId: 't1',
        userId: 'u1',
        role: 'ADMIN',
        tenantType: 'user',
        canAccessAllTenantData: true,
      },
      prismaWithTenant: db,
    }) as never;

  it('leaves ids alone when the filter is off', async () => {
    expect(await narrowToWaiting(ctx(null), { ids: ['x'] })).toEqual(['x']);
    expect(await narrowToWaiting(ctx(null), {})).toBeUndefined();
  });

  it('returns exactly the waiting leads, the same ones the card counts', async () => {
    const t = tables();
    t.emails = [];
    const db = fakeDb(t);
    const ids = await narrowToWaiting(ctx(db), { waitingForReply: true });
    const card = await loadWaiting(db, 't1', { tenantId: 't1' }, { tenantId: 't1' });
    expect(ids).toEqual(card.filter((i) => i.kind === 'lead').map((i) => i.id));
    expect(ids).toEqual(['lead-a']);
  });

  it('stays inside ids when both are given, and is empty when nobody is waiting', async () => {
    const t = tables();
    t.emails = [];
    expect(
      await narrowToWaiting(ctx(fakeDb(t)), { waitingForReply: true, ids: ['lead-b'] })
    ).toEqual([]);
  });
});
