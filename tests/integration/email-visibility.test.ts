/**
 * Register #64 (owner decision 26/11/2026): personal mail is private. Proved on a real Postgres.
 *
 *  - mail in a user's OWN mailbox is visible only to that user;
 *  - mail logged to a lead or contact stays visible to whoever can see that lead or contact;
 *  - the company mailbox (scope TENANT) stays team-visible;
 *  - drafts stay owner-only;
 *  - an administrator has NO override over a colleague's personal mail.
 *
 * Every read path that takes a mail row is asserted: the inbound router (get, list, thread,
 * unread counts, related messages, attachment, mark read, labels), "Log to contact", the lead's
 * open rate, and the unified activity feed. The Prisma form and the SQL form of the policy are
 * also asserted to select the same rows. Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../packages/db/generated/prisma/client';
import { emailVisibleSql } from '../../packages/db/src/email-visibility';
import { PrismaActivityFeedRepository } from '../../packages/adapters/src/repositories/PrismaActivityFeedRepository';
import { inboundEmailRouter } from '../../apps/api/src/modules/email/inbound.router';
import { emailLogRouter } from '../../apps/api/src/modules/email/email-log.router';
import { leadEmailEngagement } from '../../apps/api/src/modules/email/lead-email-engagement';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.log('Skipping email-visibility integration test: DATABASE_URL not set');

const RUN = `mailpriv_${randomUUID().slice(0, 8)}`;

describeDb('personal mail is private (register #64)', () => {
  const tenantId = `${RUN}_t`;
  const otherTenantId = `${RUN}_o`;
  const [alice, bob, admin, carol] = ['a', 'b', 'c', 'd'].map((k) => `${RUN}_u${k}`);
  const threadId = `thread-${RUN}`;
  const leadEmail = `lead.${RUN}@customer.example.invalid`;
  let prisma: PrismaClient;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    for (const id of [tenantId, otherTenantId]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    for (const id of [alice, bob, admin, carol]) {
      await prisma.user.create({ data: { id, tenantId, email: `${id}@example.invalid` } });
    }
    // Bob owns the lead and the contact the customer conversation is logged to; Alice's lead is
    // one Bob cannot see.
    const lead = (id: string, ownerId: string, email: string) =>
      prisma.lead.create({
        data: { id, tenantId, ownerId, email, firstName: 'L', lastName: id },
      });
    await lead(`${RUN}_lead_bob`, bob, leadEmail);
    await lead(`${RUN}_lead_alice`, alice, `alice.lead.${RUN}@customer.example.invalid`);
    await prisma.contact.create({
      data: {
        id: `${RUN}_contact_bob`,
        tenantId,
        ownerId: bob,
        email: `contact.${RUN}@customer.example.invalid`,
        firstName: 'C',
        lastName: 'Bob',
      },
    });
    const mailbox = (key: string, scope: 'USER' | 'TENANT', userId: string | null, from: string) =>
      prisma.emailMailbox.create({
        data: {
          id: `${RUN}_mb_${key}`,
          tenantId,
          scope,
          userId,
          kind: 'SMTP',
          status: 'DISCONNECTED',
          fromAddress: `${from}.${RUN}@example.invalid`,
        },
      });
    await mailbox('alice', 'USER', alice, 'alice');
    await mailbox('bob', 'USER', bob, 'bob');
    await mailbox('company', 'TENANT', null, 'company');

    const mail = async (
      key: string,
      over: Record<string, unknown>,
      metadata: Record<string, unknown> = {}
    ) => {
      const record = await prisma.emailRecord.create({
        data: {
          tenantId,
          subject: `subject ${key}`,
          body: `<p>body ${key}</p>`,
          fromEmail: 'customer@customer.example.invalid',
          toEmail: `alice.${RUN}@example.invalid`,
          status: 'DELIVERED',
          metadata: { threadId, ...metadata },
          ...over,
        },
      });
      ids[key] = record.id;
    };
    const inAlice = { mailboxId: `${RUN}_mb_alice` };
    await mail('alicePrivate', inAlice);
    await mail('loggedToBobLead', inAlice, { leadId: `${RUN}_lead_bob` });
    await mail('loggedToAliceLead', inAlice, { leadId: `${RUN}_lead_alice` });
    await mail('loggedToBobContact', { ...inAlice, contactId: `${RUN}_contact_bob` });
    await mail('company', { mailboxId: `${RUN}_mb_company` });
    await mail(
      'companyDraftOfAlice',
      { mailboxId: `${RUN}_mb_company`, userId: alice, status: 'PENDING' },
      { isDraft: true }
    );
    await mail('aliceDraft', { ...inAlice, userId: alice, status: 'PENDING' }, { isDraft: true });
    await mail('sharedInbound', {});
    await mail('aliceMailboxRemoved', {}, { mailboxOwnerId: alice });
    await mail('aliceSentNoMailbox', { userId: alice, status: 'SENT' });
    await mail('bobPrivate', { mailboxId: `${RUN}_mb_bob` });
    // Edge rows: a flag cleared on a personal mailbox's mail, a JSON null owner, no metadata at all.
    await mail('draftFalse', inAlice, { isDraft: false });
    await mail('jsonNullOwner', {}, { mailboxOwnerId: null });
    ids.nullMetadata = (
      await prisma.emailRecord.create({
        data: {
          tenantId,
          subject: 'subject nullMetadata',
          body: 'x',
          fromEmail: 'customer@customer.example.invalid',
          toEmail: 'team@example.invalid',
          status: 'DELIVERED',
          metadata: Prisma.DbNull,
        },
      })
    ).id;
    // The same shape in another tenant: never visible, whoever asks.
    await prisma.emailRecord.create({
      data: {
        tenantId: otherTenantId,
        subject: 'other tenant',
        body: 'x',
        fromEmail: 'x@example.invalid',
        toEmail: 'y@example.invalid',
        metadata: { threadId },
      },
    });
    await prisma.emailAttachment.create({
      data: {
        tenantId,
        emailId: ids.alicePrivate,
        fileName: 'private.pdf',
        fileSize: 10,
        fileType: 'application/pdf',
        fileUrl: 'https://files.example.invalid/private.pdf',
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    const tenants = { in: [tenantId, otherTenantId] };
    await prisma.emailAttachment.deleteMany({ where: { tenantId: tenants } });
    await prisma.emailRecord.deleteMany({ where: { tenantId: tenants } });
    await prisma.emailMailbox.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.$disconnect();
  });

  const ctxFor = (userId: string, role = 'SALES_REP') =>
    ({
      prisma,
      prismaWithTenant: prisma,
      tenant: { tenantId, tenantType: 'user', userId, role, canAccessAllTenantData: false },
      user: { userId, email: `${userId}@example.invalid`, role, tenantId, emailVerified: true },
      container: {},
      services: {},
      security: {},
      adapters: {},
    }) as never;
  const inbound = (userId: string, role?: string) =>
    inboundEmailRouter.createCaller(ctxFor(userId, role));

  /** Who may read what: the rule, spelled out once. */
  const expected: Record<string, string[]> = {
    // Alice's own mailbox: hers, plus what is logged to a lead or contact the reader can see.
    alicePrivate: [alice],
    loggedToBobLead: [alice, bob, admin],
    loggedToAliceLead: [alice, admin],
    loggedToBobContact: [alice, bob, admin],
    // The company mailbox and unowned inbound mail: the team.
    company: [alice, bob, admin, carol],
    sharedInbound: [alice, bob, admin, carol],
    // Drafts: the writer only, even in the company mailbox.
    companyDraftOfAlice: [alice],
    aliceDraft: [alice],
    // Mail whose mailbox was removed keeps its owner; the CRM-sent mail is its sender's.
    aliceMailboxRemoved: [alice],
    aliceSentNoMailbox: [alice],
    bobPrivate: [bob],
    draftFalse: [alice],
    jsonNullOwner: [alice, bob, admin, carol],
    nullMetadata: [alice, bob, admin, carol],
  };
  const readers = { alice, bob, admin, carol };
  const roleOf = (userId: string) => (userId === admin ? 'ADMIN' : 'SALES_REP');
  const visibleTo = (userId: string) =>
    Object.entries(expected)
      .filter(([, who]) => who.includes(userId))
      .map(([key]) => ids[key])
      .sort();

  it.each(Object.entries(readers))(
    'getEmail: %s reads exactly what the rule allows',
    async (_n, user) => {
      for (const [key, who] of Object.entries(expected)) {
        const got = await inbound(user, roleOf(user)).getEmail({ emailId: ids[key] });
        expect(got === null ? null : got.id, `${key} for ${_n}`).toEqual(
          who.includes(user) ? ids[key] : null
        );
      }
    }
  );

  it.each(Object.entries(readers))(
    'listEmails and its total: %s sees only readable mail',
    async (_n, user) => {
      const page = await inbound(user, roleOf(user)).listEmails({ limit: 100, offset: 0 });
      // The inbox view drops drafts; compare against the non-draft expectations.
      const drafts = new Set([ids.aliceDraft, ids.companyDraftOfAlice]);
      const want = visibleTo(user).filter((id) => !drafts.has(id));
      expect(page.emails.map((e) => e.id).sort()).toEqual(want);
      expect(page.total).toBe(want.length);
    }
  );

  it.each(Object.entries(readers))(
    'getThread: %s gets only readable messages of a thread',
    async (_n, user) => {
      const thread = await inbound(user, roleOf(user)).getThread({ threadId, limit: 50 });
      const drafts = new Set([ids.aliceDraft, ids.companyDraftOfAlice]);
      expect(thread.emails.map((e) => e.id).sort()).toEqual(
        visibleTo(user).filter((id) => !drafts.has(id) && id !== ids.nullMetadata)
      );
    }
  );

  it('getThread by a bare mail id (no thread) never opens a mail the caller cannot read', async () => {
    const got = await inbound(bob).getThread({ threadId: ids.alicePrivate, limit: 5 });
    expect(got.emails).toEqual([]);
    const own = await inbound(alice).getThread({ threadId: ids.alicePrivate, limit: 5 });
    expect(own.emails.length).toBeGreaterThan(0);
  });

  it('an administrator has no override over a colleague personal mailbox', async () => {
    const asAdmin = inbound(admin, 'ADMIN');
    expect(await asAdmin.getEmail({ emailId: ids.alicePrivate })).toBeNull();
    expect(await asAdmin.getEmail({ emailId: ids.aliceMailboxRemoved })).toBeNull();
    expect(await asAdmin.getEmail({ emailId: ids.aliceDraft })).toBeNull();
    // ... but reads what is logged to a lead or contact (an admin can see every lead).
    expect((await asAdmin.getEmail({ emailId: ids.loggedToAliceLead }))?.id).toBe(
      ids.loggedToAliceLead
    );
  });

  it('getUnreadCounts only counts readable mail', async () => {
    const counts = (user: string) =>
      inbound(user, roleOf(user)).getUnreadCounts({ folders: ['inbox'] });
    const drafts = new Set([ids.aliceDraft, ids.companyDraftOfAlice]);
    for (const [, user] of Object.entries(readers)) {
      const want = visibleTo(user).filter((id) => !drafts.has(id)).length;
      expect((await counts(user)).inbox).toBe(want);
    }
  });

  it('getRelatedMessages (the hover card) does not leak subjects of unreadable mail', async () => {
    const related = async (user: string) =>
      (
        await inbound(user, roleOf(user)).getRelatedMessages({
          email: 'customer@customer.example.invalid',
          limit: 5,
        })
      ).map((m) => m.id);
    const all = Object.values(ids);
    for (const user of [bob, carol, admin]) {
      const got = await related(user);
      expect(got.every((id) => visibleTo(user).includes(id))).toBe(true);
      expect(got).not.toContain(ids.alicePrivate);
    }
    expect((await related(alice)).every((id) => all.includes(id))).toBe(true);
  });

  it('getAttachment: the file of a mail the caller cannot read is not served', async () => {
    const [attachment] = await prisma.emailAttachment.findMany({
      where: { emailId: ids.alicePrivate },
    });
    const input = { emailId: ids.alicePrivate, attachmentId: attachment.id };
    expect(await inbound(bob).getAttachment(input)).toBeNull();
    expect(await inbound(admin, 'ADMIN').getAttachment(input)).toBeNull();
    expect((await inbound(alice).getAttachment(input))?.filename).toBe('private.pdf');
  });

  it('writes follow reads: a colleague cannot mark, label, archive or forward unreadable mail', async () => {
    await inbound(bob).markAsRead({ emailId: ids.alicePrivate });
    await inbound(bob).markAsRead({ emailId: ids.alicePrivate, threadId });
    const after = await prisma.emailRecord.findUniqueOrThrow({ where: { id: ids.alicePrivate } });
    expect(after.isRead).toBe(false);
    await expect(
      inbound(bob).setLabels({ emailId: ids.alicePrivate, labels: ['x'] })
    ).rejects.toThrow(/not found/i);
    await expect(
      inbound(admin, 'ADMIN').processEmail({ emailId: ids.alicePrivate, action: 'archive' })
    ).rejects.toThrow(/not found/i);
    await expect(
      inbound(admin, 'ADMIN').processEmail({ emailId: ids.alicePrivate, action: 'permanentDelete' })
    ).rejects.toThrow(/not found/i);
    expect(await prisma.emailRecord.count({ where: { id: ids.alicePrivate } })).toBe(1);
    // The owner still can.
    await inbound(alice).markAsRead({ emailId: ids.alicePrivate });
    expect(
      (await prisma.emailRecord.findUniqueOrThrow({ where: { id: ids.alicePrivate } })).isRead
    ).toBe(true);
  });

  it('Log to contact: nobody, an administrator included, opens or logs a colleague personal mail', async () => {
    const log = (user: string, role?: string) => emailLogRouter.createCaller(ctxFor(user, role));
    await expect(log(bob).status({ emailId: ids.alicePrivate })).rejects.toThrow(/not found/i);
    await expect(log(admin, 'ADMIN').status({ emailId: ids.alicePrivate })).rejects.toThrow(
      /not found/i
    );
    await expect(log(admin, 'ADMIN').logToContact({ emailId: ids.alicePrivate })).rejects.toThrow(
      /not found/i
    );
    expect((await log(alice).status({ emailId: ids.alicePrivate })).logged).toBe(false);
    // The company mailbox's mail is the team's: an administrator may read its link state.
    expect((await log(admin, 'ADMIN').status({ emailId: ids.company })).logged).toBe(false);
  });

  it('the lead open rate only counts mail the viewer may read', async () => {
    // Alice sent (tracked) to Bob's lead from her personal mailbox, and nobody logged it.
    await prisma.emailRecord.create({
      data: {
        tenantId,
        mailboxId: `${RUN}_mb_alice`,
        userId: alice,
        subject: 'tracked',
        body: 'x',
        fromEmail: `alice.${RUN}@example.invalid`,
        toEmail: leadEmail,
        status: 'OPENED',
        openCount: 1,
        metadata: {},
      },
    });
    const rate = (user: string, role?: string) =>
      leadEmailEngagement(prisma as never, { tenantId, userId: user, role }, leadEmail);
    expect(await rate(alice)).toEqual({ sent: 1, opened: 1 });
    expect(await rate(bob)).toEqual({ sent: 0, opened: 0 });
    expect(await rate(admin, 'ADMIN')).toEqual({ sent: 0, opened: 0 });
  });

  it('the activity feed reads email rows through the same rule, and fails closed with no viewer', async () => {
    const feed = new PrismaActivityFeedRepository(prisma as never);
    const emailIds = async (viewer?: { userId: string; role?: string }) =>
      (await feed.getUnifiedFeed(tenantId, 200, null, { sources: ['EMAIL'], viewer }))
        .map((i) => i.id.replace('email_', ''))
        .filter((id) => Object.values(ids).includes(id))
        .sort();
    for (const [, user] of Object.entries(readers)) {
      expect(await emailIds({ userId: user, role: roleOf(user) })).toEqual(visibleTo(user));
    }
    expect(await emailIds(undefined)).toEqual(
      [ids.company, ids.sharedInbound, ids.jsonNullOwner, ids.nullMetadata].sort()
    );
    // The unread counts in the feed's stats: the email count is the viewer's.
    const stats = async (user: string) =>
      (
        await feed.getStats(tenantId, null, new Date(Date.now() + 60_000), {
          sources: ['EMAIL'],
          viewer: { userId: user, role: roleOf(user) },
        })
      ).bySource.find((s) => s.source === 'EMAIL')?.count ?? 0;
    expect(await stats(bob)).toBeLessThan(await stats(alice));
  });

  it('mail logged to a lead can be read by the lead owner, never changed or forwarded', async () => {
    // Bob owns the lead it is logged to: he reads it ...
    expect((await inbound(bob).getEmail({ emailId: ids.loggedToBobLead }))?.id).toBe(
      ids.loggedToBobLead
    );
    // ... but it is Alice's mail: he cannot mark it, label it, move it, delete it or forward it.
    await inbound(bob).markAsRead({ emailId: ids.loggedToBobLead });
    const row = await prisma.emailRecord.findUniqueOrThrow({ where: { id: ids.loggedToBobLead } });
    expect(row.isRead).toBe(false);
    await expect(
      inbound(bob).setLabels({ emailId: ids.loggedToBobLead, labels: ['x'] })
    ).rejects.toThrow(/not found/i);
    for (const action of ['archive', 'delete', 'permanentDelete'] as const) {
      await expect(
        inbound(bob).processEmail({ emailId: ids.loggedToBobLead, action })
      ).rejects.toThrow(/not found/i);
    }
    await expect(
      inbound(bob).processEmail({
        emailId: ids.loggedToBobLead,
        action: 'forward',
        forwardTo: 'x@example.invalid',
      })
    ).rejects.toThrow(/not found/i);
    const log = emailLogRouter.createCaller(ctxFor(bob));
    expect((await log.status({ emailId: ids.loggedToBobLead })).logged).toBe(true);
    await expect(log.logToContact({ emailId: ids.loggedToBobLead })).rejects.toThrow(/not found/i);
  });

  it('the lead timeline entry of a logged mail follows the lead owner, in the feed and its counts', async () => {
    const entry = (leadId: string, title: string) =>
      prisma.leadActivity.create({
        data: {
          tenantId,
          leadId,
          type: 'EMAIL',
          title,
          userId: alice,
          userName: 'Alice',
          timestamp: new Date(),
        },
      });
    await entry(`${RUN}_lead_alice`, `secret subject ${RUN}`);
    await entry(`${RUN}_lead_bob`, `bobs subject ${RUN}`);
    const feed = new PrismaActivityFeedRepository(prisma as never);
    const titles = async (viewer?: { userId: string; role?: string }) =>
      (await feed.getUnifiedFeed(tenantId, 200, null, { sources: ['LEAD_ACTIVITY'], viewer }))
        .map((i) => i.title)
        .filter((t) => t.includes(RUN))
        .sort();
    expect(await titles({ userId: bob, role: 'SALES_REP' })).toEqual([`bobs subject ${RUN}`]);
    expect(await titles({ userId: admin, role: 'ADMIN' })).toHaveLength(2);
    expect(await titles(undefined)).toEqual([]);
    const searched = (
      await feed.searchFeed(tenantId, RUN, 50, null, {
        sources: ['LEAD_ACTIVITY'],
        viewer: { userId: bob, role: 'SALES_REP' },
      })
    ).map((i) => i.title);
    expect(searched).toEqual([`bobs subject ${RUN}`]);
    const count = async (viewer: { userId: string; role: string }) =>
      (
        await feed.getStats(tenantId, null, new Date(Date.now() + 60_000), {
          sources: ['LEAD_ACTIVITY'],
          viewer,
        })
      ).byType.find((t) => t.type === 'EMAIL')?.count ?? 0;
    expect(await count({ userId: admin, role: 'ADMIN' })).toBe(
      (await count({ userId: bob, role: 'SALES_REP' })) + 1
    );
  });

  it('reactions and comments on mail the caller cannot read are refused', async () => {
    const { activityFeedRouter } =
      await import('../../apps/api/src/modules/misc/activity-feed.router');
    const caller = (user: string) => activityFeedRouter.createCaller(ctxFor(user));
    const activityId = `email_${ids.alicePrivate}`;
    await expect(
      caller(bob).addComment({ activityId, activitySource: 'EMAIL', text: 'hi' })
    ).rejects.toThrow(/not found/i);
    await caller(alice).addComment({ activityId, activitySource: 'EMAIL', text: 'mine' });
    expect(
      await caller(bob).getComments({ activityIds: [activityId], activitySource: 'EMAIL' })
    ).toEqual({});
    expect(
      Object.keys(
        await caller(alice).getComments({ activityIds: [activityId], activitySource: 'EMAIL' })
      )
    ).toHaveLength(1);
    await prisma.activityComment.deleteMany({ where: { tenantId } });
  });

  it('deleting a personal mailbox keeps its mail with its owner (it does not become shared)', async () => {
    await prisma.emailMailbox.create({
      data: {
        id: `${RUN}_mb_carol`,
        tenantId,
        scope: 'USER',
        userId: carol,
        kind: 'SMTP',
        status: 'DISCONNECTED',
        fromAddress: `carol.${RUN}@example.invalid`,
      },
    });
    const kept = await prisma.emailRecord.create({
      data: {
        tenantId,
        mailboxId: `${RUN}_mb_carol`,
        subject: 'carol private',
        body: 'x',
        fromEmail: 'c@customer.example.invalid',
        toEmail: 'carol@example.invalid',
        status: 'DELIVERED',
        metadata: {},
      },
    });
    expect(await inbound(bob).getEmail({ emailId: kept.id })).toBeNull();
    await prisma.emailMailbox.delete({ where: { id: `${RUN}_mb_carol` } });
    const after = await prisma.emailRecord.findUniqueOrThrow({ where: { id: kept.id } });
    expect(after.mailboxId).toBeNull();
    expect(await inbound(bob).getEmail({ emailId: kept.id })).toBeNull();
    expect(await inbound(admin, 'ADMIN').getEmail({ emailId: kept.id })).toBeNull();
    expect((await inbound(carol).getEmail({ emailId: kept.id }))?.id).toBe(kept.id);
  });

  it('the Prisma form and the SQL form of the policy select the same rows', async () => {
    const { visibleEmailWhere } = await import('../../packages/db/src/email-visibility');
    const viewers = [
      ...Object.values(readers).map((user) => ({ tenantId, userId: user, role: roleOf(user) })),
      { tenantId, userId: carol, role: 'MANAGER', teamMemberIds: [alice] },
      { tenantId, userId: `${RUN}_nobody`, role: 'SALES_REP' },
    ];
    for (const viewer of viewers) {
      const viaPrisma = (
        await prisma.emailRecord.findMany({
          where: { tenantId, AND: [await visibleEmailWhere(prisma as never, viewer)] },
          select: { id: true },
        })
      ).map((r) => r.id);
      const viaSql = (
        await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT r.id FROM email_records r
          LEFT JOIN email_mailboxes m ON m.id = r."mailboxId"
          WHERE r."tenantId" = ${tenantId}
            AND ${emailVisibleSql(viewer, { mail: 'r', mailbox: 'm' })}`)
      ).map((r) => r.id);
      expect(viaPrisma.sort()).toEqual(viaSql.sort());
    }
  });
});
