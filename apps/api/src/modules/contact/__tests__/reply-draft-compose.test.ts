/**
 * MVP-012: a reply drafted by Aurora, edited in Compose and sent from there, lands on the lead's
 * Emails tab like one sent with Send (codex). The send itself is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('../../email/mailbox-sender', () => ({ dispatchUserMail: dispatch }));

import { sendComposedEmail } from '../reply-draft-compose';

const LEAD = TEST_UUIDS.lead1;
const message = {
  to: ['robert@handyman.example.invalid'],
  // The user changed the subject in Compose (the AI draft said 'Re: Fence repair quote').
  subject: 'Fence quote: Thursday 10am',
  htmlBody: '<p>Thursday works, edited.</p>',
};
const restrictions = { status: vi.fn(async () => ({ restricted: false })) };
const deps = { transports: {} as never, storage: {} as never };
const ctx = () => {
  const base = createTestContext() as any;
  return {
    ...base,
    adapters: { ...base.adapters, processingRestrictionRepository: restrictions },
  } as never;
};

beforeEach(() => {
  vi.clearAllMocks();
  dispatch.mockResolvedValue({ id: 'email-7', status: 'SENT', skipped: [] });
  // The Compose draft came from an AI draft (Edit).
  (prismaMock.emailRecord.findFirst as any).mockImplementation(async ({ where }: any) => {
    if (where.id === 'compose-1') return { metadata: { isDraft: true, replyDraftId: 'draft-l1' } };
    // The sent email, as linking re-reads it under its row lock.
    if (where.id?.startsWith('email-')) return { contactId: null, metadata: {} };
    return null;
  });
  (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue({
    id: 'draft-l1',
    tenantId: TEST_UUIDS.tenant,
    contactId: null,
    leadId: LEAD,
    status: 'EDITED',
    draftSubject: 'Re: Fence repair quote',
    draftBody: 'Thursday works.',
    contact: null,
    lead: { email: 'robert@handyman.example.invalid' },
  });
  (prismaMock.lead.findFirst as any).mockResolvedValue({ id: LEAD });
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.leadActivity.create as any).mockResolvedValue({ id: 'act-1' });
});

describe('sendComposedEmail (MVP-012)', () => {
  it('sends the message as before, without the draft id', async () => {
    await sendComposedEmail(ctx(), { ...message, draftId: 'compose-1' }, deps);
    expect(dispatch.mock.calls[0]![1]).toEqual(message);
  });

  it('puts an edited reply drafted by Aurora on the lead’s Emails tab once sent', async () => {
    await expect(
      sendComposedEmail(ctx(), { ...message, draftId: 'compose-1' }, deps)
    ).resolves.toMatchObject({ id: 'email-7', status: 'SENT' });
    // Only the user's own Compose draft is read.
    expect((prismaMock.emailRecord.findFirst as any).mock.calls[0][0].where).toEqual({
      id: 'compose-1',
      tenantId: TEST_UUIDS.tenant,
      userId: TEST_UUIDS.user1,
    });
    expect((prismaMock.leadActivity.create as any).mock.calls[0][0].data).toMatchObject({
      type: 'EMAIL',
      // The timeline shows the subject actually sent, not the AI draft's (codex).
      title: 'Fence quote: Thursday 10am',
      leadId: LEAD,
      metadata: { emailRecordId: 'email-7', source: 'ai-reply' },
    });
  });

  it('links nothing for an ordinary email, or a send that did not go out', async () => {
    await sendComposedEmail(ctx(), message, deps);
    await sendComposedEmail(ctx(), { ...message, draftId: 'compose-other' }, deps);
    dispatch.mockResolvedValueOnce({ id: 'email-8', status: 'FAILED', skipped: [] });
    await sendComposedEmail(ctx(), { ...message, draftId: 'compose-1' }, deps);
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it('never fails a sent email when linking it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(null);
    await expect(
      sendComposedEmail(ctx(), { ...message, draftId: 'compose-1' }, deps)
    ).resolves.toMatchObject({ status: 'SENT' });
    expect(warn).toHaveBeenCalledWith(
      '[reply-draft] composed reply not linked to its timeline',
      expect.anything()
    );
    warn.mockRestore();
  });
});
