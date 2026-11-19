/**
 * MVP-012 PR C on top of MVP-011: an enquiry from an unknown sender becomes a lead, and that new
 * lead is what Aurora drafts a reply to (the whole point for a customer's first enquiry).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: () => [],
}));
const drafts = vi.hoisted(() => ({ queue: vi.fn(async () => true) }));
vi.mock('../mail-sync-reply-draft', () => ({ queueReplyDraftForSyncedMail: drafts.queue }));

import { runInboxSync } from '../outlook-inbox-sync';
import { mail, round, setup } from './inbox-sync-harness';

/** A mailbox whose owner has no lead or contact for the sender: a new enquiry. */
function enquirySetup(messages: ReturnType<typeof mail>[]) {
  const own = { accountAddress: 'me@shop.example.invalid', fromAddress: 'me@shop.example.invalid' };
  const harness = setup({ mailbox: own, rounds: [round({ messages })] });
  const prisma = harness.prisma as any;
  prisma.contact.findFirst = vi.fn(async () => null);
  prisma.lead.findFirst = vi.fn(async () => null);
  prisma.emailMailbox.findMany = vi.fn(async () => [own]);
  prisma.dsarRequest = { findFirst: vi.fn(async () => null) };
  prisma.leadNote = { create: vi.fn(async () => ({})) };
  harness.deps.createLead = vi.fn(async () => ({
    isFailure: false,
    value: { id: { value: 'lead-1' } },
  })) as never;
  return harness;
}

describe('a draft for an enquiry from an unknown sender (MVP-012 PR C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('asks for a reply draft on the lead made from the sender', async () => {
    const { deps } = enquirySetup([mail({ fromName: 'Ada Lovelace', subject: 'Boiler quote' })]);
    await runInboxSync(deps);
    expect(drafts.queue).toHaveBeenCalledTimes(1);
    const [, , message, folder, party, recordId] = drafts.queue.mock.calls[0] as unknown[];
    expect(message).toMatchObject({ subject: 'Boiler quote' });
    expect(folder).toBe('inbox');
    expect(party).toMatchObject({ leadId: 'lead-1', contactId: null });
    expect(recordId).toBe('rec-1');
  });

  it('not for mail that was held back as no enquiry (an automated sender)', async () => {
    const { deps } = enquirySetup([mail({ fromAddress: 'noreply@shop.example.invalid' })]);
    await runInboxSync(deps);
    expect(drafts.queue).not.toHaveBeenCalled();
  });
});
