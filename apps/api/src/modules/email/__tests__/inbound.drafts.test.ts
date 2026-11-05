/**
 * A draft belongs to the person writing it: it is theirs to list, reopen and
 * change, and reopening gives back everything compose needs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { inboundEmailRouter } from '../inbound.router';

const ME = TEST_UUIDS.user1;
const OTHER = TEST_UUIDS.user2;
const tenantId = TEST_UUIDS.tenant;

const draftRow = (over: Record<string, unknown> = {}) => ({
  id: 'draft-1',
  tenantId,
  userId: ME,
  subject: 'Quarterly note',
  body: '<p>Hello</p>',
  fromEmail: 'me@mail.example.invalid',
  toEmail: 'a@mail.example.invalid',
  ccEmails: 'c@mail.example.invalid',
  bccEmails: 'hidden@mail.example.invalid',
  status: 'PENDING',
  metadata: { isDraft: true, isHtml: true, threadId: 'thread-1' },
  attachments: [],
  sentAt: null,
  createdAt: new Date(Date.UTC(2026, 10, 1)),
  isRead: false,
  readAt: null,
  ...over,
});

const caller = () => inboundEmailRouter.createCaller(createTestContext());

describe('a draft and its thread', () => {
  const sent = () => draftRow({ id: 'sent-1', metadata: { threadId: 'thread-1' } });

  it('is not shown as part of the conversation, to anyone', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      sent(),
      draftRow({ userId: OTHER }),
      draftRow({ id: 'draft-2' }),
    ]);

    const thread = await caller().getThread({ threadId: 'thread-1', limit: 20 });

    expect(thread.emails.map((email) => email.id)).toEqual(['sent-1']);
  });

  it('does not count its recipients as participants', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      draftRow({ userId: OTHER, toEmail: 'private@mail.example.invalid', ccEmails: null }),
    ]);

    const thread = await caller().getThread({ threadId: 'thread-1', limit: 20 });

    expect(thread.participantCount).toBe(0);
    expect(thread.subject).toBe('');
  });

  it('cannot be read by another user through its own id', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(draftRow({ userId: OTHER }));

    const thread = await caller().getThread({ threadId: 'draft-1', limit: 20 });

    expect(thread.emails).toEqual([]);
  });

  it('can still be read by the person writing it through its own id', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(draftRow());

    const thread = await caller().getThread({ threadId: 'draft-1', limit: 20 });

    expect(thread.emails.map((email) => email.id)).toEqual(['draft-1']);
  });
});

beforeEach(() => {
  (prismaMock.emailRecord.findFirst as any).mockResolvedValue(null);
  (prismaMock.emailRecord.findMany as any).mockResolvedValue([]);
  (prismaMock.emailRecord.count as any).mockResolvedValue(0);
});

describe('reopening a draft', () => {
  it('returns its recipients, including bcc, and thread to its owner', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(draftRow());

    const email = await caller().getEmail({ emailId: 'draft-1' });

    expect(email).toMatchObject({
      isDraft: true,
      subject: 'Quarterly note',
      htmlBody: '<p>Hello</p>',
      threadId: 'thread-1',
      to: [expect.objectContaining({ address: 'a@mail.example.invalid' })],
      cc: [expect.objectContaining({ address: 'c@mail.example.invalid' })],
      bcc: [expect.objectContaining({ address: 'hidden@mail.example.invalid' })],
    });
  });

  it("does not return another user's draft", async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(draftRow({ userId: OTHER }));

    await expect(caller().getEmail({ emailId: 'draft-1' })).resolves.toBeNull();
  });

  it('never returns bcc for an email that is not a draft', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      draftRow({ metadata: { isHtml: true }, status: 'SENT' })
    );

    const email = await caller().getEmail({ emailId: 'draft-1' });

    expect(email).not.toBeNull();
    expect(email).not.toHaveProperty('bcc');
  });
});

describe('listing drafts', () => {
  it('lists only your own', async () => {
    await caller().listEmails({ folder: 'drafts' });

    const { where } = (prismaMock.emailRecord.findMany as any).mock.calls[0][0];
    expect(where).toMatchObject({ tenantId, userId: ME });
  });
});

describe('saving over a draft', () => {
  it('refuses a draft that is not yours', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(draftRow({ userId: OTHER }));

    await expect(caller().saveDraft({ id: 'draft-1', subject: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it('refuses a record that is not a draft', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(
      draftRow({ metadata: { isHtml: true } })
    );

    await expect(caller().saveDraft({ id: 'draft-1', subject: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.emailRecord.update).not.toHaveBeenCalled();
  });

  it('keeps the thread when a later save does not name it', async () => {
    (prismaMock.emailRecord.findFirst as any).mockResolvedValue(draftRow());
    (prismaMock.emailRecord.update as any).mockResolvedValue(draftRow());

    await caller().saveDraft({ id: 'draft-1', subject: 'Changed' });

    const { data } = (prismaMock.emailRecord.update as any).mock.calls[0][0];
    expect(data.metadata.threadId).toBe('thread-1');
  });
});
