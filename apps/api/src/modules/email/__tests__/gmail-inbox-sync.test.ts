/**
 * MVP-011: a Google Workspace mailbox that granted gmail.readonly is synced like Outlook and Zoho.
 * The INBOX label is received mail (inbound), the SENT label mail sent from Gmail itself
 * (outbound); the direction is stored on the email record and the lead's timeline entry, so the
 * lead's Emails tab shows the enquiry as Received. A mailbox that sends only is not read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: (kind: string) => [`EMAIL_OAUTH_${kind}_CLIENT_ID`],
}));

import { runInboxSync } from '../outlook-inbox-sync';
import { PRODUCTION_READERS, gmailReader, hasGmailRead, type SyncRound } from '../mail-sync-reader';
import { NOW, mail, round, setup } from './inbox-sync-harness';

const SEND = 'https://www.googleapis.com/auth/gmail.send';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';

/** A Gmail mailbox wired to a fake `readGmailLabel`, its rounds queued per label. */
function gmailSetup(labels: Partial<Record<'INBOX' | 'SENT', SyncRound[]>>, scopes = [SEND, READ]) {
  const made = setup({ mailbox: { kind: 'GMAIL', grantedScopes: scopes, syncSentCursor: null } });
  made.prisma.contact.findFirst.mockResolvedValue(null as never);
  made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as never);
  const queues = { INBOX: [...(labels.INBOX ?? [])], SENT: [...(labels.SENT ?? [])] };
  const readLabel = vi.fn(
    async (_token: string, _cursor: string | null, options: { label: 'INBOX' | 'SENT' }) =>
      queues[options.label].shift() ?? round({ messages: [], cursor: '{"h":"2"}' })
  );
  made.deps.readers = { GMAIL: gmailReader(readLabel as never) };
  return { ...made, readLabel };
}

const record = (prisma: ReturnType<typeof setup>['prisma'], call = 0) =>
  (prisma.emailRecord.create.mock.calls[call] as unknown as [{ data: any }])[0].data;

describe('Gmail mailbox sync (MVP-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('reads Sent then the Inbox, by Gmail label, with the stored cursors', async () => {
    const { deps, readLabel } = gmailSetup({});
    await runInboxSync(deps);
    expect(readLabel.mock.calls.map((c) => c[2].label)).toEqual(['SENT', 'INBOX']);
    expect(readLabel.mock.calls[0]?.[2]).toMatchObject({ initialDays: 30, now: NOW });
    expect(readLabel.mock.calls[0]?.[0]).toBe('access-for-tests');
  });

  it("lands a lead's enquiry as inbound Gmail mail on the lead's timeline", async () => {
    const enquiry = mail({ providerMessageId: 'gm-1', subject: 'Booking enquiry' });
    const { prisma, deps } = gmailSetup({
      INBOX: [round({ messages: [enquiry], cursor: '{"h":"9"}' })],
    });
    await runInboxSync(deps);
    const data = record(prisma);
    expect(data).toMatchObject({
      provider: 'GMAIL',
      providerMessageId: 'gm-1',
      status: 'DELIVERED',
    });
    expect(data.metadata).toMatchObject({
      direction: 'inbound',
      folder: 'inbox',
      leadId: 'lead-1',
    });
    const activity = (prisma.leadActivity.create.mock.calls[0] as unknown as [{ data: any }])[0]
      .data;
    expect(activity).toMatchObject({
      type: 'EMAIL',
      leadId: 'lead-1',
      metadata: { direction: 'inbound' },
    });
    const saved = (prisma.emailMailbox.update.mock.calls.at(-1) as unknown as [{ data: any }])[0]
      .data;
    expect(saved.syncCursor).toBe('{"h":"9"}');
  });

  it('logs mail the owner sent from Gmail itself as outbound', async () => {
    const sent = mail({
      providerMessageId: 'gm-s1',
      fromAddress: 'me@example.invalid',
      to: ['ada@example.invalid'],
    });
    const { prisma, deps } = gmailSetup({ SENT: [round({ messages: [sent] })] });
    await runInboxSync(deps);
    expect(record(prisma)).toMatchObject({ provider: 'GMAIL', status: 'SENT', userId: 'user-1' });
    expect(record(prisma).metadata).toMatchObject({ direction: 'outbound', folder: 'sentitems' });
  });

  it('does not read a Gmail mailbox that sends only (its admin has not trusted Aurora)', async () => {
    const { prisma, deps, readLabel } = gmailSetup({}, [SEND]);
    await runInboxSync(deps);
    expect(readLabel).not.toHaveBeenCalled();
    const saved = (prisma.emailMailbox.update.mock.calls.at(-1) as unknown as [{ data: any }])[0]
      .data;
    // Checked again daily: the admin may trust Aurora and the user reconnect meanwhile.
    expect(saved.nextSyncAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60_000);
  });

  it('production registers the Gmail reader', () => {
    expect(PRODUCTION_READERS.GMAIL?.provider).toBe('GMAIL');
  });
});

describe('hasGmailRead', () => {
  it.each([
    [[SEND, READ], true],
    [['gmail.readonly'], true],
    [['https://www.googleapis.com/auth/gmail.modify'], true],
    [['https://mail.google.com/'], true],
    [[SEND], false],
    [['https://www.googleapis.com/auth/gmail.metadata'], false],
    [[], false],
  ])('%j → %s', (scopes, expected) => {
    expect(hasGmailRead(scopes)).toBe(expected);
  });
});
