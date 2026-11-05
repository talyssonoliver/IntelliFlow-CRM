/**
 * A conversation leaves drafts out in the query itself, so they never use up its
 * limit. Records without the flag must stay in, which only a real database can show.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { inboundEmailRouter } from '../../apps/api/src/modules/email/inbound.router';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

describeDb('inbound getThread with drafts', () => {
  const threadId = `thread-${randomUUID()}`;
  const created: string[] = [];
  let prisma: PrismaClient;
  const tenantId = `thread-drafts-${randomUUID()}`;
  const userId = `thread-drafts-${randomUUID()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
    await prisma.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId } });
    await prisma.user.create({
      data: { id: userId, tenantId, email: `${userId}@example.invalid` },
    });
  });

  afterAll(async () => {
    await prisma.emailRecord.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const row = async (subject: string, metadata: Record<string, unknown>) => {
    const record = await prisma.emailRecord.create({
      data: {
        tenantId,
        userId,
        subject,
        body: '<p>x</p>',
        fromEmail: 'a@mail.example.invalid',
        toEmail: 'b@mail.example.invalid',
        metadata: { threadId, ...metadata },
      },
    });
    created.push(record.id);
  };

  const caller = () =>
    inboundEmailRouter.createCaller({
      prisma,
      prismaWithTenant: prisma,
      tenant: {
        tenantId,
        tenantType: 'user',
        userId,
        role: 'SALES_REP',
        canAccessAllTenantData: false,
      },
      user: {
        userId,
        email: 'a@mail.example.invalid',
        role: 'SALES_REP',
        tenantId,
        emailVerified: true,
      },
      container: {},
      services: {},
      security: {},
      adapters: {},
    } as never);

  it('keeps every message, whatever the limit, and leaves the drafts out', async () => {
    // The drafts come first, so they would fill a limit applied before filtering.
    await row('draft one', { isDraft: true });
    await row('draft two', { isDraft: true });
    await row('never flagged', {});
    await row('flag cleared', { isDraft: false });

    const thread = await caller().getThread({ threadId, limit: 2 });

    expect(thread.emails.map((email) => email.subject)).toEqual(['never flagged', 'flag cleared']);
  });
});
