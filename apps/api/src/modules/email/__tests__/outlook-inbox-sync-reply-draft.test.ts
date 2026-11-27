/**
 * MVP-012 PR C: the sync engine asks for a reply draft once a mail is stored, with that mail's
 * record id, and not for mail it does not store.
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

import { runInboxSync } from '../outlook-inbox-sync';
import { mail, round, setup } from './inbox-sync-harness';

describe('mailbox sync asks for a reply draft (MVP-012 PR C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('after storing a received mail on a lead, with its record id', async () => {
    const made = setup({ rounds: [round({ messages: [mail({ providerMessageId: 'in-1' })] })] });
    made.prisma.contact.findFirst.mockResolvedValue(null as never);
    made.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as never);

    await runInboxSync(made.deps);

    expect(drafts.queue).toHaveBeenCalledTimes(1);
    const [, mailbox, message, folder, party, recordId] = drafts.queue.mock.calls[0] as unknown[];
    expect(mailbox).toMatchObject({ id: 'mbx-1' });
    expect(message).toMatchObject({ providerMessageId: 'in-1' });
    expect(folder).toBe('inbox');
    expect(party).toMatchObject({ leadId: 'lead-1', contactId: null });
    expect(recordId).toBe('rec-1');
  });

  it('not for mail that is not stored (already logged, or nobody it belongs to)', async () => {
    const made = setup({ rounds: [round({ messages: [mail()] })] });
    made.prisma.contact.findFirst.mockResolvedValue(null as never);
    made.prisma.lead.findFirst.mockResolvedValue(null as never);
    await runInboxSync(made.deps);

    const logged = setup({ rounds: [round({ messages: [mail()] })] });
    logged.prisma.emailRecord.findFirst.mockResolvedValue({ id: 'rec-0', metadata: {} } as never);
    await runInboxSync(logged.deps);

    expect(drafts.queue).not.toHaveBeenCalled();
  });
});
