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

/** The SQL statements the sync ran: the text with `?` for each bound value, and the values. */
const writes = (prisma: ReturnType<typeof setup>['prisma']) =>
  (prisma.$executeRaw.mock.calls as unknown as Array<[TemplateStringsArray, ...unknown[]]>).map(
    ([strings, ...values]) => ({ sql: strings.join('?').replace(/\s+/g, ' ').trim(), values })
  );

const sentMail = (overrides: Partial<SyncedMessage> = {}) =>
  mail({
    providerMessageId: 'graph-sent-1',
    internetMessageId: '<s1@mail.example.invalid>',
    fromAddress: 'me@example.invalid',
    to: ['ada@example.invalid'],
    ...overrides,
  });

/** The thread lookup (by provider conversation), not the duplicate check. */
const isThreadLookup = (where: Record<string, any>) =>
  Array.isArray(where.OR) && 'metadata' in where.OR[0];

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
      isThreadLookup(args.where)
        ? { id: 'sent-1', metadata: { conversationId: 'conv-1', threadId: 'thread-9' } }
        : null) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.metadata.threadId).toBe('thread-9');
    const lookups = prisma.emailRecord.findFirst.mock.calls as unknown as Array<[{ where: any }]>;
    expect(
      lookups.some(([a]) => isThreadLookup(a.where) && a.where.OR[0].metadata.equals === 'conv-1')
    ).toBe(true);
  });

  it("joins the mail whose own Zoho id names the reply's thread, whatever it was stored with", async () => {
    const reply = mail({ providerMessageId: 'z-reply', conversationId: 'z-first' });
    const { prisma, deps } = setup({ rounds: [round({ messages: [reply] })] });
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, any>;
    }) =>
      isThreadLookup(args.where) && args.where.OR[1].providerMessageId === 'z-first'
        ? { id: 'crm-first', metadata: { conversationId: 'z-placeholder', threadId: 'crm-first' } }
        : null) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.metadata.threadId).toBe('crm-first');
  });

  it('starts the thread at the first mail of the conversation when it has no thread id', async () => {
    const { prisma, deps } = setup();
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      isThreadLookup(args.where)
        ? { id: 'sent-1', metadata: { conversationId: 'conv-1' } }
        : null) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.metadata.threadId).toBe('sent-1');
    // The first mail carries the thread id too, so the thread view shows it with the reply.
    const [stamp] = writes(prisma);
    expect(stamp!.sql).toContain("|| jsonb_build_object('threadId', ?::text)");
    expect(stamp!.values).toEqual(['sent-1', TENANT, 'mbx-1', 'sent-1', 'conv-1']);
    // Only the key is merged in the database: no whole metadata object is written back.
    expect(prisma.emailRecord.update).not.toHaveBeenCalled();
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
      !isThreadLookup(args.where)
        ? { id: 'crm-sent', metadata: { threadId: 't-1' } }
        : null) as never);

    await runInboxSync(deps);

    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    const [learn] = writes(prisma);
    expect(learn!.sql).toContain("|| jsonb_build_object('conversationId', ?::text)");
    expect(learn!.values).toEqual(['zoho-thread-7', 'crm-sent', TENANT]);
    // Only the key is merged in the database: the record's other metadata is never rewritten.
    expect(prisma.emailRecord.update).not.toHaveBeenCalled();
  });

  it('stamps the thread id on every mail of the conversation that has none, in one statement', async () => {
    const { prisma, deps } = setup();
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      isThreadLookup(args.where)
        ? { id: 'first', metadata: { conversationId: 'conv-1' } }
        : null) as never);

    await runInboxSync(deps);

    const stamps = writes(prisma).filter((w) => w.sql.includes("'threadId'"));
    expect(stamps).toHaveLength(1);
    // The first mail, and the others of the same conversation in the same tenant and mailbox,
    // each only while they have no thread id; one already there is never replaced.
    expect(stamps[0]!.sql).toContain('"tenantId" = ? AND "mailboxId" = ?');
    expect(stamps[0]!.sql).toContain("(id = ? OR metadata->>'conversationId' = ?)");
    expect(stamps[0]!.sql).toContain("metadata->>'threadId' IS NULL");
  });

  it('uses the thread id a sync running at the same time stamped on the first mail', async () => {
    const { prisma, deps } = setup();
    prisma.emailRecord.findFirst.mockImplementation((async (args: {
      where: Record<string, any>;
    }) => {
      if (isThreadLookup(args.where))
        return { id: 'first', metadata: { conversationId: 'conv-1' } };
      // Read back after our own stamp found the id already set by the other sync.
      return args.where.id === 'first' ? { metadata: { threadId: 'thread-of-other-sync' } } : null;
    }) as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.metadata.threadId).toBe('thread-of-other-sync');
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
      if (args.where.id) return crmSent; // the thread id read back after stamping
      if (!isThreadLookup(args.where)) {
        return args.where.OR[0].providerMessageId === 'graph-sent-1' ? crmSent : null;
      }
      return crmSent.metadata.conversationId === args.where.OR[0].metadata.equals ? crmSent : null;
    }) as never);
    // The merge in SQL adds one key to what the record holds.
    prisma.$executeRaw.mockImplementation(async (strings: unknown, ...values: unknown[]) => {
      const sql = (strings as TemplateStringsArray).join('?');
      const key = sql.includes("'conversationId', ?") ? 'conversationId' : 'threadId';
      crmSent.metadata = { ...crmSent.metadata, [key]: values[0] };
      return 1;
    });

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.providerMessageId).toBe('z-reply');
    expect(data.metadata.threadId).toBe('crm-sent');
  });
});
