/**
 * MVP-001 mailbox sync: which way a synced mail went, and who sent it. Mail read from the Inbox is
 * inbound, mail read from Sent is outbound; the email record and the lead's timeline entry carry
 * the direction and the sender, so the lead's Emails tab can say "Received" for a reply and
 * "My activity" can include the mail the owner sent (and not the mail they received).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { runInboxSync } from '../outlook-inbox-sync';
import { TENANT, mail, round, setup } from './inbox-sync-harness';

/** A lead the sender or the recipient is (no contact with that address). */
function leadSetup(options: Parameters<typeof setup>[0]) {
  const made = setup(options);
  made.prisma.contact.findFirst.mockResolvedValue(null as never);
  made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as never);
  return made;
}

/** The mail the owner sent to the lead, read from Sent. */
const sentMail = (overrides: Partial<SyncedMessage> = {}) =>
  mail({
    providerMessageId: 'graph-sent-1',
    internetMessageId: '<s1@mail.example.invalid>',
    fromAddress: 'me@example.invalid',
    fromName: 'Owner Name',
    to: ['ada@example.invalid'],
    ...overrides,
  });

const created = (
  prisma: ReturnType<typeof setup>['prisma'],
  table: 'emailRecord' | 'leadActivity'
) => (prisma[table].create.mock.calls[0] as unknown as [{ data: any }])[0].data;

describe('mailbox sync: direction and sender (MVP-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it("marks the lead's reply inbound, written by the lead and not by the owner", async () => {
    const { prisma, deps } = leadSetup({ rounds: [round({ messages: [mail()] })] });

    await runInboxSync(deps);

    const record = created(prisma, 'emailRecord');
    expect(record).toMatchObject({ status: 'DELIVERED', fromEmail: 'ada@example.invalid' });
    expect(record.metadata).toMatchObject({ direction: 'inbound', fromName: 'Ada' });
    // The entry on the lead: the sender's name, no user id (so it is not the owner's activity).
    expect(created(prisma, 'leadActivity')).toEqual({
      type: 'EMAIL',
      title: 'Pricing',
      timestamp: new Date('2026-11-14T09:00:00.000Z'),
      userId: null,
      userName: 'Ada',
      leadId: 'lead-1',
      tenantId: TENANT,
      metadata: {
        emailRecordId: 'rec-1',
        source: 'mailbox-sync',
        direction: 'inbound',
        from: 'ada@example.invalid',
        fromName: 'Ada',
      },
    });
  });

  it('marks the mail the owner sent outbound, under the owner and the name it was sent as', async () => {
    const { prisma, deps } = leadSetup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail()] })],
    });

    await runInboxSync(deps);

    const record = created(prisma, 'emailRecord');
    expect(record).toMatchObject({
      status: 'SENT',
      fromEmail: 'me@example.invalid',
      userId: 'user-1',
    });
    expect(record.metadata).toMatchObject({ direction: 'outbound', fromName: 'Owner Name' });
    // The entry is the owner's own: their id and name, so "My activity" includes it.
    expect(created(prisma, 'leadActivity')).toMatchObject({
      userId: 'user-1',
      userName: 'Owner Name',
      metadata: {
        direction: 'outbound',
        from: 'me@example.invalid',
        fromName: 'Owner Name',
        source: 'mailbox-sync',
      },
    });
  });

  it('names the author by address when the mail carries no display name', async () => {
    const { prisma, deps } = leadSetup({
      rounds: [round({ messages: [mail({ fromName: null })] })],
    });

    await runInboxSync(deps);

    expect(created(prisma, 'emailRecord').metadata).not.toHaveProperty('fromName');
    const activity = created(prisma, 'leadActivity');
    expect(activity.userName).toBe('ada@example.invalid');
    expect(activity.metadata).not.toHaveProperty('fromName');
  });

  it("uses the mailbox's own address as the sender of sent mail that names none", async () => {
    const { prisma, deps } = leadSetup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail({ fromAddress: null, fromName: null })] })],
    });

    await runInboxSync(deps);

    expect(created(prisma, 'emailRecord').fromEmail).toBe('me@example.invalid');
    expect(created(prisma, 'leadActivity')).toMatchObject({
      userId: 'user-1',
      userName: 'me@example.invalid',
      metadata: { from: 'me@example.invalid' },
    });
  });

  it('records the direction on mail with a contact too (no lead, so no timeline entry)', async () => {
    const { prisma, deps } = setup({
      rounds: [round({ messages: [] })],
      sent: [round({ messages: [sentMail()] })],
    });

    await runInboxSync(deps);

    expect(created(prisma, 'emailRecord').metadata).toMatchObject({ direction: 'outbound' });
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });
});
