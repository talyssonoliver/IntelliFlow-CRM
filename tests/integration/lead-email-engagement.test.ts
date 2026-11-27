/**
 * MVP-012 — the open rate on a lead's profile card, proved on a real Postgres.
 *
 * `leadEmailEngagement` counts tracked sends and opens for one address in the database, over every
 * record: nothing is loaded and nothing is capped (a row limit applied before the eligibility filter
 * could drop tracked sends and give a wrong rate). Skips only when DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { leadEmailEngagement } from '../../apps/api/src/modules/email/lead-email-engagement';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.log('Skipping lead-email-engagement integration test: DATABASE_URL not set');

const RUN = `mvp012_${Date.now()}`;
const TENANT = `${RUN}_a`;
const OTHER = `${RUN}_b`;

describeDb('leadEmailEngagement (real database)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    for (const id of [TENANT, OTHER]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.emailRecord.deleteMany({ where: { tenantId: { in: [TENANT, OTHER] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT, OTHER] } } });
    await prisma.$disconnect();
  });

  /** A mail sent from the CRM to `to`: it has the sending user and stores no direction. */
  const mail = (to: string, over: Record<string, unknown> = {}, tenantId = TENANT) => ({
    tenantId,
    subject: 'Hello',
    body: 'Hello',
    fromEmail: 'me@example.invalid',
    toEmail: to,
    status: 'SENT' as const,
    userId: 'user-1',
    ...over,
  });
  const count = (address: string, tenantId = TENANT) =>
    leadEmailEngagement(prisma as never, { tenantId, userId: 'user-1' }, address);

  it('counts CRM sends as tracked, and opens by openCount, openedAt or the status', async () => {
    const to = `a1.${RUN}@example.invalid`;
    await prisma.emailRecord.createMany({
      data: [
        mail(to),
        mail(to, { openCount: 2 }),
        mail(to, { openedAt: new Date('2026-11-15T10:00:00.000Z') }),
        mail(to, { status: 'OPENED' }),
        mail(to, { status: 'CLICKED' }),
      ],
    });
    expect(await count(to)).toEqual({ sent: 5, opened: 4 });
  });

  it('matches the address exactly, in To, Cc or Bcc, ignoring case and display names', async () => {
    const to = `a2.${RUN}@example.invalid`;
    await prisma.emailRecord.createMany({
      data: [
        mail(`Ada <${to.toUpperCase()}>, x@example.invalid`),
        mail('x@example.invalid', { ccEmails: to, openCount: 1 }),
        mail('x@example.invalid', { bccEmails: to }),
        mail(`longer-${to}`),
        mail(`${to}.other`),
      ],
    });
    expect(await count(to)).toEqual({ sent: 3, opened: 1 });
  });

  it('leaves out mail that did not leave, was received, or bounced for the address', async () => {
    const to = `a3.${RUN}@example.invalid`;
    await prisma.emailRecord.createMany({
      data: [
        mail(to, { status: 'FAILED' }),
        mail(to, { status: 'PENDING' }),
        mail(to, { status: 'BOUNCED' }),
        mail(to, { metadata: { direction: 'inbound' }, userId: null }),
        mail(to, { metadata: { bouncedRecipients: [to.toUpperCase()] } }),
        mail(to, { metadata: { hardBouncedRecipients: [to] } }),
        mail(to, { metadata: { rejectedRecipients: [to] } }),
      ],
    });
    expect(await count(to)).toEqual({ sent: 0, opened: 0 });
    // A bounce for someone else on the same mail does not undo it.
    await prisma.emailRecord.create({
      data: mail(`${to}, other@example.invalid`, {
        metadata: { bouncedRecipients: ['other@example.invalid'] },
      }),
    });
    expect(await count(to)).toEqual({ sent: 1, opened: 0 });
  });

  it('does not count untracked mail (synced from a mailbox, or logged by hand) unless it was opened', async () => {
    const to = `a4.${RUN}@example.invalid`;
    await prisma.emailRecord.createMany({
      data: [
        mail(to, { metadata: { direction: 'outbound', source: 'outlook-sync' } }),
        mail(to, { metadata: { source: 'gmail-sync' } }),
        mail(to, { userId: null }),
      ],
    });
    expect(await count(to)).toEqual({ sent: 0, opened: 0 });
    await prisma.emailRecord.createMany({
      data: [
        mail(to, { metadata: { direction: 'outbound', source: 'outlook-sync' }, openCount: 1 }),
        mail(to, { userId: null, openedAt: new Date('2026-11-15T10:00:00.000Z') }),
      ],
    });
    expect(await count(to)).toEqual({ sent: 2, opened: 2 });
  });

  it("never counts another tenant's mail to the same address", async () => {
    const to = `a5.${RUN}@example.invalid`;
    await prisma.emailRecord.createMany({
      data: [mail(to), mail(to, { openCount: 1 }, OTHER), mail(to, {}, OTHER)],
    });
    expect(await count(to)).toEqual({ sent: 1, opened: 0 });
    expect(await count(to, OTHER)).toEqual({ sent: 2, opened: 1 });
  });

  it('counts every record: more than 5,000 mails, the opened ones the oldest', async () => {
    const to = `a6.${RUN}@example.invalid`;
    const rows = Array.from({ length: 5200 }, (_, i) =>
      mail(to, {
        // The three oldest were opened; a newest-first limit of 5,000 would have dropped them.
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
        openCount: i < 3 ? 1 : 0,
      })
    );
    await prisma.emailRecord.createMany({ data: rows });
    expect(await count(to)).toEqual({ sent: 5200, opened: 3 });
  }, 60_000);
});
