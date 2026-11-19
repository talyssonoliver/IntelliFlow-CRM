/**
 * MVP-012 PR B: a reply Aurora drafted to a LEAD (an enquiry that arrived as a lead) waits on the
 * lead's Emails tab. It is listed with listForLead, sent to the lead's address, linked to the
 * lead, and scoped by the lead pages' own access rule. Nothing is sent without the Send click.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('../../email/mailbox-sender', () => ({ dispatchUserMail: dispatch }));

import { replyDraftRouter } from '../reply-draft.router';

const LEAD = TEST_UUIDS.lead1;
const LEAD_EMAIL = 'robert@handyman.example.invalid';

const leadDraft = (over: Record<string, unknown> = {}) => ({
  id: 'draft-l1',
  tenantId: TEST_UUIDS.tenant,
  contactId: null,
  leadId: LEAD,
  status: 'DRAFT',
  draftSubject: 'Re: Fence repair quote',
  draftBody: 'Hi Robert,\n\nThursday morning works.',
  contact: null,
  lead: { email: LEAD_EMAIL },
  ...over,
});

const restrictions = { status: vi.fn(async (_t: string, _a: string) => ({ restricted: false })) };

const caller = () => {
  const base = createTestContext() as any;
  return replyDraftRouter.createCaller({
    ...base,
    adapters: {
      ...base.adapters,
      mailboxTransports: { oauth: vi.fn() },
      storageService: {},
      processingRestrictionRepository: restrictions,
    },
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  restrictions.status.mockResolvedValue({ restricted: false });
  (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(leadDraft());
  (prismaMock.lead.findFirst as any).mockResolvedValue({ id: LEAD });
  (prismaMock.contactReplyDraft.updateMany as any).mockResolvedValue({ count: 1 });
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'email-draft-1' });
  dispatch.mockResolvedValue({ id: 'email-1', status: 'SENT', skipped: [] });
});

describe('a lead draft (MVP-012 PR B)', () => {
  it('is sent to the lead’s address and put on the lead’s Emails tab (an EMAIL activity)', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue({ contactId: null, metadata: {} });
    (prismaMock.leadActivity.create as any).mockResolvedValue({ id: 'act-9' });
    await caller().send({ draftId: 'draft-l1' });
    const [, input, , options] = dispatch.mock.calls[0]!;
    expect(input).toMatchObject({ to: [LEAD_EMAIL], purpose: 'SERVICE' });
    expect(options.metadata).toMatchObject({ replyDraftId: 'draft-l1', source: 'ai-reply' });
    // The link is made after the send, the way "Log to contact" makes it (codex): the activity
    // the Emails tab reads, then the email records the lead and that activity.
    expect((prismaMock.leadActivity.create as any).mock.calls[0][0].data).toMatchObject({
      type: 'EMAIL',
      title: 'Re: Fence repair quote',
      leadId: LEAD,
      tenantId: TEST_UUIDS.tenant,
      metadata: { emailRecordId: 'email-1', source: 'ai-reply' },
    });
    expect((prismaMock.emailRecord.update as any).mock.calls[0][0]).toMatchObject({
      where: { id: 'email-1' },
      data: { metadata: { leadId: LEAD, leadActivityId: 'act-9' } },
    });
    // Scoped by the lead's own access rule; no contact is looked up.
    expect((prismaMock.lead.findFirst as any).mock.calls[0][0].where).toMatchObject({
      id: LEAD,
      tenantId: TEST_UUIDS.tenant,
    });
    expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
  });

  it('opens in Compose addressed to the lead, linked to the lead', async () => {
    await expect(caller().openInCompose({ draftId: 'draft-l1' })).resolves.toEqual({
      emailDraftId: 'email-draft-1',
    });
    const data = (prismaMock.emailRecord.create as any).mock.calls[0][0].data;
    // Not marked as logged before it is sent: Compose sends it, and the user can log it then.
    expect(data).toMatchObject({
      toEmail: LEAD_EMAIL,
      metadata: { replyDraftId: 'draft-l1', isDraft: true },
    });
    expect(data.metadata).not.toHaveProperty('leadId');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('stays sent when putting it on the timeline fails: the mail has gone, it is never resent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (prismaMock.$transaction as any).mockRejectedValueOnce(new Error('lock timeout'));
    await expect(caller().send({ draftId: 'draft-l1' })).resolves.toMatchObject({ status: 'SENT' });
    const moves = (prismaMock.contactReplyDraft.updateMany as any).mock.calls.map(
      (c: any[]) => c[0].data.status
    );
    expect(moves).toEqual(['SENDING', 'SENT']);
    expect(warn).toHaveBeenCalledWith(
      '[reply-draft] sent reply not linked to its timeline',
      expect.anything()
    );
    warn.mockRestore();
  });

  it('is not put on the timeline of a person with a processing restriction, and stays sent', async () => {
    restrictions.status.mockResolvedValue({ restricted: true });
    await expect(caller().send({ draftId: 'draft-l1' })).resolves.toMatchObject({ status: 'SENT' });
    expect(restrictions.status).toHaveBeenCalledWith(TEST_UUIDS.tenant, LEAD_EMAIL);
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it('does not exist for a user outside the lead’s owner or team scope', async () => {
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    for (const act of ['send', 'openInCompose', 'dismiss'] as const) {
      await expect(caller()[act]({ draftId: 'draft-l1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(prismaMock.contactReplyDraft.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a lead with no address before taking the draft', async () => {
    (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(
      leadDraft({ lead: { email: null } })
    );
    await expect(caller().send({ draftId: 'draft-l1' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prismaMock.contactReplyDraft.updateMany).not.toHaveBeenCalled();
  });
});

describe('replyDraft.listForLead (MVP-012 PR B)', () => {
  it('lists the lead’s drafts, waiting ones first, dismissed ones left out', async () => {
    const createdAt = new Date('2026-11-19T10:00:00Z');
    (prismaMock.contactReplyDraft.findMany as any).mockResolvedValue([
      {
        id: 'd1',
        draftSubject: 's',
        draftBody: 'b',
        tone: null,
        status: 'DRAFT',
        confidence: 0.8,
        modelVersion: 'v1',
        createdAt,
      },
    ]);
    const result = await caller().listForLead({ leadId: LEAD });
    expect(result.drafts).toEqual([
      expect.objectContaining({ id: 'd1', leadId: LEAD, status: 'DRAFT', createdAt }),
    ]);
    const args = (prismaMock.contactReplyDraft.findMany as any).mock.calls[0][0];
    expect(args).toMatchObject({
      where: { tenantId: TEST_UUIDS.tenant, leadId: LEAD, status: { not: 'DISMISSED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 5,
    });
  });

  it('lists nothing for a lead outside the caller’s scope', async () => {
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    await expect(caller().listForLead({ leadId: LEAD })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.contactReplyDraft.findMany).not.toHaveBeenCalled();
  });
});
