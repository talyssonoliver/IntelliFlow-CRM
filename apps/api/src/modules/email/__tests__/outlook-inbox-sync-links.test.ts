/**
 * MVP-001 mailbox sync: what a synced mail is linked to (mail-sync-links.ts through the engine):
 * the provider conversation's CRM thread, and the lead's timeline, written with the mail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import type { SyncedMessage } from '../mail-sync-reader';

const tokens = vi.hoisted(() => ({ getOAuthAccess: vi.fn() }));
vi.mock('../mailbox-transport', () => ({ getOAuthAccess: tokens.getOAuthAccess }));

import { runInboxSync } from '../outlook-inbox-sync';
import { TENANT, mail, round, setup } from './inbox-sync-harness';

const sentMail = (overrides: Partial<SyncedMessage> = {}) =>
  mail({
    providerMessageId: 'graph-sent-1',
    internetMessageId: '<s1@mail.example.invalid>',
    fromAddress: 'me@example.invalid',
    to: ['ada@example.invalid'],
    ...overrides,
  });

describe('mailbox sync: threads and the lead timeline (MVP-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('adds no lead activity for mail with a contact', async () => {
    const { prisma, deps } = setup();
    await runInboxSync(deps);
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("writes a lead's mail and its timeline entry in one transaction", async () => {
    const { prisma, deps } = setup();
    prisma.contact.findFirst.mockResolvedValue(null as never);
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as never);
    const tx = {
      emailRecord: { create: vi.fn(async () => ({ id: 'rec-tx' })) },
      leadActivity: { create: vi.fn(async () => ({ id: 'act-tx' })) },
    };
    prisma.$transaction.mockImplementation(async (work) => work(tx));

    const report = await runInboxSync(deps);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.emailRecord.create).toHaveBeenCalledTimes(1);
    const activity = (tx.leadActivity.create.mock.calls[0] as unknown as [{ data: any }])[0];
    expect(activity.data.metadata.emailRecordId).toBe('rec-tx');
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(report.stored).toBe(1);
  });

  it('stores neither the mail nor the entry when the timeline write is rejected as data', async () => {
    const { prisma, deps } = setup();
    prisma.contact.findFirst.mockResolvedValue(null as never);
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as never);
    // The transaction fails as a whole (Prisma rolls the record back).
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('gone'), { code: 'P2003' }));

    const report = await runInboxSync(deps);

    expect(report).toMatchObject({ stored: 0, skipped: 1, failures: 0 });
  });

  it('puts a reply in the thread of the mail it answers (same provider conversation)', async () => {
    const { prisma, deps } = setup();
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      'metadata' in args.where
        ? { id: 'sent-1', metadata: { conversationId: 'conv-1', threadId: 'thread-9' } }
        : null) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.metadata.threadId).toBe('thread-9');
    const lookups = prisma.emailRecord.findFirst.mock.calls as unknown as Array<[{ where: any }]>;
    expect(lookups.some(([a]) => a.where.metadata?.equals === 'conv-1')).toBe(true);
  });

  it('starts the thread at the first mail of the conversation when it has no thread id', async () => {
    const { prisma, deps } = setup();
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      'metadata' in args.where
        ? { id: 'sent-1', metadata: { conversationId: 'conv-1' } }
        : null) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.metadata.threadId).toBe('sent-1');
    // The first mail carries the thread id too, so the thread view shows it with the reply.
    expect(prisma.emailRecord.update).toHaveBeenCalledWith({
      where: { id: 'sent-1', tenantId: TENANT },
      data: { metadata: { conversationId: 'conv-1', threadId: 'sent-1' } },
    });
  });

  it('skips one mail whose body the provider refuses, and keeps going', async () => {
    const gone = vi.fn(async () => {
      throw new MailboxTransportError('REJECTED');
    });
    const { prisma, deps } = setup({
      rounds: [
        round({
          messages: [
            mail({ providerMessageId: 'z-gone', loadBody: gone }),
            mail({ providerMessageId: 'z-ok', loadBody: async () => 'Still here' }),
          ],
        }),
      ],
    });

    const report = await runInboxSync(deps);

    expect(report).toMatchObject({ stored: 1, skipped: 1, failures: 0 });
    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.providerMessageId).toBe('z-ok');
  });

  it('fails the round when a body read finds the token dead, so the mailbox backs off', async () => {
    const dead = vi.fn(async () => {
      throw new MailboxTransportError('AUTH_FAILED');
    });
    const { prisma, deps } = setup({ rounds: [round({ messages: [mail({ loadBody: dead })] })] });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const report = await runInboxSync(deps);

    expect(report.failures).toBe(1);
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('reads a lazily loaded body only for mail it keeps', async () => {
    const kept = vi.fn(async () => 'Body of the kept mail');
    const skipped = vi.fn(async () => 'Personal mail');
    const { prisma, deps } = setup({
      rounds: [
        round({
          messages: [
            mail({ providerMessageId: 'z-1', bodyText: '', loadBody: kept }),
            mail({
              providerMessageId: 'z-2',
              fromAddress: 'friend@example.invalid',
              loadBody: skipped,
            }),
          ],
        }),
      ],
    });
    prisma.contact.findFirst.mockImplementation((async (args: {
      where: { email: { equals: string } };
    }) =>
      args.where.email.equals === 'ada@example.invalid' ? { id: 'contact-1' } : null) as never);

    await runInboxSync(deps);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(skipped).not.toHaveBeenCalled();
    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.body).toBe('Body of the kept mail');
  });

  it('teaches a CRM-sent mail found in Sent its provider conversation, so replies join it', async () => {
    const sentMail = mail({
      providerMessageId: 'z-sent-1',
      fromAddress: 'me@example.invalid',
      to: ['ada@example.invalid'],
      conversationId: 'zoho-thread-7',
    });
    const { prisma, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail] })],
    });
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      'OR' in args.where ? { id: 'crm-sent', metadata: { threadId: 't-1' } } : null) as never);

    await runInboxSync(deps);

    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(prisma.emailRecord.update).toHaveBeenCalledWith({
      where: { id: 'crm-sent', tenantId: TENANT },
      data: { metadata: { threadId: 't-1', conversationId: 'zoho-thread-7' } },
    });
  });

  it('threads a reply read in the same run as the CRM mail it answers (Sent learns first)', async () => {
    const reply = mail({ providerMessageId: 'z-reply', conversationId: 'zoho-thread-7' });
    const { prisma, deps } = setup({
      rounds: [round({ messages: [reply] })],
      sent: [round({ messages: [sentMail({ conversationId: 'zoho-thread-7' })] })],
    });
    // The CRM's own send is logged without a conversation until Sent teaches it one.
    const crmSent = { id: 'crm-sent', metadata: {} as Record<string, unknown> };
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, any>;
    }) => {
      if ('OR' in args.where) {
        return args.where.OR[0].providerMessageId === 'graph-sent-1' ? crmSent : null;
      }
      return crmSent.metadata.conversationId === args.where.metadata.equals ? crmSent : null;
    }) as never);
    prisma.emailRecord.update.mockImplementation((async (args: {
      data: { metadata: Record<string, unknown> };
    }) => {
      crmSent.metadata = args.data.metadata;
      return {};
    }) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.providerMessageId).toBe('z-reply');
    expect(data.metadata.threadId).toBe('crm-sent');
  });
});
