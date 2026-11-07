/**
 * Inbound mail lands only in the tenant of the connected mailbox it was sent to.
 * Two customers on one shared domain, an address connected twice and a
 * disconnected mailbox are the cases the old domain matching got wrong, and only
 * a real database shows where the rows actually go.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import {
  inboundEmailRouter,
  computeInboundEmailWebhookSignature,
} from '../../apps/api/src/modules/email/inbound.router';
import { smtpAccountFields } from '../../packages/validators/src/smtp-account';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
// Never used to sign in anywhere: the mailboxes only need to exist.
const PLACEHOLDER = 'x'.repeat(12);

describeDb('inbound mail routing by mailbox', () => {
  const run = randomUUID().slice(0, 8);
  const shared = `shared-${run}.example.invalid`;
  const tenantA = `route-a-${run}`;
  const tenantB = `route-b-${run}`;
  const secret = ['routing', 'test', run].join('-');
  let prisma: PrismaClient;
  let previousSecret: string | undefined;
  const mailboxIds: Record<string, string> = {};

  // One company mailbox per tenant; the others belong to a user. Google mailboxes carry the
  // address the provider proved; an SMTP mailbox's address is only typed in.
  const addMailbox = async (
    key: string,
    tenantId: string,
    address: string,
    {
      status = 'ACTIVE',
      userId,
      kind = 'GMAIL',
    }: { status?: string; userId?: string; kind?: 'GMAIL' | 'SMTP' } = {}
  ) => {
    const connection =
      kind === 'GMAIL'
        ? { accountAddress: address, refreshToken: PLACEHOLDER }
        : {
            smtpHost: 'smtp.example.invalid',
            smtpPort: 587,
            smtpSecurity: 'STARTTLS',
            ...smtpAccountFields(address, PLACEHOLDER),
          };
    const row = await prisma.emailMailbox.create({
      data: {
        tenantId,
        scope: userId ? 'USER' : 'TENANT',
        userId: userId ?? null,
        kind,
        status,
        fromAddress: address,
        ...connection,
      },
    });
    mailboxIds[key] = row.id;
  };

  const addUser = (tenantId: string, id: string) =>
    prisma.user.create({ data: { id, tenantId, email: `${id}@${shared}` } });

  beforeAll(async () => {
    previousSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = secret;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
    for (const id of [tenantA, tenantB]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
      // Users on the shared domain in both tenants: domain matching would have picked one.
      await addUser(id, `${id}-user`);
      await addUser(id, `${id}-user2`);
    }
    await addMailbox('ann', tenantA, `ann@${shared}`);
    await addMailbox('bob', tenantB, `bob@${shared}`);
    await addMailbox('dupA', tenantA, `dup@${shared}`, { userId: `${tenantA}-user` });
    await addMailbox('dupB', tenantB, `dup@${shared}`, { userId: `${tenantB}-user` });
    await addMailbox('gone', tenantA, `gone@${shared}`, {
      status: 'DISCONNECTED',
      userId: `${tenantA}-user2`,
    });
    // Someone in tenant B types tenant A's address into an SMTP mailbox.
    await addMailbox('claim', tenantB, `ann@${shared}`, {
      kind: 'SMTP',
      userId: `${tenantB}-user2`,
    });
    // An address that only a typed-in SMTP mailbox has.
    await addUser(tenantA, `${tenantA}-user3`);
    await addMailbox('typed', tenantA, `typed@${shared}`, {
      kind: 'SMTP',
      userId: `${tenantA}-user3`,
    });
  });
  afterAll(async () => {
    const tenants = [tenantA, tenantB];
    await prisma.emailRecord.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.emailMailbox.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
    if (previousSecret === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = previousSecret;
  });

  const send = async (to: string, subject: string) => {
    const input = {
      provider: 'raw' as const,
      rawEmail: [
        `From: sender@outside-${run}.example.invalid`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Message-ID: <${randomUUID()}@outside-${run}.example.invalid>`,
        '',
        'Hello',
      ].join('\r\n'),
    };
    const headers = new Headers({
      'x-inbound-email-signature': computeInboundEmailWebhookSignature(input as never, secret),
    });
    const caller = inboundEmailRouter.createCaller({ prisma, req: { headers } } as never);
    return caller.webhook(input as never);
  };

  const rowsFor = (subject: string) =>
    prisma.emailRecord.findMany({
      where: { subject, tenantId: { in: [tenantA, tenantB] } },
      select: { tenantId: true, mailboxId: true },
    });

  it("stores each shared-domain customer's mail in their own tenant and mailbox", async () => {
    const toAnn = await send(`ann@${shared}`, `to-ann-${run}`);
    const toBob = await send(`Bob@${shared}`, `to-bob-${run}`);

    expect(toAnn.stored).toBe(true);
    expect(toBob.stored).toBe(true);
    expect(await rowsFor(`to-ann-${run}`)).toEqual([
      { tenantId: tenantA, mailboxId: mailboxIds.ann },
    ]);
    expect(await rowsFor(`to-bob-${run}`)).toEqual([
      { tenantId: tenantB, mailboxId: mailboxIds.bob },
    ]);
  });

  it("keeps delivering to the proven mailbox when another tenant's SMTP mailbox claims the address", async () => {
    const result = await send(`ann@${shared}`, `claimed-${run}`);

    expect(result.stored).toBe(true);
    expect(await rowsFor(`claimed-${run}`)).toEqual([
      { tenantId: tenantA, mailboxId: mailboxIds.ann },
    ]);
  });

  it.each([
    ['an address on the shared domain that no mailbox has', 'carol'],
    ['an address connected in both tenants', 'dup'],
    ['a disconnected mailbox', 'gone'],
    ['an address only an SMTP mailbox claims', 'typed'],
  ])('stores nothing anywhere for %s', async (_label, local) => {
    const subject = `to-${local}-${run}`;

    const result = await send(`${local}@${shared}`, subject);

    expect(result).toMatchObject({ success: true, stored: false });
    expect(await rowsFor(subject)).toEqual([]);
    expect(await prisma.emailRecord.count({ where: { subject, tenantId: 'system' } })).toBe(0);
  });
});
