/**
 * MVP-011: received mail from someone who is not yet a lead or contact is a new enquiry: it
 * becomes a new lead (source EMAIL, owned by the mailbox owner) and the mail is logged on it.
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
import { MAX_ENQUIRIES_PER_RUN, isAutomatedAddress } from '../mail-sync-enquiry';
import { TENANT, mail, round, setup } from './inbox-sync-harness';

function enquirySetup(options: Parameters<typeof setup>[0] = {}) {
  const own = { accountAddress: 'me@shop.example.invalid', fromAddress: 'me@shop.example.invalid' };
  const harness = setup({ ...options, mailbox: { ...own, ...options.mailbox } });
  const known = new Map<string, string>();
  const prisma = harness.prisma as any;
  prisma.contact.findFirst = vi.fn(async () => null);
  prisma.emailMailbox.findMany = vi.fn(async () => [
    { accountAddress: 'me@shop.example.invalid', fromAddress: 'me@shop.example.invalid' },
  ]);
  prisma.lead.findFirst = vi.fn(async ({ where }: any) => {
    const id = known.get(String(where.email?.equals ?? where.email).toLowerCase());
    return id ? { id } : null;
  });
  const createLead = vi.fn(async (props: any) => {
    const id = `lead-${known.size + 1}`;
    known.set(props.email, id);
    return { isFailure: false, value: { id: { value: id } } };
  });
  harness.deps.createLead = createLead as never;
  return { ...harness, prisma, createLead };
}

describe('enquiry from an unknown sender (MVP-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
    tokens.hasOAuthClient.mockReturnValue(true);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('creates a lead from the sender and logs the mail on it as received', async () => {
    const { prisma, deps, createLead } = enquirySetup({
      rounds: [round({ messages: [mail({ fromName: 'Ada Lovelace', subject: 'Boiler quote' })] })],
    });

    const report = await runInboxSync(deps);

    expect(createLead).toHaveBeenCalledTimes(1);
    expect(createLead).toHaveBeenCalledWith(
      {
        email: 'ada@example.invalid',
        firstName: 'Ada',
        lastName: 'Lovelace',
        source: 'EMAIL',
        ownerId: 'user-1',
        tenantId: TENANT,
      },
      { note: { content: 'Email enquiry: Boiler quote', author: 'System' } }
    );
    const data = prisma.emailRecord.create.mock.calls[0][0].data;
    expect(data.metadata).toMatchObject({ direction: 'inbound', leadId: 'lead-1' });
    expect(data.status).toBe('DELIVERED');
    expect(prisma.leadActivity.create).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ stored: 1, leadsCreated: 1, leadsCapped: 0 });
  });

  it('creates no lead for no-reply, mailer-daemon and bulk senders', async () => {
    const { prisma, deps, createLead } = enquirySetup({
      rounds: [
        round({
          messages: [
            mail({ providerMessageId: 'a', fromAddress: 'noreply@vendor.example.invalid' }),
            mail({ providerMessageId: 'b', fromAddress: 'no-reply@vendor.example.invalid' }),
            mail({ providerMessageId: 'c', fromAddress: 'MAILER-DAEMON@vendor.example.invalid' }),
            mail({ providerMessageId: 'd', fromAddress: 'news@list.example.invalid', bulk: true }),
          ],
        }),
      ],
    });

    const report = await runInboxSync(deps);

    expect(createLead).not.toHaveBeenCalled();
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(report).toMatchObject({ stored: 0, skipped: 4, leadsCreated: 0 });
    expect(isAutomatedAddress('donotreply@x.example.invalid')).toBe(true);
    expect(isAutomatedAddress('sam@x.example.invalid')).toBe(false);
  });

  it('creates no lead for the tenant own domain, but does for a free provider sender', async () => {
    const own = enquirySetup({
      rounds: [round({ messages: [mail({ fromAddress: 'colleague@shop.example.invalid' })] })],
    });
    await runInboxSync(own.deps);
    expect(own.createLead).not.toHaveBeenCalled();

    const free = enquirySetup({
      mailbox: { accountAddress: 'owner@gmail.com', fromAddress: 'owner@gmail.com' },
      rounds: [round({ messages: [mail({ fromAddress: 'customer@gmail.com' })] })],
    });
    free.prisma.emailMailbox.findMany = vi.fn(async () => []);
    await runInboxSync(free.deps);
    expect(free.createLead).toHaveBeenCalledTimes(1);
  });

  it('creates no lead from outbound mail', async () => {
    const { prisma, deps, createLead } = enquirySetup({
      rounds: [round({ messages: [] })],
      sent: [
        round({
          messages: [mail({ fromAddress: 'me@shop.example.invalid', to: ['x@y.example.invalid'] })],
        }),
      ],
    });

    await runInboxSync(deps);

    expect(createLead).not.toHaveBeenCalled();
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
  });

  it('gives one lead for the same sender twice, and the second mail lands on it', async () => {
    const { prisma, deps, createLead } = enquirySetup({
      rounds: [
        round({
          messages: [
            mail({
              providerMessageId: 'a',
              internetMessageId: '<a@x>',
              fromAddress: 'Sam@Example.invalid',
            }),
            mail({
              providerMessageId: 'b',
              internetMessageId: '<b@x>',
              fromAddress: 'sam@example.invalid',
            }),
          ],
        }),
      ],
    });

    const report = await runInboxSync(deps);

    expect(createLead).toHaveBeenCalledTimes(1);
    const leadIds = prisma.emailRecord.create.mock.calls.map(
      (call: any) => call[0].data.metadata.leadId
    );
    expect(leadIds).toEqual(['lead-1', 'lead-1']);
    expect(report).toMatchObject({ stored: 2, leadsCreated: 1 });
  });

  it('uses the lead another round created meanwhile when the use case refuses', async () => {
    const { prisma, deps, createLead } = enquirySetup();
    createLead.mockResolvedValueOnce({ isFailure: true } as never);
    prisma.lead.findFirst = vi
      .fn()
      .mockResolvedValueOnce(null) // the sender match
      .mockResolvedValueOnce({ id: 'lead-raced' }); // the re-read after the refusal

    await runInboxSync(deps);

    const data = prisma.emailRecord.create.mock.calls[0][0].data;
    expect(data.metadata.leadId).toBe('lead-raced');
  });

  it('skips the mail when the lead use case refuses and no lead exists', async () => {
    const { prisma, deps, createLead } = enquirySetup();
    createLead.mockResolvedValueOnce({ isFailure: true } as never);

    const report = await runInboxSync(deps);

    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(report).toMatchObject({ stored: 0, skipped: 1, leadsCreated: 0 });
  });

  it('skips the mail when the mailbox has no owner to assign the lead to', async () => {
    const { deps, createLead } = enquirySetup({ mailbox: { userId: null } });
    await runInboxSync(deps);
    expect(createLead).not.toHaveBeenCalled();
  });

  it('stays as before when no lead use case is wired', async () => {
    const { prisma, deps } = enquirySetup();
    deps.createLead = undefined;
    const report = await runInboxSync(deps);
    expect(prisma.emailRecord.create).not.toHaveBeenCalled();
    expect(report.skipped).toBe(1);
  });

  it('caps new leads per run and holds the rest for the next run', async () => {
    const total = MAX_ENQUIRIES_PER_RUN + 5;
    const messages = Array.from({ length: total }, (_, i) =>
      mail({
        providerMessageId: `g-${i}`,
        internetMessageId: `<m${i}@x>`,
        fromAddress: `person${i}@example.invalid`,
      })
    );
    const { prisma, deps, createLead } = enquirySetup({ rounds: [round({ messages })] });

    const report = await runInboxSync(deps);

    expect(createLead).toHaveBeenCalledTimes(MAX_ENQUIRIES_PER_RUN);
    expect(report).toMatchObject({
      stored: MAX_ENQUIRIES_PER_RUN,
      leadsCreated: MAX_ENQUIRIES_PER_RUN,
      leadsCapped: 5,
    });
    // The folder keeps its old cursor and stays due: the held mail is read again next run.
    const released = prisma.emailMailbox.update.mock.calls.at(-1)[0].data;
    expect(released.syncCursor).toBe('https://graph.microsoft.com/v1.0/me/delta-1');
    expect(released.nextSyncAt).toEqual(new Date('2026-11-15T10:00:00.000Z'));
  });
});
