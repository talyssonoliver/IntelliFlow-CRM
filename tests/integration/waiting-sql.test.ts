/**
 * MVP-014 "Who is waiting" computed in SQL (waiting-sql.ts) against the original algorithm
 * (loadWaiting: every mail row and activity read into Node, decided by pickWaiting), on a real
 * Postgres. Both run over the same seeded tenant, for an admin, a manager and a plain rep, and
 * must return the same people in the same order with the same `since`, `subject`, `unanswered`
 * and totals. A second block proves the rows that leave the database follow the list shown, not
 * the mail volume. Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { mailViewerOf, type MailViewer } from '../../packages/db/src/email-visibility';
import { measureResult } from '../../packages/db/src/egress-meter';
import { createTenantWhereClause } from '../../apps/api/src/security/tenant-context';
import { loadWaiting } from '../../apps/api/src/modules/waiting/waiting-load';
import {
  loadWaitingLeadIds,
  loadWaitingPage,
  waitingSql,
} from '../../apps/api/src/modules/waiting/waiting-sql';
import { narrowToWaiting } from '../../apps/api/src/modules/waiting/waiting-lead-filter';
import {
  buildLeadListWhere,
  leadListOrderBy,
} from '../../apps/api/src/modules/lead/lead-list-query';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.log('Skipping waiting-sql integration test: DATABASE_URL not set');

const RUN = `waitsql_${randomUUID().slice(0, 8)}`;
const day = (d: number, h = 9) => new Date(Date.UTC(2026, 9, d, h));

/** Counts the rows every read of the client returns: what the database sends to Node. */
function metered(db: PrismaClient) {
  const stat = { rows: 0, calls: 0 };
  const count = (v: unknown) => {
    stat.calls += 1;
    stat.rows += measureResult(v).rows;
    return v;
  };
  const model = (m: Record<string, unknown>) =>
    new Proxy(m, {
      get(t, k) {
        const f = t[k as string];
        if (k !== 'findMany' || typeof f !== 'function') return f;
        return async (...a: unknown[]) =>
          count(await (f as (...x: unknown[]) => unknown).apply(t, a));
      },
    });
  const proxy = new Proxy(db as unknown as Record<string, unknown>, {
    get(t, k) {
      const v = t[k as string];
      if (k === '$transaction' && typeof v === 'function') {
        return (fn: (tx: unknown) => unknown) =>
          (v as (f: (tx: unknown) => unknown) => unknown).call(t, (tx: unknown) =>
            fn(
              new Proxy(tx as Record<string, unknown>, {
                get(tt, kk) {
                  const f = tt[kk as string];
                  if (kk !== '$queryRaw' || typeof f !== 'function') {
                    return typeof f === 'function'
                      ? (f as (...x: unknown[]) => unknown).bind(tt)
                      : f;
                  }
                  return async (...a: unknown[]) =>
                    count(await (f as (...x: unknown[]) => unknown).apply(tt, a));
                },
              })
            )
          );
      }
      if (k === '$queryRaw' && typeof v === 'function') {
        return async (...a: unknown[]) =>
          count(await (v as (...x: unknown[]) => unknown).apply(t, a));
      }
      if (typeof k === 'string' && v && typeof v === 'object' && 'findMany' in (v as object)) {
        return model(v as Record<string, unknown>);
      }
      return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
    },
  });
  return { db: proxy as unknown as PrismaClient, stat };
}

describeDb('waiting list in SQL equals the original algorithm', () => {
  const tenantId = `${RUN}_t`;
  const otherTenantId = `${RUN}_o`;
  const [admin, mgr, rep, other] = ['adm', 'mgr', 'rep', 'oth'].map((k) => `${RUN}_u${k}`);
  const em = (name: string) => `${name}.${RUN}@customer.example.invalid`;
  let prisma: PrismaClient;
  let seq = 0;

  const lead = (key: string, ownerId = rep, over: Record<string, unknown> = {}) =>
    prisma.lead.create({
      data: {
        id: `${RUN}_${key}`,
        tenantId,
        ownerId,
        email: em(key),
        firstName: key,
        lastName: 'Lead',
        ...over,
      },
    });
  const contact = (key: string, ownerId = rep, over: Record<string, unknown> = {}) =>
    prisma.contact.create({
      data: {
        id: `${RUN}_${key}`,
        tenantId,
        ownerId,
        email: em(key),
        firstName: key,
        lastName: 'Contact',
        ...over,
      },
    });
  /** An email_records row. `in` = webhook inbound (DELIVERED, no sender); `out` = sent from the CRM. */
  const record = (
    key: string,
    at: Date,
    over: Record<string, unknown> = {},
    metadata: Record<string, unknown> | null = null
  ) =>
    prisma.emailRecord.create({
      data: {
        id: `${RUN}_r${key}_${seq++}`,
        tenantId,
        subject: `subject ${key}`,
        body: 'b',
        fromEmail: 'me@company.example.invalid',
        toEmail: 'me@company.example.invalid',
        status: 'DELIVERED',
        sentAt: at,
        createdAt: at,
        metadata: metadata ?? undefined,
        ...over,
      },
    });
  const inbound = (key: string, from: string, at: Date, over: Record<string, unknown> = {}) =>
    record(key, at, { fromEmail: from, ...over });
  const outbound = (key: string, to: string, at: Date, over: Record<string, unknown> = {}) =>
    record(key, at, { status: 'SENT', userId: admin, toEmail: to, ...over });
  const leadAct = (
    key: string,
    leadKey: string,
    at: Date,
    title: string,
    metadata: Record<string, unknown> | null
  ) =>
    prisma.leadActivity.create({
      data: {
        tenantId,
        leadId: `${RUN}_${leadKey}`,
        type: 'EMAIL',
        title,
        userName: 'Tester',
        timestamp: at,
        metadata: metadata ?? undefined,
      },
    });
  const contactAct = (
    contactKey: string,
    at: Date,
    title: string,
    metadata: Record<string, unknown> | null
  ) =>
    prisma.contactActivity.create({
      data: {
        tenantId,
        contactId: `${RUN}_${contactKey}`,
        type: 'EMAIL',
        title,
        description: 'd',
        userName: 'Tester',
        timestamp: at,
        metadata: metadata ?? undefined,
      },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    for (const id of [tenantId, otherTenantId]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    for (const id of [admin, mgr, rep, other]) {
      await prisma.user.create({ data: { id, tenantId, email: `${id}@example.invalid` } });
    }
    await prisma.emailMailbox.create({
      data: {
        id: `${RUN}_mb_rep`,
        tenantId,
        scope: 'USER',
        userId: rep,
        kind: 'SMTP',
        status: 'DISCONNECTED',
        fromAddress: `rep.${RUN}@example.invalid`,
      },
    });
    await prisma.emailMailbox.create({
      data: {
        id: `${RUN}_mb_co`,
        tenantId,
        scope: 'TENANT',
        userId: null,
        kind: 'SMTP',
        status: 'DISCONNECTED',
        fromAddress: `co.${RUN}@example.invalid`,
      },
    });

    // 1. Plain inbound, no reply: waiting.
    await lead('plain');
    await inbound('plain', em('plain'), day(10));
    // 2. Answered by a later send: not waiting. 3. Reply BEFORE the inbound: waiting.
    await lead('answered');
    await inbound('answered', em('answered'), day(10));
    await outbound('answered', em('answered'), day(11));
    await lead('replyFirst');
    await outbound('replyFirst', em('replyFirst'), day(9));
    await inbound('replyFirst', em('replyFirst'), day(10));
    // 4. Two unanswered after our last reply: since = the first, unanswered = 2.
    await lead('twice');
    await outbound('twice', em('twice'), day(8));
    await inbound('twice1', em('twice'), day(10));
    await inbound('twice2', em('twice'), day(12));
    // 5. One mail seen as an activity AND a record (same ref): counted once.
    await lead('both');
    const bothRec = await inbound('both', em('both'), day(10, 12));
    await leadAct('both', 'both', day(10, 12), 'subject both', {
      direction: 'inbound',
      emailRecordId: bothRec.id,
    });
    // 6. Reply bounced for their address / partly bounced: still waiting. A reply to a second
    //    address of theirs, bounced only for someone else: answered.
    await lead('bounced');
    await inbound('bounced', em('bounced'), day(10));
    await outbound('bounced', `${em('bounced')}, x@y.example.invalid`, day(11), {
      metadata: { bouncedRecipients: [em('bounced').toUpperCase()] },
    });
    await lead('hardBounced');
    await inbound('hardBounced', em('hardBounced'), day(10));
    await outbound('hardBounced', em('hardBounced'), day(11), {
      metadata: { hardBouncedRecipients: [`<${em('hardBounced')}>`] },
    });
    await lead('rejected');
    await inbound('rejected', em('rejected'), day(10));
    await outbound('rejected', em('rejected'), day(11), {
      metadata: { rejectedRecipients: [em('rejected')] },
    });
    await lead('bouncedOther');
    await inbound('bouncedOther', em('bouncedOther'), day(10));
    await outbound('bouncedOther', `${em('bouncedOther')}, z@y.example.invalid`, day(11), {
      metadata: { bouncedRecipients: ['z@y.example.invalid'] },
    });
    // 7. A reply that never left (FAILED, PENDING, BOUNCED) does not count; a tagged outbound
    //    on a FAILED record does not either.
    for (const status of ['FAILED', 'PENDING', 'BOUNCED'] as const) {
      await lead(`never${status}`);
      await inbound(`never${status}`, em(`never${status}`), day(10));
      await outbound(`never${status}`, em(`never${status}`), day(11), {
        status,
        metadata: { direction: 'outbound' },
      });
    }
    // 8. Cc and Bcc count as reaching them; display-name addresses and separators parse.
    await lead('cc');
    await inbound('cc', em('cc'), day(10));
    await outbound('cc', 'someone@y.example.invalid', day(11), { ccEmails: `Boss <${em('cc')}>` });
    await lead('bcc');
    await inbound('bcc', em('bcc'), day(10));
    await outbound('bcc', 'someone@y.example.invalid', day(11), {
      bccEmails: em('bcc').toUpperCase(),
    });
    await lead('semi');
    await inbound('semi', `"Semi Name" <${em('semi').toUpperCase()}>`, day(10));
    await outbound('semi', `a@y.example.invalid;${em('semi')}`, day(9));
    // 9. Activities without a direction: "Reply received" is inbound, any other EMAIL is outbound.
    await lead('titled');
    await leadAct('titled', 'titled', day(10), 'Reply received: quote', null);
    await lead('titledAnswered');
    await leadAct('titledA1', 'titledAnswered', day(10), '  reply RECEIVED re: x', null);
    await leadAct('titledA2', 'titledAnswered', day(11), 'Sent a quote', null);
    await lead('receivedNotWord');
    await leadAct('rnw', 'receivedNotWord', day(10), 'Reply receivedX', null);
    // 10. Lead and contact with one address (different case) are one person, listed as the lead;
    //     a reply logged against the contact answers the lead's mail.
    await lead('twin');
    await contact('twinC', rep, { email: em('twin').toUpperCase() });
    await inbound('twin', em('twin'), day(10));
    await lead('twinAnswered');
    await contact('twinAnsweredC', rep, { email: em('twinAnswered') });
    await inbound('twinAnswered', em('twinAnswered'), day(10));
    await contactAct('twinAnsweredC', day(11), 'We replied', { direction: 'outbound' });
    // 11. A contact on its own is listed as a contact; a contact linked by contactId answers.
    await contact('solo');
    await inbound('solo', em('solo'), day(9));
    await contact('linked');
    await inbound('linked', em('linked'), day(9));
    await outbound('linked', 'nobody@y.example.invalid', day(10), { contactId: `${RUN}_linked` });
    await contact('linkedBounced');
    await inbound('linkedBounced', em('linkedBounced'), day(9));
    await outbound('linkedBounced', 'nobody@y.example.invalid', day(10), {
      contactId: `${RUN}_linkedBounced`,
      metadata: { bouncedRecipients: [em('linkedBounced')] },
    });
    // 12. A lead archived as an automated sender is nobody's wait.
    await lead('robot', rep, { status: 'LOST', tags: ['automated-sender'] });
    await inbound('robot', em('robot'), day(10));
    await lead('lostHuman', rep, { status: 'LOST', tags: ['other'] });
    await inbound('lostHuman', em('lostHuman'), day(10));
    // 13. Personal mail (register #64): the rep's own mailbox. A customer mail there is private
    //     to the rep; a reply sent from it is invisible (and so answers nothing) for others.
    await lead('priv', other);
    await inbound('priv', em('priv'), day(10), { mailboxId: `${RUN}_mb_rep` });
    await lead('privReply', other);
    await inbound('privReply', em('privReply'), day(10));
    await outbound('privReply', em('privReply'), day(11), {
      mailboxId: `${RUN}_mb_rep`,
      userId: rep,
    });
    await lead('privLogged', other);
    await inbound('privLogged', em('privLogged'), day(10));
    await outbound('privLogged', em('privLogged'), day(11), {
      mailboxId: `${RUN}_mb_rep`,
      userId: rep,
      metadata: { leadId: `${RUN}_privLogged` },
    });
    await lead('coMailbox');
    await inbound('coMailbox', em('coMailbox'), day(10), { mailboxId: `${RUN}_mb_co` });
    await lead('draft');
    await inbound('draft', em('draft'), day(10));
    await outbound('draft', em('draft'), day(11), {
      userId: rep,
      status: 'SENT',
      metadata: { isDraft: true },
    });
    // 14. Another tenant's mail to the same address never leaks in.
    await lead('leak');
    await inbound('leak', em('leak'), day(10));
    await prisma.emailRecord.create({
      data: {
        tenantId: otherTenantId,
        subject: 'foreign reply',
        body: 'b',
        fromEmail: 'me@company.example.invalid',
        toEmail: em('leak'),
        status: 'SENT',
        userId: admin,
        sentAt: day(11),
      },
    });
    // 15. An activity that only logs a record (no direction of its own): the record decides;
    //     one whose record is not readable is dropped; an outbound one whose record never left
    //     is not a reply.
    await lead('logIn');
    const logInRec = await inbound('logIn', 'unrelated@y.example.invalid', day(10));
    await leadAct('logIn', 'logIn', day(20), 'logged inbound', { emailRecordId: logInRec.id });
    await lead('logOut');
    const logOutIn = await inbound('logOutIn', em('logOut'), day(10));
    expect(logOutIn.id).toBeTruthy();
    const logOutRec = await outbound('logOut', 'unrelated@y.example.invalid', day(11));
    await leadAct('logOut', 'logOut', day(21), 'logged reply', { emailRecordId: logOutRec.id });
    await lead('logMissing');
    await inbound('logMissing', em('logMissing'), day(10));
    await leadAct('logMissing', 'logMissing', day(21), 'logged ghost', {
      emailRecordId: 'no-such',
    });
    await lead('logUnsent');
    await inbound('logUnsent', em('logUnsent'), day(10));
    const unsent = await outbound('logUnsent', 'x@y.example.invalid', day(11), {
      status: 'FAILED',
    });
    await leadAct('logUnsent', 'logUnsent', day(12), 'tagged outbound on failed', {
      direction: 'outbound',
      emailRecordId: unsent.id,
    });
    await lead('logBounced');
    await inbound('logBounced', em('logBounced'), day(10));
    const bouncedRec = await outbound('logBounced', em('logBounced'), day(11), {
      metadata: { bouncedRecipients: [em('logBounced')] },
    });
    await leadAct('logBounced', 'logBounced', day(12), 'tagged outbound bounced', {
      direction: 'outbound',
      emailRecordId: bouncedRec.id,
    });
    await lead('tagInboundNoRec');
    await leadAct('tagIn', 'tagInboundNoRec', day(10), 'x', {
      direction: 'inbound',
      emailRecordId: 'gone',
    });
    // 16. Stored directions beat the status rule: a stored inbound on a SENT row is inbound; a
    //     DELIVERED row with a sender is outbound; an explicit outbound on DELIVERED-no-user too.
    await lead('storedIn');
    await record(
      'storedIn',
      day(10),
      { status: 'SENT', fromEmail: em('storedIn'), userId: admin },
      {
        direction: 'inbound',
      }
    );
    await lead('deliveredWithUser');
    await inbound('dwu', em('deliveredWithUser'), day(9));
    await record('dwu2', day(10), { toEmail: em('deliveredWithUser'), userId: admin });
    await lead('storedOutDelivered');
    await inbound('sod', em('storedOutDelivered'), day(9));
    await record('sod2', day(10), { toEmail: em('storedOutDelivered') }, { direction: 'outbound' });
    // 17. A record with no sentAt is read at its createdAt.
    await lead('noSentAt');
    await inbound('noSentAt', em('noSentAt'), day(10), { sentAt: null });
    // 18. Scope: the rep's, the manager's team and nobody else's.
    await lead('mgrLead', mgr);
    await inbound('mgrLead', em('mgrLead'), day(10));
    await lead('otherLead', other);
    await inbound('otherLead', em('otherLead'), day(10));
    // 19. Subject and since come from the FIRST unanswered mail; a later one does not move them.
    await lead('order');
    await inbound('orderB', em('order'), day(12), { subject: 'second' });
    await inbound('orderA', em('order'), day(11), { subject: 'first' });
    // 20. "Handled without a reply" (MVP-012): a dismissal hides a person up to the newest inbound
    //     it saw. plain: dismissed at its newest mail (hidden). order: dismissed after its newest
    //     (hidden). twice: dismissed before its newest mail (re-surfaced). solo: a contact,
    //     dismissed by contact key (hidden). both: only ANOTHER tenant dismissed it (still shown).
    //     A dismissal under the wrong kind of key hides nobody.
    const dismissal = (tenant: string, key: string, latestAt: Date) =>
      prisma.waitingDismissal.create({
        data: { tenantId: tenant, personKey: key, since: day(1), unanswered: 1, latestAt },
      });
    await dismissal(tenantId, `lead:${RUN}_plain`, day(10));
    await dismissal(tenantId, `lead:${RUN}_order`, day(13));
    await dismissal(tenantId, `lead:${RUN}_twice`, day(10));
    await dismissal(tenantId, `contact:${RUN}_solo`, day(9));
    await dismissal(otherTenantId, `lead:${RUN}_both`, day(30));
    await dismissal(tenantId, `contact:${RUN}_mgrLead`, day(30));
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    for (const t of [tenantId, otherTenantId]) {
      await prisma.tenant.delete({ where: { id: t } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const viewers: Record<string, MailViewer> = {};
  const viewerFor = (name: string, userId: string, role: string, team?: string[]) => {
    viewers[name] = mailViewerOf({ tenantId, userId, role, teamMemberIds: team ?? null });
    return viewers[name]!;
  };

  const cases = (): [string, MailViewer][] => [
    ['admin', viewerFor('admin', admin, 'ADMIN')],
    ['manager', viewerFor('manager', mgr, 'MANAGER', [rep])],
    ['rep', viewerFor('rep', rep, 'USER')],
    ['other', viewerFor('other', other, 'USER')],
  ];

  const oracle = async (v: MailViewer) => {
    const scope = createTenantWhereClause({
      tenantId: v.tenantId,
      userId: v.userId,
      role: v.role ?? 'USER',
      teamMemberIds: v.teamMemberIds ? [...v.teamMemberIds] : [],
    } as never);
    return loadWaiting(prisma, v, scope as never, scope as never);
  };

  for (const name of ['admin', 'manager', 'rep', 'other']) {
    it(`${name}: same people, order, since, subject, unanswered and totals`, async () => {
      const v = cases().find(([n]) => n === name)![1];
      const old = await oracle(v);
      const page = await loadWaitingPage(prisma, v, {});
      expect(page.items).toEqual(old);
      expect(page.total).toBe(old.length);
      expect(page.leadTotal).toBe(old.filter((i) => i.kind === 'lead').length);
      expect(page.contactTotal).toBe(old.filter((i) => i.kind === 'contact').length);
      // The seed must be rich enough to mean something.
      expect(old.length).toBeGreaterThan(0);
    });

    it(`${name}: a limit returns the oldest of them with the totals of all`, async () => {
      const v = cases().find(([n]) => n === name)![1];
      const old = await oracle(v);
      for (const limit of [1, 3, 5, 100]) {
        const page = await loadWaitingPage(prisma, v, { limit });
        expect(page.items).toEqual(old.slice(0, limit));
        expect(page.total).toBe(old.length);
        expect(page.leadTotal).toBe(old.filter((i) => i.kind === 'lead').length);
        expect(page.contactTotal).toBe(old.filter((i) => i.kind === 'contact').length);
      }
    });
  }

  describe('leads-list "Waiting for reply" filter: SQL ids equal the original loader', () => {
    const tenantOf = (v: MailViewer) => ({
      tenantId: v.tenantId,
      userId: v.userId,
      role: v.role ?? 'USER',
      teamMemberIds: v.teamMemberIds ? [...v.teamMemberIds] : [],
    });
    const ctxOf = (db: PrismaClient, v: MailViewer) =>
      ({ prismaWithTenant: db, tenant: tenantOf(v) }) as never;
    /** What narrowToWaiting did before: every waiting lead the original loader finds. */
    const oldIds = async (v: MailViewer, ids?: string[]) => {
      const lead = (await oracle(v)).filter((w) => w.kind === 'lead').map((w) => w.id);
      const allowed = ids ? new Set(ids) : undefined;
      return allowed ? lead.filter((id) => allowed.has(id)) : lead;
    };

    for (const name of ['admin', 'manager', 'rep', 'other']) {
      it(`${name}: the same lead ids in the same order, with and without an ids restriction`, async () => {
        const v = cases().find(([n]) => n === name)![1];
        const old = await oldIds(v);
        expect(old.length).toBeGreaterThan(0); // the seed must mean something
        expect(await narrowToWaiting(ctxOf(prisma, v), { waitingForReply: true })).toEqual(old);
        expect(await loadWaitingLeadIds(prisma as never, v)).toEqual(old);
        // Within an ids restriction: some waiting, some not, one unknown.
        const some = [...old.slice(0, 3), `${RUN}_plain`, `${RUN}_answered`, 'no-such-lead'];
        expect(
          await narrowToWaiting(ctxOf(prisma, v), { waitingForReply: true, ids: some })
        ).toEqual(await oldIds(v, some));
        expect(await narrowToWaiting(ctxOf(prisma, v), { waitingForReply: true, ids: [] })).toEqual(
          []
        );
        // Off: untouched, no query.
        expect(await narrowToWaiting(ctxOf(prisma, v), { ids: some })).toEqual(some);
      });

      it(`${name}: the leads list pages and totals are exactly the same`, async () => {
        const v = cases().find(([n]) => n === name)![1];
        const scope = tenantOf(v) as never;
        const listWith = async (ids: string[], page: number, limit: number) => {
          const where = createTenantWhereClause(scope, buildLeadListWhere({ ids }));
          return {
            rows: await prisma.lead.findMany({
              where: where as never,
              skip: (page - 1) * limit,
              take: limit,
              orderBy: leadListOrderBy('createdAt', 'desc') as never,
              select: { id: true },
            }),
            total: await prisma.lead.count({ where: where as never }),
          };
        };
        const oldNarrow = await oldIds(v);
        const newNarrow = (await narrowToWaiting(ctxOf(prisma, v), {
          waitingForReply: true,
        })) as string[];
        for (const [page, limit] of [
          [1, 5],
          [2, 5],
          [3, 5],
          [1, 100],
        ] as const) {
          expect(await listWith(newNarrow, page, limit)).toEqual(
            await listWith(oldNarrow, page, limit)
          );
        }
      });
    }

    it('lists exactly the waiting leads the card lists (contacts left out), hand-checked', async () => {
      const v = cases()[0]![1];
      const ids = (await loadWaitingLeadIds(prisma as never, v)).map((i) =>
        i.replace(`${RUN}_`, '')
      );
      const card = (await loadWaitingPage(prisma, v, {})).items.filter((i) => i.kind === 'lead');
      expect(ids).toEqual(card.map((i) => i.id.replace(`${RUN}_`, '')));
      expect(ids).toContain('twice'); // re-surfaced after its dismissal
      expect(ids).toContain('both'); // another tenant's dismissal does not hide it
      expect(ids).toContain('twin'); // lead merged with a same-address contact
      expect(ids).not.toContain('plain'); // dismissed
      expect(ids).not.toContain('answered');
      expect(ids).not.toContain('robot'); // automated sender
      expect(ids).not.toContain('solo'); // a contact, never a lead id
    });

    it("keeps personal mail private: a colleague's filter ignores the rep's mailbox", async () => {
      const otherV = cases()[3]![1];
      const ids = await narrowToWaiting(ctxOf(prisma, otherV), { waitingForReply: true });
      expect(ids).not.toContain(`${RUN}_priv`);
      expect(ids).toContain(`${RUN}_privReply`);
      expect(ids).not.toContain(`${RUN}_privLogged`);
    });

    it('does not see another tenant', async () => {
      const foreign = mailViewerOf({
        tenantId: otherTenantId,
        userId: admin,
        role: 'ADMIN',
        teamMemberIds: null,
      });
      expect(await loadWaitingLeadIds(prisma as never, foreign)).toEqual([]);
    });

    it('under row level security gives the same ids as the owner role, tenant bound by itself', async () => {
      const v = cases()[0]![1];
      const asRole = {
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE "authenticated"`);
            return fn(tx);
          }),
      } as never;
      const ids = await loadWaitingLeadIds(asRole, v);
      expect(ids).toEqual(await oldIds(v));
      expect(ids.length).toBeGreaterThan(0);
    });

    it('row count: one query, one id per waiting lead, never the mail', async () => {
      const v = cases()[0]![1];
      const scope = createTenantWhereClause(tenantOf(v) as never);
      const before = metered(prisma);
      const old = (await loadWaiting(before.db, v, scope as never, scope as never)).filter(
        (w) => w.kind === 'lead'
      );
      expect(old.length).toBeGreaterThan(0);
      const after = metered(prisma);
      const ids = await narrowToWaiting(ctxOf(after.db, v), { waitingForReply: true });
      expect(after.stat.calls).toBe(1);
      expect(after.stat.rows).toBe(ids!.length);
      expect(after.stat.rows).toBe(old.length);
      const mails = await prisma.emailRecord.count({ where: { tenantId } });
      const acts =
        (await prisma.leadActivity.count({ where: { tenantId } })) +
        (await prisma.contactActivity.count({ where: { tenantId } }));
      // The old path read every mail row, activity row and person of the tenant.
      expect(before.stat.rows).toBeGreaterThanOrEqual(mails + acts);
      expect(after.stat.rows).toBeLessThan(before.stat.rows / 3);
    });
  });

  it('lists exactly the expected people for the admin (hand-checked, not just old == new)', async () => {
    const page = await loadWaitingPage(prisma, cases()[0]![1], {});
    const ids = page.items.map((i) => i.id.replace(`${RUN}_`, ''));
    const expected = [
      'replyFirst',
      'twice',
      'both',
      'bounced',
      'hardBounced',
      'rejected',
      'neverFAILED',
      'neverPENDING',
      'neverBOUNCED',
      'titled',
      'twin',
      'linkedBounced',
      'lostHuman',
      'privReply',
      'coMailbox',
      'draft',
      'leak',
      'logIn',
      'logMissing',
      'logUnsent',
      'logBounced',
      'tagInboundNoRec',
      'storedIn',
      'noSentAt',
      'mgrLead',
      'otherLead',
      'semi',
    ];
    // Not waiting: answered by a send, a Cc, a Bcc, a contact's reply, a contact link, a logged
    // reply, a reply on a logged personal mail, a stored outbound; an automated sender; a title
    // that only starts like "Reply received".
    const gone = [
      'plain',
      'order',
      'solo',
      'answered',
      'bouncedOther',
      'cc',
      'bcc',
      'titledAnswered',
      'receivedNotWord',
      'twinAnswered',
      'linked',
      'robot',
      'priv',
      'privLogged',
      'storedOutDelivered',
      'deliveredWithUser',
      'logOut',
    ];
    for (const g of gone) expect(ids, g).not.toContain(g);
    for (const want of expected) expect(ids, want).toContain(want);
    expect(ids).toHaveLength(expected.length);
    const by = (k: string) => page.items.find((i) => i.id === `${RUN}_${k}`)!;
    expect(by('twice').unanswered).toBe(2);
    expect(by('twice').since).toEqual(day(10));
    expect(by('both').unanswered).toBe(1);
    expect(by('twin').kind).toBe('lead');
  });

  it('honours dismissals: hidden up to the newest mail seen, back on newer mail, per tenant', async () => {
    const v = cases()[0]![1];
    const page = await loadWaitingPage(prisma, v, {});
    const ids = page.items.map((i) => i.id.replace(`${RUN}_`, ''));
    expect(ids).not.toContain('plain'); // dismissed at its newest inbound
    expect(ids).not.toContain('order'); // dismissed after its newest inbound
    expect(ids).not.toContain('solo'); // a contact, dismissed by contact key
    expect(ids).toContain('twice'); // dismissed before its newest inbound: re-surfaced
    expect(ids).toContain('both'); // only another tenant dismissed it
    expect(ids).toContain('mgrLead'); // a dismissal under the wrong kind hides nobody
    const twice = page.items.find((i) => i.id === `${RUN}_twice`)!;
    expect(twice.latestAt).toEqual(day(12));
    // Same as the loader, which reads the same table, with and without the dismissals.
    expect(page.items).toEqual(await oracle(v));
    await prisma.waitingDismissal.deleteMany({ where: { tenantId } });
    const without = await loadWaitingPage(prisma, v, {});
    expect(without.items.map((i) => i.id.replace(`${RUN}_`, ''))).toEqual(
      expect.arrayContaining(['plain', 'order', 'solo'])
    );
    expect(without.items).toEqual(await oracle(v));
    expect(without.total).toBe(page.total + 3);
    // The subject and `since` come from the FIRST unanswered mail; a later one does not move them.
    const order = without.items.find((i) => i.id === `${RUN}_order`)!;
    expect(order.subject).toBe('first');
    expect(order.since).toEqual(day(11));
    expect(order.latestAt).toEqual(day(12));
    expect(without.items.find((i) => i.id === `${RUN}_solo`)?.kind).toBe('contact');
  });

  it('personal mail stays private: the rep sees their own mailbox, a colleague does not', async () => {
    const [, , repV, otherV] = cases().map(([, v]) => v) as [
      MailViewer,
      MailViewer,
      MailViewer,
      MailViewer,
    ];
    expect(repV.userId).toBe(rep);
    // `priv` is owned by `other`; the inbound sits in the rep's own mailbox, so for `other` it is
    // invisible and the lead does not show; `privReply` is answered only by mail `other` cannot read.
    const forOther = (await loadWaitingPage(prisma, otherV, {})).items.map((i) => i.id);
    expect(forOther).not.toContain(`${RUN}_priv`);
    expect(forOther).toContain(`${RUN}_privReply`);
    expect(forOther).not.toContain(`${RUN}_privLogged`);
  });

  describe('under row level security', () => {
    // The app's database role can be subject to RLS: the policies compare "tenantId" with the
    // session's app.current_tenant_id. A raw statement skips the tenant client's per-model SET, so
    // the loader binds the tenant itself, inside its transaction.
    // Supabase's `authenticated` role: SELECT on these tables and no RLS bypass. No DDL here, so
    // this cannot collide with other test files creating roles or grants in parallel.
    const role = 'authenticated';
    /** The client, with every transaction running as the RLS role (the owner would bypass RLS). */
    const asRole = () =>
      ({
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
            return fn(tx);
          }),
      }) as never;

    it('returns the same list as the owner role, with no tenant set on the session', async () => {
      const v = cases()[0]![1];
      const page = await loadWaitingPage(asRole(), v, {});
      expect(page.items).toEqual(await oracle(v));
      expect(page.total).toBeGreaterThan(0);
    });

    it('is what makes it work: the bare statement sees nothing without the binding', async () => {
      const v = cases()[0]![1];
      const bare = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', 'other-tenant', true)`
        );
        return tx.$queryRaw<unknown[]>(waitingSql(v, {}));
      });
      expect(bare).toEqual([]);
    });

    it('binds only for its own transaction: nothing leaks to the next one', async () => {
      const v = cases()[0]![1];
      await loadWaitingPage(asRole(), v, {});
      const [{ t }] = await prisma.$queryRaw<{ t: string | null }[]>`
        SELECT current_setting('app.current_tenant_id', true) AS t`;
      expect(t === null || t === '' || t !== tenantId).toBe(true);
    });
  });

  describe('rows leaving the database follow the list shown, not the mail', () => {
    it('SQL returns one row per person shown; the old loader reads every mail and activity', async () => {
      const v = cases()[0]![1];
      const before = metered(prisma);
      const old = await loadWaiting(before.db, v, { tenantId } as never, { tenantId } as never);
      const after = metered(prisma);
      const limit = 5;
      const page = await loadWaitingPage(after.db as never, v, { limit });
      expect(page.items.length).toBe(limit);
      expect(after.stat.calls).toBe(1);
      expect(after.stat.rows).toBe(limit);
      // The old path read every mail row, activity row and person of the tenant.
      const mails = await prisma.emailRecord.count({ where: { tenantId } });
      const acts =
        (await prisma.leadActivity.count({ where: { tenantId } })) +
        (await prisma.contactActivity.count({ where: { tenantId } }));
      expect(before.stat.rows).toBeGreaterThanOrEqual(mails + acts);
      expect(after.stat.rows).toBeLessThan(before.stat.rows / 10);
      expect(old.length).toBeGreaterThan(limit);
    });

    it('stays at the page size when the mail volume grows tenfold', async () => {
      const v = cases()[0]![1];
      const limit = 5;
      const sizeOf = async () => {
        const m = metered(prisma);
        await loadWaitingPage(m.db as never, v, { limit });
        return m.stat.rows;
      };
      const small = await sizeOf();
      // 300 more mails to people who are already answered: more mail, the same list.
      await lead('bulk');
      await outbound('bulkOut', em('bulk'), day(25));
      const noise = Array.from({ length: 300 }, (_, i) => ({
        id: `${RUN}_noise${i}`,
        tenantId,
        subject: `noise ${i}`,
        body: 'b',
        fromEmail: em('bulk'),
        toEmail: 'me@company.example.invalid',
        status: 'DELIVERED' as const,
        sentAt: day(24, i % 24),
        createdAt: day(24, i % 24),
      }));
      await prisma.emailRecord.createMany({ data: noise });
      const big = await sizeOf();
      expect(small).toBe(limit);
      expect(big).toBe(small);
      // ...and the answer is still the old algorithm's.
      const old = await oracle(v);
      expect((await loadWaitingPage(prisma, v, {})).items).toEqual(old);
    });
  });
});
