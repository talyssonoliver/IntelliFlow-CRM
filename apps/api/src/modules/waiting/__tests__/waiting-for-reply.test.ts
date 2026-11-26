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
import { coverageFloor, loadWaiting } from '../waiting-load';
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

describe('replies that did not reach the person', () => {
  const scope = { tenantId: 't1' };
  const contactScope = { tenantId: 't1', id: { in: [] } };
  // lead-a wrote in on day 10; the reply under test goes out on day 12.
  const waitingLead = () => {
    const t = tables();
    t.leads = [leadRow('lead-a', 't1')];
    t.contacts = [];
    t.contactActivities = [];
    t.leadActivities = [
      {
        leadId: 'lead-a',
        tenantId: 't1',
        type: 'EMAIL',
        title: 'Question',
        timestamp: day(10),
        metadata: { direction: 'inbound' },
      } as never,
    ];
    t.emails = [];
    return t;
  };
  const sent = (over: Record<string, unknown>) =>
    ({
      id: 'rec-1',
      tenantId: 't1',
      subject: 'Answer',
      status: 'SENT',
      metadata: null,
      userId: 'u1',
      contactId: null,
      fromEmail: 'me@example.invalid',
      toEmail: 'lead-a@example.invalid',
      ccEmails: null,
      bccEmails: null,
      sentAt: day(12),
      createdAt: day(12),
      ...over,
    }) as never;
  const ids = async (t: ReturnType<typeof waitingLead>) =>
    (await loadWaiting(fakeDb(t), 't1', scope, contactScope)).map((i) => i.id);

  it('a reply sent to them clears the wait (control)', async () => {
    const t = waitingLead();
    t.emails = [sent({})];
    expect(await ids(t)).toEqual([]);
  });

  it('a bounce or rejection for their address is not a reply, even when the mail was sent', async () => {
    const t = waitingLead();
    t.emails = [
      sent({
        toEmail: 'lead-a@example.invalid, other@example.invalid',
        metadata: { bouncedRecipients: ['Lead-A@example.invalid'] },
      }),
    ];
    expect(await ids(t)).toEqual(['lead-a']);
  });

  it('a bounce for someone else on the same mail does not undo the reply', async () => {
    const t = waitingLead();
    t.emails = [
      sent({
        toEmail: 'lead-a@example.invalid, other@example.invalid',
        metadata: { bouncedRecipients: ['other@example.invalid'] },
      }),
    ];
    expect(await ids(t)).toEqual([]);
  });

  it('a stored outbound direction on a failed or bounced record is not a reply', async () => {
    for (const status of ['FAILED', 'BOUNCED', 'PENDING']) {
      const t = waitingLead();
      t.emails = [sent({ status, metadata: { direction: 'outbound' } })];
      expect(await ids(t)).toEqual(['lead-a']);
    }
  });

  it('a stored outbound direction on a delivered record is a reply', async () => {
    const t = waitingLead();
    t.emails = [sent({ status: 'DELIVERED', metadata: { direction: 'outbound' } })];
    expect(await ids(t)).toEqual([]);
  });

  it('an activity logging a mail that never left is not a reply either', async () => {
    const t = waitingLead();
    t.emails = [sent({ status: 'FAILED', metadata: { direction: 'outbound' } })];
    t.leadActivities.push({
      leadId: 'lead-a',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Answer',
      timestamp: day(12),
      metadata: { direction: 'outbound', emailRecordId: 'rec-1' },
    } as never);
    expect(await ids(t)).toEqual(['lead-a']);
  });

  it('an activity logging a mail that bounced for their address is not a reply', async () => {
    const t = waitingLead();
    t.emails = [
      sent({ metadata: { direction: 'outbound', bouncedRecipients: ['lead-a@example.invalid'] } }),
    ];
    t.leadActivities.push({
      leadId: 'lead-a',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Answer',
      timestamp: day(12),
      metadata: { direction: 'outbound', emailRecordId: 'rec-1' },
    } as never);
    expect(await ids(t)).toEqual(['lead-a']);
  });

  it('an activity logging an untagged CRM send that failed or bounced is not a reply', async () => {
    for (const status of ['FAILED', 'BOUNCED', 'PENDING']) {
      const t = waitingLead();
      t.emails = [sent({ status, metadata: null })];
      t.leadActivities.push({
        leadId: 'lead-a',
        tenantId: 't1',
        type: 'EMAIL',
        title: 'Answer',
        timestamp: day(12),
        metadata: { direction: 'outbound', emailRecordId: 'rec-1' },
      } as never);
      expect(await ids(t)).toEqual(['lead-a']);
    }
  });

  it('an activity logging an untagged CRM send that left is a reply', async () => {
    const t = waitingLead();
    t.emails = [sent({ status: 'SENT', metadata: null })];
    t.leadActivities.push({
      leadId: 'lead-a',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Answer',
      timestamp: day(12),
      metadata: { direction: 'outbound', emailRecordId: 'rec-1' },
    } as never);
    expect(await ids(t)).toEqual([]);
  });
  it('a reply that went to them in Bcc counts', async () => {
    const t = waitingLead();
    t.emails = [sent({ toEmail: 'team@example.invalid', bccEmails: 'Lead-A@example.invalid' })];
    expect(await ids(t)).toEqual([]);
  });

  it('a Bcc address that bounced does not count', async () => {
    const t = waitingLead();
    t.emails = [
      sent({
        toEmail: 'team@example.invalid',
        bccEmails: 'lead-a@example.invalid',
        metadata: { bouncedRecipients: ['lead-a@example.invalid'] },
      }),
    ];
    expect(await ids(t)).toEqual(['lead-a']);
  });
});

describe('a lead and a contact with one email', () => {
  it('a reply logged against the contact clears a mail logged against the lead', () => {
    const twin: WaitingPerson = { ...omar, email: jane.email };
    expect(
      pickWaiting([jane, twin], [mail(jane, 'inbound', day(10)), mail(twin, 'outbound', day(11))])
    ).toEqual([]);
  });

  it('a reply logged against the lead clears a mail logged against the contact', () => {
    const twin: WaitingPerson = { ...omar, email: jane.email.toUpperCase() };
    expect(
      pickWaiting([jane, twin], [mail(twin, 'inbound', day(10)), mail(jane, 'outbound', day(11))])
    ).toEqual([]);
  });

  it('lists the lead, not the contact, when the merged history is still unanswered', () => {
    const twin: WaitingPerson = { ...omar, email: jane.email };
    const items = pickWaiting(
      [twin, jane],
      [mail(twin, 'inbound', day(10)), mail(jane, 'inbound', day(12))]
    );
    expect(items.map((i) => i.kind + ':' + i.id)).toEqual(['lead:lead-1']);
    expect(items[0]?.since).toEqual(day(10));
    expect(items[0]?.unanswered).toBe(2);
  });

  it('lists the contact when there is no lead', () => {
    const items = pickWaiting([omar], [mail(omar, 'inbound', day(10))]);
    expect(items.map((i) => i.id)).toEqual(['contact-1']);
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
  // One Prisma where condition: `{ in: [...] }`, `{ not: x }` or plain equality (null equals unset).
  const holds = (value: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === 'object' && 'in' in cond)
      return (cond as { in: unknown[] }).in.includes(value);
    if (cond && typeof cond === 'object' && 'not' in cond)
      return (value ?? null) !== (cond as { not: unknown }).not;
    return (value ?? null) === cond;
  };
  const match = (rows: Record<string, unknown>[], where: Record<string, unknown>) =>
    rows.filter((r) => Object.entries(where).every(([k, v]) => holds(r[k], v))); // Like Prisma: filter, then order (newest first when asked) and cut to take.
  const table = (rows: Record<string, unknown>[]) => ({
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }) => {
      let out = match(rows, where);
      const key = orderBy ? Object.keys(orderBy)[0] : undefined;
      if (key && orderBy) {
        const num = (v: unknown) => (v instanceof Date ? v.getTime() : String(v));
        const sign = orderBy[key] === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const [x, y] = [num(a[key]), num(b[key])];
          if (x === y) return 0;
          return sign * (x < y ? -1 : 1);
        });
      }
      return take === undefined ? out : out.slice(0, take);
    },
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

  it('does not list a lead archived as an automated sender, but does list a lost real one', async () => {
    const t = tables();
    t.emails = t.emails.filter((e) => e.subject !== 'Sent from CRM');
    t.leads = t.leads.map((l) =>
      l.id === 'lead-a' ? { ...l, status: 'LOST', tags: ['automated-sender'] } : l
    );
    expect((await loadWaiting(fakeDb(t), 't1', scope, scope)).map((i) => i.id)).toEqual([
      'contact-a',
    ]);
    t.leads = t.leads.map((l) => (l.id === 'lead-a' ? { ...l, status: 'LOST', tags: [] } : l));
    expect((await loadWaiting(fakeDb(t), 't1', scope, scope)).map((i) => i.id)).toEqual([
      'lead-a',
      'contact-a',
    ]);
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
  it('names a lead with no person name by its company before its email (#45)', async () => {
    const t = tables();
    t.leads = [
      {
        ...leadRow('lead-a', 't1'),
        firstName: null,
        lastName: null,
        company: ' Acme Handyman Ltd ',
      } as never,
    ];
    t.emails = [];
    const items = await loadWaiting(
      fakeDb(t),
      't1',
      { tenantId: 't1' },
      { tenantId: 't1', id: { in: [] } }
    );
    expect(items[0]?.name).toBe('Acme Handyman Ltd');
  });

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

describe('logged mail', () => {
  it('keeps a lead waiting when the received mail was logged to them from the Inbox', async () => {
    const t = tables();
    t.leadActivities = [
      {
        leadId: 'lead-a',
        tenantId: 't1',
        type: 'EMAIL',
        title: 'Question',
        timestamp: day(12),
        metadata: { emailRecordId: 'rec-1', source: 'log-to-contact' },
      } as never,
    ];
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
        ccEmails: null,
        sentAt: null,
        createdAt: day(12),
      } as never,
    ];
    const items = await loadWaiting(fakeDb(t), 't1', { tenantId: 't1' }, { tenantId: 't1' });
    expect(items.map((i) => i.id)).toEqual(['lead-a']);
  });
});

describe('cap boundary: every source is judged on the same history', () => {
  const scope = { tenantId: 't1' };
  const contactScope = { tenantId: 't1', id: { in: [] } };
  const at = (d: number) => day(d);
  const rec = (id: string, d: number, to: string) =>
    ({
      id,
      tenantId: 't1',
      subject: id,
      status: 'SENT',
      metadata: null,
      userId: 'u1',
      contactId: null,
      fromEmail: 'me@example.invalid',
      toEmail: to,
      ccEmails: null,
      bccEmails: null,
      sentAt: at(d),
      createdAt: at(d),
    }) as never;
  const inbound = (d: number) =>
    ({
      leadId: 'lead-a',
      tenantId: 't1',
      type: 'EMAIL',
      title: 'Question',
      timestamp: at(d),
      metadata: { direction: 'inbound' },
    }) as never;
  const setup = (emails: unknown[], activities: unknown[]) => {
    const t = tables();
    t.leads = [leadRow('lead-a', 't1')];
    t.contacts = [];
    t.contactActivities = [];
    t.leadActivities = activities as never;
    t.emails = emails as never;
    return fakeDb(t);
  };

  it('does not list a person whose reply was pushed out of the capped records', async () => {
    // lead-a wrote on day 10 and was answered on day 11 by a record. Three newer unrelated records
    // fill a cap of 3, so the reply is not read; the inbound activity (one row, not capped) is.
    const db = setup(
      [
        rec('reply', 11, 'lead-a@example.invalid'),
        rec('n1', 12, 'x@example.invalid'),
        rec('n2', 13, 'x@example.invalid'),
        rec('n3', 14, 'x@example.invalid'),
      ],
      [inbound(10)]
    );
    const items = await loadWaiting(db, 't1', scope, contactScope, 3);
    expect(items.map((i) => i.id)).toEqual([]);
  });

  it('still lists a person who wrote inside the window and has no reply', async () => {
    const db = setup(
      [
        rec('n1', 12, 'x@example.invalid'),
        rec('n2', 13, 'x@example.invalid'),
        rec('n3', 14, 'x@example.invalid'),
        rec('old', 5, 'x@example.invalid'),
      ],
      [inbound(15)]
    );
    const items = await loadWaiting(db, 't1', scope, contactScope, 3);
    expect(items.map((i) => i.id)).toEqual(['lead-a']);
  });

  it('with the cap not reached, the same history lists them as before', async () => {
    const db = setup([rec('n1', 12, 'x@example.invalid')], [inbound(10)]);
    const items = await loadWaiting(db, 't1', scope, contactScope, 3);
    expect(items.map((i) => i.id)).toEqual(['lead-a']);
  });

  it('cuts to the shortest window when several sources are capped', () => {
    const d = (n: number) => day(n);
    expect(coverageFloor([{ times: [d(14), d(13), d(12)] }, { times: [d(14), d(9)] }], 3)).toBe(
      d(12).getTime()
    );
    expect(
      coverageFloor([{ times: [d(14), d(9), d(8)] }, { times: [d(14), d(11), d(10)] }], 3)
    ).toBe(d(10).getTime());
    expect(coverageFloor([{ times: [d(14), d(9)] }], 3)).toBe(-Infinity);
  });
});

describe('one clock for records: sentAt, else createdAt', () => {
  const scope = { tenantId: 't1' };
  const contactScope = { tenantId: 't1', id: { in: [] } };
  const rec = (id: string, over: Record<string, unknown>, sent: number | null, created: number) =>
    ({
      id,
      tenantId: 't1',
      subject: id,
      status: 'SENT',
      metadata: null,
      userId: 'u1',
      contactId: null,
      fromEmail: 'me@example.invalid',
      toEmail: 'x@example.invalid',
      ccEmails: null,
      bccEmails: null,
      sentAt: sent === null ? null : day(sent),
      createdAt: day(created),
      ...over,
    }) as never;
  const inboundRec = (id: string, sent: number | null, created: number) =>
    rec(
      id,
      {
        status: 'DELIVERED',
        userId: null,
        metadata: { direction: 'inbound' },
        fromEmail: 'lead-a@example.invalid',
        toEmail: 'me@example.invalid',
      },
      sent,
      created
    );
  const db = (emails: unknown[]) => {
    const t = tables();
    t.leads = [leadRow('lead-a', 't1')];
    t.contacts = [];
    t.leadActivities = [];
    t.contactActivities = [];
    t.emails = emails as never;
    return fakeDb(t);
  };

  it('does not list someone whose reply was cut by the cap when createdAt and sentAt disagree', async () => {
    // The inbound was sent on day 9 but stored on day 15; the reply was sent and stored on day 10.
    // Three unrelated records sent on days 11 to 13 fill a cap of 3, so both the reply (10) and the
    // inbound (9) are older than anything read: the person must not be listed.
    const items = await loadWaiting(
      db([
        inboundRec('in', 9, 15),
        rec('reply', { toEmail: 'lead-a@example.invalid' }, 10, 10),
        rec('n1', {}, 11, 11),
        rec('n2', {}, 12, 12),
        rec('n3', {}, 13, 13),
      ]),
      't1',
      scope,
      contactScope,
      3
    );
    expect(items.map((i) => i.id)).toEqual([]);
  });

  it('judges a received mail by when it arrived, not when it was stored', async () => {
    // Stored on day 15 but sent on day 9, with the reply on day 10: answered, uncapped.
    const items = await loadWaiting(
      db([inboundRec('in', 9, 15), rec('reply', { toEmail: 'lead-a@example.invalid' }, 10, 10)]),
      't1',
      scope,
      contactScope
    );
    expect(items.map((i) => i.id)).toEqual([]);
  });

  it('reads mail with no sentAt by createdAt, in its own capped stream', async () => {
    // Webhook mail has no sentAt. Its stream is ordered by createdAt and capped on its own, so the
    // newer sent records cannot push it out of the window.
    const items = await loadWaiting(
      db([
        inboundRec('webhook', null, 14),
        rec('n1', {}, 11, 11),
        rec('n2', {}, 12, 12),
        rec('n3', {}, 13, 13),
      ]),
      't1',
      scope,
      contactScope,
      3
    );
    expect(items.map((i) => i.id)).toEqual(['lead-a']);
  });
});

describe('message identity', () => {
  it('counts two different mails with the same timestamp as two', () => {
    const [item] = pickWaiting(
      [jane],
      [
        { ...mail(jane, 'inbound', day(10), 'First'), ref: 'r1' },
        { ...mail(jane, 'inbound', day(10), 'Second'), ref: 'r2' },
      ]
    );
    expect(item?.unanswered).toBe(2);
  });

  it('counts the same mail read as an activity and as a record once, even at different times', () => {
    const [item] = pickWaiting(
      [jane],
      [
        { ...mail(jane, 'inbound', day(10, 9), 'Hi'), ref: 'r1' },
        { ...mail(jane, 'inbound', day(10, 10), 'Hi'), ref: 'r1' },
      ]
    );
    expect(item?.unanswered).toBe(1);
  });

  it('without a record, equal time and subject still count once', () => {
    const [item] = pickWaiting(
      [jane],
      [mail(jane, 'inbound', day(10), 'Hi'), mail(jane, 'inbound', day(10), 'Hi')]
    );
    expect(item?.unanswered).toBe(1);
  });
});

describe('activities that mirror records, tenants and owners', () => {
  const scope = { tenantId: 't1' };
  const none = { tenantId: 't1', id: { in: [] } };
  const act = (leadId: string, tenantId: string, d: number, metadata: unknown, title = 'Mail') =>
    ({ leadId, tenantId, type: 'EMAIL', title, timestamp: day(d), metadata }) as never;
  const rec = (over: Record<string, unknown>) =>
    ({
      id: 'rec-1',
      tenantId: 't1',
      subject: 'Mail',
      status: 'SENT',
      metadata: null,
      userId: 'u1',
      contactId: null,
      fromEmail: 'me@example.invalid',
      toEmail: 'lead-a@example.invalid',
      ccEmails: null,
      bccEmails: null,
      sentAt: day(11),
      createdAt: day(11),
      ...over,
    }) as never;
  const world = (acts: unknown[], emails: unknown[]) => {
    const t = tables();
    t.leads = [leadRow('lead-a', 't1')];
    t.contacts = [];
    t.contactActivities = [];
    t.leadActivities = acts as never;
    t.emails = emails as never;
    return fakeDb(t);
  };

  it('reads an activity that mirrors a record at the record time, not its own', async () => {
    // Inbound mail received on day 10, answered on day 11. The activity that mirrors the inbound
    // was written later (day 12): it must not look like a fresh unanswered mail.
    const db = world(
      [act('lead-a', 't1', 12, { direction: 'inbound', emailRecordId: 'in-1' })],
      [
        rec({
          id: 'in-1',
          status: 'DELIVERED',
          userId: null,
          metadata: { direction: 'inbound' },
          fromEmail: 'lead-a@example.invalid',
          toEmail: 'me@example.invalid',
          sentAt: day(10),
          createdAt: day(10),
        }),
        rec({ id: 'reply', sentAt: day(11), createdAt: day(11) }),
      ]
    );
    expect((await loadWaiting(db, 't1', scope, none)).map((i) => i.id)).toEqual([]);
  });

  it('links a person whose address differs from the mail when it was logged to them', async () => {
    // Mail from alice@ was logged to lead-a (bob@ would not match by address).
    const db = world(
      [act('lead-a', 't1', 12, { emailRecordId: 'in-2', source: 'log-to-contact' })],
      [
        rec({
          id: 'in-2',
          status: 'DELIVERED',
          userId: null,
          metadata: { direction: 'inbound' },
          fromEmail: 'alice@elsewhere.example.invalid',
          toEmail: 'me@example.invalid',
          sentAt: day(10),
          createdAt: day(10),
        }),
      ]
    );
    expect((await loadWaiting(db, 't1', scope, none)).map((i) => i.id)).toEqual(['lead-a']);
  });

  it('never lets another tenant answer or open a wait', async () => {
    // A t2 reply to the same address, and a t2 activity for the same lead id, change nothing.
    const db = world(
      [
        act('lead-a', 't1', 10, { direction: 'inbound' }),
        act('lead-a', 't2', 12, { direction: 'outbound' }),
      ],
      [rec({ id: 'other-tenant', tenantId: 't2' })]
    );
    expect((await loadWaiting(db, 't1', scope, none)).map((i) => i.id)).toEqual(['lead-a']);
    const quiet = world([act('lead-a', 't2', 10, { direction: 'inbound' })], []);
    expect(await loadWaiting(quiet, 't1', scope, none)).toEqual([]);
  });

  it('applies the owner scope to contacts as well as leads', async () => {
    const t = tables();
    t.leads = [];
    t.leadActivities = [];
    t.emails = [];
    t.contacts = [{ ...leadRow('contact-a', 't1', 'u2'), firstName: 'Con', lastName: 'Tact' }];
    t.contactActivities = [
      {
        contactId: 'contact-a',
        tenantId: 't1',
        type: 'EMAIL',
        title: 'Hi',
        timestamp: day(10),
        metadata: { direction: 'inbound' },
      } as never,
    ];
    const db = fakeDb(t);
    const mine = await loadWaiting(db, 't1', scope, { tenantId: 't1', ownerId: 'u1' });
    expect(mine).toEqual([]);
    const theirs = await loadWaiting(db, 't1', scope, { tenantId: 't1', ownerId: 'u2' });
    expect(theirs.map((i) => i.id)).toEqual(['contact-a']);
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

  it('decides a lead the way the card does when a contact shares their email', async () => {
    const t = tables();
    t.emails = [];
    t.contactActivities = [];
    t.leads = [leadRow('lead-a', 't1')];
    t.contacts = [{ ...leadRow('contact-a', 't1'), email: 'lead-a@example.invalid' }];
    t.leadActivities = [
      {
        leadId: 'lead-a',
        tenantId: 't1',
        type: 'EMAIL',
        title: 'Q',
        timestamp: day(10),
        metadata: { direction: 'inbound' },
      } as never,
    ];
    const db = fakeDb(t);
    // Answered through the contact: neither the card nor the filter lists the lead.
    t.contactActivities.splice(
      0,
      9,
      ...[
        {
          contactId: 'contact-a',
          tenantId: 't1',
          type: 'EMAIL',
          title: 'A',
          timestamp: day(11),
          metadata: { direction: 'outbound' },
        } as never,
      ]
    );
    expect(await narrowToWaiting(ctx(db), { waitingForReply: true })).toEqual([]);
    expect(await loadWaiting(db, 't1', { tenantId: 't1' }, { tenantId: 't1' })).toEqual([]);
    // Unanswered after a later mail to the contact: both list the lead, once.
    t.contactActivities.splice(
      0,
      9,
      ...[
        {
          contactId: 'contact-a',
          tenantId: 't1',
          type: 'EMAIL',
          title: 'A',
          timestamp: day(9),
          metadata: { direction: 'outbound' },
        } as never,
      ]
    );
    const card = await loadWaiting(db, 't1', { tenantId: 't1' }, { tenantId: 't1' });
    expect(await narrowToWaiting(ctx(db), { waitingForReply: true })).toEqual(['lead-a']);
    expect(card.map((i) => i.id)).toEqual(['lead-a']);
  });
  it('stays inside ids when both are given, and is empty when nobody is waiting', async () => {
    const t = tables();
    t.emails = [];
    expect(
      await narrowToWaiting(ctx(fakeDb(t)), { waitingForReply: true, ids: ['lead-b'] })
    ).toEqual([]);
  });
});
