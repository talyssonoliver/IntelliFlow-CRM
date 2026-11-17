/**
 * Mailbox sync thread links (mail-sync-links.ts) on a real database. The sync learns a provider
 * conversation for a CRM-sent mail and starts the thread at the first mail of a conversation. Both
 * write into the record's `metadata` JSON, which other jobs write too (the bounce reader adds the
 * recipients that bounced). Only a real database shows that:
 * - a key set meanwhile by another job is still there afterwards (no whole-object write back);
 * - every mail of a conversation without a thread id gets one, and nothing outside it is touched.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import {
  learnThread,
  threadOf,
  type SyncDb,
  type SyncLinkMailbox,
} from '../../apps/api/src/modules/email/mail-sync-links';
import type { SyncedMessage } from '../../apps/api/src/modules/email/mail-sync-reader';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
// Never used to sign in anywhere: the mailboxes only need to exist.
const PLACEHOLDER = 'x'.repeat(12);

describeDb('mailbox sync thread links', () => {
  const run = randomUUID().slice(0, 8);
  const tenantA = `links-a-${run}`;
  const tenantB = `links-b-${run}`;
  let prisma: PrismaClient;
  let mailbox: SyncLinkMailbox;
  let otherMailboxId: string;
  let otherTenantMailboxId: string;
  let clock = 0;

  // A tenant has one company mailbox; another one in the same tenant belongs to a user.
  const addMailbox = async (tenantId: string, address: string, userId?: string) =>
    (
      await prisma.emailMailbox.create({
        data: {
          tenantId,
          scope: userId ? 'USER' : 'TENANT',
          userId: userId ?? null,
          kind: 'GMAIL',
          status: 'ACTIVE',
          fromAddress: address,
          accountAddress: address,
          refreshToken: PLACEHOLDER,
        },
      })
    ).id;

  /** A record, created `minutes` after the others (so "the oldest" is the one with the least). */
  const addRecord = (
    tenantId: string,
    mailboxId: string,
    metadata: Record<string, unknown> | null,
    extra: { providerMessageId?: string } = {}
  ) =>
    prisma.emailRecord.create({
      data: {
        subject: 'Re: Proposal',
        body: 'Hello',
        fromEmail: 'ada@example.invalid',
        toEmail: 'me@example.invalid',
        tenantId,
        mailboxId,
        createdAt: new Date(Date.UTC(2026, 10, 16, 9, clock++)),
        ...(metadata ? { metadata: metadata as never } : {}),
        ...extra,
      },
    });

  const metadataOf = async (id: string) =>
    (await prisma.emailRecord.findUniqueOrThrow({ where: { id } })).metadata;

  const message = (conversationId: string) => ({ conversationId }) as SyncedMessage;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
    for (const id of [tenantA, tenantB]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    mailbox = {
      id: await addMailbox(tenantA, `me@${run}.example.invalid`),
      tenantId: tenantA,
      userId: null,
    };
    const userId = `${tenantA}-user`;
    await prisma.user.create({
      data: { id: userId, tenantId: tenantA, email: `user@${run}.example.invalid` },
    });
    otherMailboxId = await addMailbox(tenantA, `other@${run}.example.invalid`, userId);
    otherTenantMailboxId = await addMailbox(tenantB, `me@b-${run}.example.invalid`);
  });

  afterAll(async () => {
    const tenants = [tenantA, tenantB];
    await prisma.emailRecord.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.emailMailbox.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  describe('learnThread', () => {
    it('keeps what another job wrote to the record meanwhile', async () => {
      const record = await addRecord(tenantA, mailbox.id, { source: 'crm' });
      // What the sync read when it found the mail in Sent...
      const stale = { id: record.id, metadata: { source: 'crm' } };
      // ...and what the bounce reader wrote to the same record before the sync wrote.
      await prisma.emailRecord.update({
        where: { id: record.id },
        data: { metadata: { source: 'crm', bouncedRecipients: ['gone@example.invalid'] } },
      });

      await learnThread({ prisma } as SyncDb, mailbox, stale, message('conv-learn'));

      expect(await metadataOf(record.id)).toEqual({
        source: 'crm',
        bouncedRecipients: ['gone@example.invalid'],
        conversationId: 'conv-learn',
      });
    });

    it('learns a conversation for a record with no metadata at all', async () => {
      const record = await addRecord(tenantA, mailbox.id, null);

      await learnThread(
        { prisma } as SyncDb,
        mailbox,
        { id: record.id, metadata: null },
        message('conv-bare')
      );

      expect(await metadataOf(record.id)).toEqual({ conversationId: 'conv-bare' });
    });

    it('never replaces a conversation another sync learned first', async () => {
      const record = await addRecord(tenantA, mailbox.id, { conversationId: 'learned-first' });
      const stale = { id: record.id, metadata: {} }; // read before the other sync wrote

      await learnThread({ prisma } as SyncDb, mailbox, stale, message('learned-second'));

      expect(await metadataOf(record.id)).toEqual({ conversationId: 'learned-first' });
    });

    it('writes only in its own tenant', async () => {
      const record = await addRecord(tenantB, otherTenantMailboxId, { source: 'crm' });

      await learnThread(
        { prisma } as SyncDb,
        mailbox, // tenant A
        { id: record.id, metadata: { source: 'crm' } },
        message('conv-x')
      );

      expect(await metadataOf(record.id)).toEqual({ source: 'crm' });
    });
  });

  describe('threadOf', () => {
    it('keeps what another job wrote to the first mail between the lookup and the stamp', async () => {
      const first = await addRecord(tenantA, mailbox.id, { conversationId: 'conv-race' });
      // The same client, except that right after the lookup another job changes the first mail.
      const racing = {
        $executeRaw: (...args: [TemplateStringsArray, ...unknown[]]) => prisma.$executeRaw(...args),
        emailRecord: {
          update: (args: unknown) => prisma.emailRecord.update(args as never),
          findFirst: async (args: { orderBy?: unknown }) => {
            const found = await prisma.emailRecord.findFirst(args as never);
            if (args.orderBy) {
              await prisma.emailRecord.update({
                where: { id: first.id },
                data: {
                  metadata: {
                    conversationId: 'conv-race',
                    bouncedRecipients: ['a@example.invalid'],
                  },
                },
              });
            }
            return found;
          },
        },
      };

      const threadId = await threadOf({ prisma: racing }, mailbox, message('conv-race'));

      expect(threadId).toBe(first.id);
      expect(await metadataOf(first.id)).toEqual({
        conversationId: 'conv-race',
        bouncedRecipients: ['a@example.invalid'],
        threadId: first.id,
      });
    });

    it('gives the thread id to every mail of the conversation that has none, and only those', async () => {
      const conversation = 'conv-backfill';
      const first = await addRecord(tenantA, mailbox.id, { conversationId: conversation });
      const second = await addRecord(tenantA, mailbox.id, {
        conversationId: conversation,
        folder: 'inbox',
      });
      const already = await addRecord(tenantA, mailbox.id, {
        conversationId: conversation,
        threadId: 'older-thread',
      });
      const otherConversation = await addRecord(tenantA, mailbox.id, { conversationId: 'conv-c' });
      const otherMailbox = await addRecord(tenantA, otherMailboxId, {
        conversationId: conversation,
      });
      const otherTenant = await addRecord(tenantB, otherTenantMailboxId, {
        conversationId: conversation,
      });

      const threadId = await threadOf({ prisma }, mailbox, message(conversation));

      expect(threadId).toBe(first.id);
      expect(await metadataOf(first.id)).toEqual({
        conversationId: conversation,
        threadId: first.id,
      });
      expect(await metadataOf(second.id)).toEqual({
        conversationId: conversation,
        folder: 'inbox',
        threadId: first.id,
      });
      // A thread id already there is never replaced; nothing outside the conversation, the
      // mailbox and the tenant is touched.
      expect(await metadataOf(already.id)).toEqual({
        conversationId: conversation,
        threadId: 'older-thread',
      });
      expect(await metadataOf(otherConversation.id)).toEqual({ conversationId: 'conv-c' });
      expect(await metadataOf(otherMailbox.id)).toEqual({ conversationId: conversation });
      expect(await metadataOf(otherTenant.id)).toEqual({ conversationId: conversation });
    });

    it('starts a thread at the mail whose own provider id names it', async () => {
      const first = await addRecord(
        tenantA,
        mailbox.id,
        { conversationId: 'placeholder' },
        { providerMessageId: 'z-first-9' }
      );

      const threadId = await threadOf({ prisma }, mailbox, message('z-first-9'));

      expect(threadId).toBe(first.id);
      expect(await metadataOf(first.id)).toEqual({
        conversationId: 'placeholder',
        threadId: first.id,
      });
    });

    it('returns the thread id a mail already has, without writing', async () => {
      await addRecord(tenantA, mailbox.id, { conversationId: 'conv-set', threadId: 'thread-set' });

      expect(await threadOf({ prisma }, mailbox, message('conv-set'))).toBe('thread-set');
    });
  });
});
