/**
 * #1177 / MVP-001 mailbox sync engine: what is logged, what never is, and how the cursor moves.
 * Driven by a test reader (the Graph reader is tested with its own module).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import type { SyncedMessage } from '../mail-sync-reader';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: (kind: string) => [`EMAIL_OAUTH_${kind}_CLIENT_ID`],
}));

import {
  inboxSyncEnabled,
  runInboxSync,
  INBOX_SYNC_INTERVAL_MS,
  TICK_BUDGET_MS,
} from '../outlook-inbox-sync';
import {
  CURSOR,
  LEASE,
  NOW,
  TENANT,
  mail,
  mailbox,
  released,
  round,
  setup,
} from './inbox-sync-harness';

describe('runInboxSync (#1177)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('logs mail from a known contact and moves the cursor on', async () => {
    const { prisma, readDelta, deps } = setup();

    const report = await runInboxSync(deps);

    expect(readDelta).toHaveBeenCalledWith(
      'access-for-tests',
      CURSOR,
      expect.objectContaining({ folder: 'inbox', initialDays: 30 })
    );
    expect(prisma.emailRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT,
        mailboxId: 'mbx-1',
        contactId: 'contact-1',
        fromEmail: 'ada@example.invalid',
        toEmail: 'me@example.invalid',
        status: 'DELIVERED',
        provider: 'MICROSOFT',
        providerMessageId: 'graph-1',
        messageIdHeader: '<m1@mail.example.invalid>',
        createdAt: new Date('2026-11-14T09:00:00.000Z'),
        metadata: {
          source: 'outlook-sync',
          folder: 'inbox',
          direction: 'inbound',
          fromName: 'Ada',
          mailboxOwnerId: 'user-1',
          conversationId: 'conv-1',
        },
      }),
      select: { id: true },
    });
    // Received mail is not the owner's: a userId would list it in their Sent folder.
    const created = prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: object }];
    expect(created[0].data).not.toHaveProperty('userId');
    expect(released(prisma)).toEqual({
      where: { id: 'mbx-1', syncLockedUntil: LEASE, tokenVersion: 0 },
      data: {
        syncLockedUntil: null,
        syncCursor: 'https://graph.microsoft.com/v1.0/me/delta-2',
        syncSentCursor: 'https://graph.microsoft.com/v1.0/me/delta-2',
        syncedAt: NOW,
        nextSyncAt: new Date(NOW.getTime() + INBOX_SYNC_INTERVAL_MS),
        syncFailureCount: 0,
      },
    });
    expect(report).toMatchObject({ mailboxesSynced: 1, stored: 1, skipped: 0 });
  });

  it('matches the sender in its own tenant only, case-insensitively', async () => {
    const { prisma, deps } = setup();

    await runInboxSync(deps);

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        email: { equals: 'ada@example.invalid', mode: 'insensitive' },
        // a personal mailbox matches only the people its owner owns (register #64)
        ownerId: 'user-1',
      },
      select: { id: true },
    });
  });

  it('links a lead sender through metadata', async () => {
    const { prisma, deps } = setup();
    prisma.contact.findFirst.mockResolvedValue(null as never);
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as never);

    await runInboxSync(deps);

    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data.contactId).toBeNull();
    expect(data.metadata.leadId).toBe('lead-1');
    // The lead's timeline entry (its author, direction and sender) is in the direction tests.
    expect(prisma.leadActivity.create).toHaveBeenCalledTimes(1);
  });

  it('never stores mail from someone who is not a lead or contact (personal mail, erased people)', async () => {
    const { prisma, deps } = setup();
    prisma.contact.findFirst.mockResolvedValue(null as never);

    const report = await runInboxSync(deps);

    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(report).toMatchObject({ stored: 0, skipped: 1 });
  });

  it('never stores mail from a sender with an active processing restriction', async () => {
    const { prisma, isRestricted, deps } = setup();
    isRestricted.mockResolvedValue(true);

    await runInboxSync(deps);

    expect(isRestricted).toHaveBeenCalledWith(TENANT, 'ada@example.invalid');
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it("skips the mailbox's own mail and mail without a sender", async () => {
    const { prisma, deps } = setup({
      rounds: [
        round({
          messages: [mail({ fromAddress: 'me@example.invalid' }), mail({ fromAddress: null })],
        }),
      ],
    });

    await runInboxSync(deps);

    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('never logs the same message twice: same Graph id, or the same Message-ID header', async () => {
    const { prisma, deps } = setup();
    prisma.emailRecord.findFirst.mockResolvedValue({ id: 'rec-0' } as never);

    await runInboxSync(deps);

    expect(prisma.emailRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        mailboxId: 'mbx-1',
        OR: [{ providerMessageId: 'graph-1' }, { messageIdHeader: '<m1@mail.example.invalid>' }],
      },
      select: { id: true, metadata: true },
    });
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('checks only the Graph id when the mail has no Message-ID header', async () => {
    const { prisma, deps } = setup({
      rounds: [round({ messages: [mail({ internetMessageId: null })] })],
    });

    await runInboxSync(deps);

    expect(prisma.emailRecord.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, mailboxId: 'mbx-1', OR: [{ providerMessageId: 'graph-1' }] },
      select: { id: true, metadata: true },
    });
    expect(prisma.emailRecord.create).toHaveBeenCalledTimes(1);
  });

  it('restarts from scratch when Graph no longer accepts the cursor', async () => {
    const { readDelta, deps } = setup({
      rounds: [round({ messages: [], cursor: null, expired: true }), round()],
    });

    const report = await runInboxSync(deps);

    const inboxReads = (
      readDelta.mock.calls as unknown as Array<[string, string | null, { folder: string }]>
    ).filter(([, , read]) => read.folder === 'inbox');
    expect(inboxReads.map(([, cursor]) => cursor)).toEqual([CURSOR, null]);
    expect(report.restarts).toBe(1);
  });

  it('comes back on the next tick while there is more to read', async () => {
    const { prisma, deps } = setup({ rounds: [round({ complete: false })] });

    await runInboxSync(deps);

    expect(released(prisma).data.nextSyncAt).toEqual(NOW);
  });

  it('does not read a mailbox without Mail.Read, and checks it again in a day', async () => {
    const { prisma, readDelta, deps } = setup({ mailbox: { grantedScopes: ['Mail.Send'] } });

    await runInboxSync(deps);

    expect(tokens.getOAuthAccess).not.toHaveBeenCalled();
    expect(readDelta).not.toHaveBeenCalled();
    expect(released(prisma).data).toEqual({
      syncLockedUntil: null,
      nextSyncAt: new Date(NOW.getTime() + 24 * 60 * 60_000),
    });
  });

  it('backs off on a failure without touching the mailbox status (sending stays up)', async () => {
    const { prisma, deps } = setup({ mailbox: { syncFailureCount: 2 } });
    tokens.getOAuthAccess.mockRejectedValue(new Error('token endpoint down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const report = await runInboxSync(deps);

    const data = released(prisma).data;
    expect(data.syncFailureCount).toBe(3);
    expect(data.nextSyncAt).toEqual(new Date(NOW.getTime() + INBOX_SYNC_INTERVAL_MS * 8));
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('syncCursor');
    expect(report.failures).toBe(1);
    error.mockRestore();
  });

  it('skips one mail the database rejects as data and keeps going', async () => {
    const { prisma, deps } = setup({
      rounds: [round({ messages: [mail(), mail({ providerMessageId: 'graph-2' })] })],
    });
    prisma.emailRecord.create
      .mockRejectedValueOnce(Object.assign(new Error('too long'), { code: 'P2000' }))
      .mockResolvedValueOnce({ id: 'rec-2' } as never);

    const report = await runInboxSync(deps);

    expect(report).toMatchObject({ stored: 1, skipped: 1, failures: 0 });
  });

  it('leaves the state alone when another worker took the lease meanwhile', async () => {
    const { prisma, deps } = setup();
    prisma.emailMailbox.update.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'P2025' })
    );

    await expect(runInboxSync(deps)).resolves.toMatchObject({ mailboxesSynced: 1 });
  });

  it('writes back only with the credentials it read: a save meanwhile wins, and a rotation is its own', async () => {
    const { prisma, deps } = setup({ mailbox: { tokenVersion: 4 } });
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 5 });

    await runInboxSync(deps);

    // The refresh rotated the token (4 -> 5): the round writes back under the version it now holds.
    expect(released(prisma).where).toEqual({
      id: 'mbx-1',
      syncLockedUntil: LEASE,
      tokenVersion: 5,
    });
  });

  it('claims only kinds that have a reader, and stores the provider of its reader (MVP-001)', async () => {
    const { prisma, deps } = setup({ mailbox: { kind: 'ZOHO' } });
    const read = vi.fn(async () => round());
    deps.readers = {
      ZOHO: { provider: 'ZOHO', canRead: () => true, read: read as never },
    };

    await runInboxSync(deps);

    // The claim query is a tagged template: its values hold the readable kinds.
    const values = (prisma.$queryRaw.mock.calls[0] as unknown as unknown[]).slice(1);
    expect(values).toContainEqual(['ZOHO']);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ folder: 'inbox', cursor: CURSOR }));
    const created = prisma.emailRecord.create.mock.calls[0] as unknown as [
      { data: { provider: string } },
    ];
    expect(created[0].data.provider).toBe('ZOHO');
  });

  it('leaves a mailbox whose read permission is missing for the daily check', async () => {
    const { prisma, deps } = setup();
    const read = vi.fn();
    deps.readers = {
      MICROSOFT: { provider: 'MICROSOFT', canRead: () => false, read: read as never },
    };

    await runInboxSync(deps);

    expect(read).not.toHaveBeenCalled();
    expect(released(prisma).data.nextSyncAt).toEqual(new Date(NOW.getTime() + 24 * 60 * 60_000));
  });

  it('does nothing at all while no reader is registered', async () => {
    const { prisma, deps } = setup();
    deps.readers = {};

    await expect(runInboxSync(deps)).resolves.toMatchObject({ mailboxesSynced: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('stops when no mailbox is due', async () => {
    const { prisma, deps } = setup();
    prisma.$queryRaw.mockResolvedValue([] as never);

    const report = await runInboxSync(deps);

    expect(prisma.emailMailbox.findFirst).not.toHaveBeenCalled();
    expect(report.mailboxesSynced).toBe(0);
  });

  it('stops claiming mailboxes once the tick budget is spent, so a tick ends inside its lease', async () => {
    const { prisma, deps } = setup();
    prisma.$queryRaw.mockImplementation(async () => [{ id: 'mbx-1', syncLockedUntil: LEASE }]);
    let clock = NOW.getTime();
    deps.now = () => new Date(clock);
    prisma.emailMailbox.findFirst.mockImplementation(async () => {
      clock += TICK_BUDGET_MS / 2; // each mailbox takes half the budget
      return mailbox();
    });

    const report = await runInboxSync(deps);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(report.mailboxesSynced).toBe(2);
  });

  it('gives each mailbox read a time budget', async () => {
    const { readDelta, deps } = setup();

    await runInboxSync(deps);

    expect(readDelta).toHaveBeenCalledWith(
      'access-for-tests',
      CURSOR,
      expect.objectContaining({ budgetMs: expect.any(Number) })
    );
  });
});

describe('runInboxSync: Sent Items, the other way (#1177)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  const sentMail = (overrides: Partial<SyncedMessage> = {}) =>
    mail({
      providerMessageId: 'graph-sent-1',
      internetMessageId: '<s1@mail.example.invalid>',
      fromAddress: 'me@example.invalid',
      to: ['ada@example.invalid'],
      ...overrides,
    });

  it('reads Sent Items first, from its own cursor, then the inbox', async () => {
    const { readDelta, deps } = setup({ mailbox: { syncSentCursor: `${CURSOR}-sent` } });

    await runInboxSync(deps);

    const calls = readDelta.mock.calls as unknown as Array<
      [string, string | null, { folder: string }]
    >;
    expect(calls.map(([, cursor, options]) => [options.folder, cursor])).toEqual([
      ['sentitems', `${CURSOR}-sent`],
      ['inbox', CURSOR],
    ]);
  });

  it('logs mail the user sent from Outlook against the recipient contact, as sent', async () => {
    const { prisma, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail()] })],
    });

    await runInboxSync(deps);

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT,
          email: { equals: 'ada@example.invalid', mode: 'insensitive' },
          // a personal mailbox matches only the people its owner owns (register #64)
          ownerId: 'user-1',
        },
      })
    );
    const data = (prisma.emailRecord.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(data).toMatchObject({
      status: 'SENT',
      sentAt: new Date('2026-11-14T09:00:00.000Z'),
      isRead: true,
      fromEmail: 'me@example.invalid',
      // Mail the owner sent is theirs: it belongs in their Sent folder.
      userId: 'user-1',
      contactId: 'contact-1',
      metadata: { folder: 'sentitems', mailboxOwnerId: 'user-1' },
    });
  });

  it('gives both folders one shared read deadline per mailbox', async () => {
    const { readDelta, deps } = setup();
    let clock = NOW.getTime();
    deps.now = () => new Date(clock);
    readDelta.mockImplementation(async () => {
      clock += 40_000; // the first folder's read uses 40 seconds of the budget
      return round({ messages: [] });
    });

    await runInboxSync(deps);

    const budgets = (
      readDelta.mock.calls as unknown as Array<[string, null, { budgetMs: number }]>
    ).map(([, , options]) => options.budgetMs);
    expect(budgets).toHaveLength(2);
    expect(budgets[1]).toBe(budgets[0]! - 40_000);
  });

  it('skips the mailbox owner among the recipients and logs against the first lead or contact', async () => {
    const { prisma, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [
        round({
          messages: [sentMail({ to: ['me@example.invalid'], cc: ['ada@example.invalid'] })],
        }),
      ],
    });

    await runInboxSync(deps);

    const emails = prisma.contact.findFirst.mock.calls.map(
      (c) => (c as unknown as [{ where: { email: { equals: string } } }])[0].where.email.equals
    );
    expect(emails).toEqual(['ada@example.invalid']);
  });

  it('does not log again a mail the CRM itself sent (same Message-ID)', async () => {
    const { prisma, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail()] })],
    });
    prisma.emailRecord.findFirst.mockResolvedValue({ id: 'crm-sent' } as never);

    await runInboxSync(deps);

    expect(prisma.emailRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        mailboxId: 'mbx-1',
        OR: [
          { providerMessageId: 'graph-sent-1' },
          { messageIdHeader: '<s1@mail.example.invalid>' },
        ],
      },
      select: { id: true, metadata: true },
    });
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('never logs sent mail to people who are not leads or contacts, or are restricted', async () => {
    const { prisma, isRestricted, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail()] })],
    });
    isRestricted.mockResolvedValue(true);

    await runInboxSync(deps);

    expect(isRestricted).toHaveBeenCalledWith(TENANT, 'ada@example.invalid');
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('keeps the Sent cursor when the inbox then fails, so Sent progress is never read again', async () => {
    const { prisma, readDelta, deps } = setup();
    readDelta
      .mockImplementationOnce(async () => round({ messages: [] }))
      .mockImplementationOnce(async () => {
        throw new MailboxTransportError('REJECTED');
      });

    await runInboxSync(deps);

    expect(released(prisma).data).toMatchObject({
      syncSentCursor: 'https://graph.microsoft.com/v1.0/me/delta-2',
      syncFailureCount: 1,
    });
    expect(released(prisma).data).not.toHaveProperty('syncCursor');
  });

  it.each([
    ['first', ['zed@example.invalid', 'ada@example.invalid']],
    ['second', ['ada@example.invalid', 'zed@example.invalid']],
  ])('skips sent mail with a restricted recipient in %s place', async (_place, to) => {
    const { prisma, isRestricted, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail({ to })] })],
    });
    isRestricted.mockImplementation(
      async (_tenant: string, email: string) => email === 'zed@example.invalid'
    );

    await runInboxSync(deps);

    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('skips received mail when someone copied on it is restricted', async () => {
    const { prisma, isRestricted, deps } = setup({
      rounds: [round({ messages: [mail({ cc: ['zed@example.invalid'] })] })],
    });
    isRestricted.mockImplementation(
      async (_tenant: string, email: string) => email === 'zed@example.invalid'
    );

    await runInboxSync(deps);

    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('stays due while either folder has more to read', async () => {
    const { prisma, deps } = setup({ rounds: [round()], sent: [round({ complete: false })] });

    await runInboxSync(deps);

    expect(released(prisma).data.nextSyncAt).toEqual(NOW);
  });
});

describe('inboxSyncEnabled', () => {
  it('is on unless EMAIL_INBOX_SYNC=off', () => {
    expect(inboxSyncEnabled({})).toBe(true);
    expect(inboxSyncEnabled({ EMAIL_INBOX_SYNC: ' OFF ' })).toBe(false);
    expect(inboxSyncEnabled({ EMAIL_INBOX_SYNC: 'on' })).toBe(true);
  });
});
