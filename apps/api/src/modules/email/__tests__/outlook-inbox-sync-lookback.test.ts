/**
 * MVP-011: the look-back as the sync engine runs it. A mailbox that never looked reads 90 days for
 * the leads and contacts created since, logs mail with them, and stays due until it is done. It
 * creates no enquiry leads and queues no reply drafts for old mail, and it never fails the sync.
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
const drafts = vi.hoisted(() => ({ queue: vi.fn(async () => true) }));
vi.mock('../mail-sync-reply-draft', () => ({ queueReplyDraftForSyncedMail: drafts.queue }));

import { runInboxSync, INBOX_SYNC_INTERVAL_MS } from '../outlook-inbox-sync';
import { PASS_GAP_MS } from '../mail-sync-lookback';
import { NOW, TENANT, mail, released, round, setup } from './inbox-sync-harness';

const CREATED = new Date('2026-11-17T10:00:00.000Z');
const ROBERT = 'robert@example.invalid';

/** A workspace where Robert's lead exists and the mailbox has not looked back yet. */
function withRobert(options: Parameters<typeof setup>[0] = {}) {
  const made = setup(options);
  made.prisma.lead.findMany.mockResolvedValue([{ email: ROBERT, createdAt: CREATED }]);
  return made;
}

const fromRobert = (id: string) =>
  mail({ providerMessageId: id, internetMessageId: `<${id}@x.invalid>`, fromAddress: ROBERT });
const toRobert = (id: string) =>
  mail({
    providerMessageId: id,
    internetMessageId: `<${id}@x.invalid>`,
    fromAddress: 'me@example.invalid',
    to: [ROBERT],
  });

describe('mailbox sync look-back (MVP-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('reads 90 days of both folders after the normal sync and logs mail with the new lead', async () => {
    const made = withRobert({
      // The normal sync's rounds come first, then the look-back's.
      rounds: [round({ messages: [] }), round({ messages: [fromRobert('old-in')] })],
      sent: [round({ messages: [] }), round({ messages: [toRobert('old-out')] })],
    });
    made.prisma.contact.findFirst.mockResolvedValue(null as never);
    made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-robert' } as never);

    const report = await runInboxSync(made.deps);

    const reads = made.readDelta.mock.calls.map(([, cursor, options]) => [
      options.folder,
      cursor,
      options.initialDays,
    ]);
    expect(reads.at(-2)).toEqual(['sentitems', null, 90]);
    expect(reads.at(-1)).toEqual(['inbox', null, 90]);
    const stored = (made.prisma.emailRecord.create.mock.calls as unknown as [{ data: any }][]).map(
      ([call]) => [call.data.providerMessageId, call.data.status]
    );
    expect(stored).toEqual([
      ['old-out', 'SENT'],
      ['old-in', 'DELIVERED'],
    ]);
    // Both are on the lead's timeline too, dated when they were sent or received.
    expect(made.prisma.leadActivity.create).toHaveBeenCalledTimes(2);
    expect(report.stored).toBe(2);
  });

  it('writes its progress with the round, and waits one pacing gap before the next batch', async () => {
    const made = withRobert();

    await runInboxSync(made.deps);

    expect(released(made.prisma).data).toMatchObject({
      lookbackWatermark: CREATED,
      lookbackUntil: null,
      lookbackCursor: null,
      lookbackSentCursor: null,
      // Pacing: the next batch is not due before the gap, and the sync is not due before it either.
      lookbackNextAt: new Date(NOW.getTime() + PASS_GAP_MS),
      nextSyncAt: new Date(NOW.getTime() + INBOX_SYNC_INTERVAL_MS),
    });
  });

  it('waits the normal interval once there is nothing left to look for', async () => {
    const made = setup();

    await runInboxSync(made.deps);

    const data = released(made.prisma).data;
    expect(data).not.toHaveProperty('lookbackWatermark');
    expect(data.nextSyncAt).toEqual(new Date(NOW.getTime() + INBOX_SYNC_INTERVAL_MS));
  });

  it('creates no enquiry lead and queues no reply draft for old mail', async () => {
    const createLead = vi.fn(async () => 'lead-new');
    const made = withRobert({
      rounds: [round({ messages: [] }), round({ messages: [fromRobert('old-in')] })],
    });
    made.deps.createLead = createLead as never;
    made.prisma.contact.findFirst.mockResolvedValue(null as never);
    made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-robert' } as never);

    await runInboxSync(made.deps);

    expect(made.prisma.emailRecord.create).toHaveBeenCalledTimes(1);
    expect(createLead).not.toHaveBeenCalled();
    expect(drafts.queue).not.toHaveBeenCalled();
  });

  it('still queues a reply draft for new mail of the normal sync', async () => {
    const made = withRobert({ rounds: [round({ messages: [fromRobert('new-in')] })] });
    made.prisma.contact.findFirst.mockResolvedValue(null as never);
    made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-robert' } as never);

    await runInboxSync(made.deps);

    expect(drafts.queue).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: mail already logged is not logged again', async () => {
    const made = withRobert({
      rounds: [round({ messages: [] }), round({ messages: [fromRobert('old-in')] })],
    });
    made.prisma.contact.findFirst.mockResolvedValue(null as never);
    made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-robert' } as never);
    made.prisma.emailRecord.findFirst.mockResolvedValue({ id: 'rec-0', metadata: {} } as never);

    const report = await runInboxSync(made.deps);

    expect(made.prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(report.stored).toBe(0);
  });

  it('never stores mail with a person who has a processing restriction', async () => {
    const made = withRobert({
      rounds: [round({ messages: [] }), round({ messages: [fromRobert('old-in')] })],
    });
    made.isRestricted.mockResolvedValue(true);

    await runInboxSync(made.deps);

    expect(made.isRestricted).toHaveBeenCalledWith(TENANT, ROBERT);
    expect(made.prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('a look-back failure never fails the sync or moves the normal cursors back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const made = withRobert({ rounds: [round({ messages: [] })] });
    made.readDelta.mockImplementation(async (_token, _cursor, options) => {
      // The normal sync's reads work; the look-back's (90 days) fail.
      if (options.initialDays === 90) throw new Error('provider refuses the window');
      return round({ messages: [] });
    });

    const report = await runInboxSync(made.deps);

    expect(report).toMatchObject({ mailboxesSynced: 1, failures: 0 });
    const data = released(made.prisma).data;
    expect(data).toMatchObject({ syncFailureCount: 0 });
    expect(data).not.toHaveProperty('lookbackWatermark');
    warn.mockRestore();
  });
});

describe('mailbox allowlist at the sync (register #58)', () => {
  it('does not read a mailbox that is not on its tenant allowlist', async () => {
    vi.stubEnv(
      `MAILBOX_CONNECT_ALLOWLIST_${TENANT.toUpperCase().replaceAll('-', '_')}`,
      'a@b.example'
    );
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const made = setup();

    await runInboxSync(made.deps);

    expect(made.readDelta).not.toHaveBeenCalled();
    expect(tokens.getOAuthAccess).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not on the tenant allowlist'),
      expect.objectContaining({ tenantId: TENANT })
    );
    vi.unstubAllEnvs();
    warn.mockRestore();
  });
});
