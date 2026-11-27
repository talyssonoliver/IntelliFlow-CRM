/**
 * MVP-012 #34: a lead made from an email enquiry gets the same AI scoring job as a manually
 * created lead (queueLeadAi, wired in production to enqueueLeadAiById).
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

import { runInboxSync } from '../outlook-inbox-sync';
import { TENANT, mail, round, setup } from './inbox-sync-harness';

function enquirySetup(options: Parameters<typeof setup>[0] = {}) {
  const own = { accountAddress: 'me@shop.example.invalid', fromAddress: 'me@shop.example.invalid' };
  const harness = setup({ ...options, mailbox: { ...own, ...options.mailbox } });
  const prisma = harness.prisma as any;
  prisma.contact.findFirst = vi.fn(async () => null);
  prisma.emailMailbox.findMany = vi.fn(async () => [
    { accountAddress: 'me@shop.example.invalid', fromAddress: 'me@shop.example.invalid' },
  ]);
  prisma.dsarRequest = { findFirst: vi.fn(async () => null) };
  prisma.leadNote = { create: vi.fn(async () => ({})) };
  prisma.lead.findFirst = vi.fn(async () => null);
  const createLead = vi.fn(async () => ({ isFailure: false, value: { id: { value: 'lead-1' } } }));
  const queueLeadAi = vi.fn(async (_ref: unknown) => undefined);
  harness.deps.createLead = createLead as never;
  harness.deps.queueLeadAi = queueLeadAi;
  return { ...harness, prisma, createLead, queueLeadAi };
}

describe('enquiry lead is queued for AI scoring (#34)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
    tokens.hasOAuthClient.mockReturnValue(true);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('queues scoring for the lead an enquiry creates', async () => {
    const { deps, queueLeadAi } = enquirySetup({
      rounds: [round({ messages: [mail({ fromName: 'Ada Lovelace', subject: 'Boiler quote' })] })],
    });

    await runInboxSync(deps);

    expect(queueLeadAi).toHaveBeenCalledTimes(1);
    expect(queueLeadAi).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', tenantId: TENANT })
    );
  });

  it('still stores the mail and counts the lead when the enqueue fails', async () => {
    const { deps, queueLeadAi } = enquirySetup({
      rounds: [round({ messages: [mail({ fromName: 'Ada Lovelace' })] })],
    });
    queueLeadAi.mockRejectedValue(new Error('redis down'));

    const report = await runInboxSync(deps);

    expect(report).toMatchObject({ stored: 1, leadsCreated: 1 });
  });

  it('queues nothing when no lead is created (no-reply sender)', async () => {
    const { deps, createLead, queueLeadAi } = enquirySetup({
      rounds: [round({ messages: [mail({ fromAddress: 'no-reply@example.invalid' })] })],
    });

    await runInboxSync(deps);

    expect(createLead).not.toHaveBeenCalled();
    expect(queueLeadAi).not.toHaveBeenCalled();
  });
});
