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

const caller = () => {
  const base = createTestContext() as any;
  return replyDraftRouter.createCaller({
    ...base,
    adapters: { ...base.adapters, mailboxTransports: { oauth: vi.fn() }, storageService: {} },
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(leadDraft());
  (prismaMock.lead.findFirst as any).mockResolvedValue({ id: LEAD });
  (prismaMock.contactReplyDraft.updateMany as any).mockResolvedValue({ count: 1 });
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'email-draft-1' });
  dispatch.mockResolvedValue({ id: 'email-1', status: 'SENT', skipped: [] });
});

describe('a lead draft (MVP-012 PR B)', () => {
  it('is sent to the lead’s address and linked to the lead, not a contact', async () => {
    await caller().send({ draftId: 'draft-l1' });
    const [, input, , options] = dispatch.mock.calls[0]!;
    expect(input).toMatchObject({ to: [LEAD_EMAIL], purpose: 'SERVICE' });
    expect(options.metadata).toMatchObject({ replyDraftId: 'draft-l1', leadId: LEAD });
    expect(options.metadata).not.toHaveProperty('contactId');
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
    expect(data).toMatchObject({ toEmail: LEAD_EMAIL, metadata: { leadId: LEAD, isDraft: true } });
    expect(dispatch).not.toHaveBeenCalled();
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
