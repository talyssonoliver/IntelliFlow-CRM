/**
 * MVP-012: approving an AI-drafted reply. Send goes through the user's mailbox (the Compose path)
 * and is recorded as sent; Edit hands the draft to Compose as an ordinary email draft; Dismiss
 * sets it aside. A draft is acted on once, and nothing is ever sent without the Send click.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('../../email/mailbox-sender', () => ({ dispatchUserMail: dispatch }));

import { draftBodyHtml, replyDraftRouter } from '../reply-draft.router';

const TO = 'enquiries@handyman.example.invalid';
const BODY = 'Hi Sam,\n\nThanks for getting in touch.\nFriday at 10 works <b>fine</b>.';

const draftRow = (over: Record<string, unknown> = {}) => ({
  id: 'draft-1',
  tenantId: TEST_UUIDS.tenant,
  contactId: TEST_UUIDS.contact1,
  status: 'DRAFT',
  draftSubject: 'Re: Gutter repair',
  draftBody: BODY,
  contact: { email: TO },
  ...over,
});

const transports = { oauth: vi.fn(), zoho: null, smtp: {}, imap: {} };
const caller = () => {
  const base = createTestContext() as any;
  return replyDraftRouter.createCaller({
    ...base,
    adapters: { ...base.adapters, mailboxTransports: transports, storageService: {} },
  } as never);
};

/** The status moves asked for, as [from, to]. */
const moves = () =>
  (prismaMock.contactReplyDraft.updateMany as any).mock.calls.map((c: any[]) => [
    c[0].where.status,
    c[0].data.status,
  ]);

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(draftRow());
  (prismaMock.contactReplyDraft.updateMany as any).mockResolvedValue({ count: 1 });
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'email-draft-9' });
  dispatch.mockResolvedValue({ id: 'email-1', status: 'SENT', skipped: [] });
});

describe('replyDraft.send (MVP-012)', () => {
  it('sends the draft to the contact through the mailbox path and records it as sent', async () => {
    const result = await caller().send({ draftId: 'draft-1' });

    expect(result).toEqual({ id: 'email-1', status: 'SENT', skipped: [] });
    const [, input, , options] = dispatch.mock.calls[0]!;
    expect(input).toMatchObject({
      to: [TO],
      subject: 'Re: Gutter repair',
      textBody: BODY,
      purpose: 'SERVICE',
    });
    expect(input.htmlBody).toContain('&lt;b&gt;fine&lt;/b&gt;');
    expect(options).toEqual({
      metadata: { replyDraftId: 'draft-1', contactId: TEST_UUIDS.contact1, source: 'ai-reply' },
    });
    expect(moves()).toEqual([
      ['DRAFT', 'SENDING'],
      ['SENDING', 'SENT'],
    ]);
  });

  it('puts the draft back to waiting when the mailbox refuses, and passes the refusal on', async () => {
    const refusal = Object.assign(new Error('NO_MAILBOX'), { data: { emailSendError: {} } });
    dispatch.mockRejectedValueOnce(refusal);

    await expect(caller().send({ draftId: 'draft-1' })).rejects.toThrow('NO_MAILBOX');
    expect(moves()).toEqual([
      ['DRAFT', 'SENDING'],
      ['SENDING', 'DRAFT'],
    ]);
  });

  it('keeps the draft waiting when the send was recorded as failed', async () => {
    dispatch.mockResolvedValueOnce({ id: 'email-2', status: 'FAILED', skipped: [] });
    await caller().send({ draftId: 'draft-1' });
    expect(moves().at(-1)).toEqual(['SENDING', 'DRAFT']);
  });

  it.each(['SENDING', 'SENT', 'EDITED', 'DISMISSED'])(
    'never sends a draft that is %s',
    async (status) => {
      (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(draftRow({ status }));
      await expect(caller().send({ draftId: 'draft-1' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(prismaMock.contactReplyDraft.updateMany).not.toHaveBeenCalled();
    }
  );

  it('sends once when two clicks race: the second finds the draft taken', async () => {
    (prismaMock.contactReplyDraft.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prismaMock.contactReplyDraft.findFirst as any)
      .mockResolvedValueOnce(draftRow())
      .mockResolvedValueOnce(draftRow({ status: 'SENDING' }));

    await expect(caller().send({ draftId: 'draft-1' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This draft is being sent.',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses a contact with no address before taking the draft', async () => {
    (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(
      draftRow({ contact: { email: '  ' } })
    );
    await expect(caller().send({ draftId: 'draft-1' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prismaMock.contactReplyDraft.updateMany).not.toHaveBeenCalled();
  });

  it('only reads drafts of the caller’s tenant', async () => {
    (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(null);
    await expect(caller().send({ draftId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((prismaMock.contactReplyDraft.findFirst as any).mock.calls[0][0].where).toEqual({
      id: 'other',
      tenantId: TEST_UUIDS.tenant,
    });
  });
});

describe('replyDraft.openInCompose (Edit, MVP-012)', () => {
  it('hands the draft to Compose as an email draft of the user’s, and sends nothing', async () => {
    const result = await caller().openInCompose({ draftId: 'draft-1' });

    expect(result).toEqual({ emailDraftId: 'email-draft-9' });
    const data = (prismaMock.emailRecord.create as any).mock.calls[0][0].data;
    expect(data).toMatchObject({
      subject: 'Re: Gutter repair',
      toEmail: TO,
      status: 'PENDING',
      tenantId: TEST_UUIDS.tenant,
      metadata: { isDraft: true, textBody: BODY, replyDraftId: 'draft-1' },
    });
    expect(data.body).toBe(draftBodyHtml(BODY));
    expect(moves()).toEqual([['DRAFT', 'EDITED']]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('creates no email draft when the draft was taken meanwhile', async () => {
    (prismaMock.contactReplyDraft.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prismaMock.contactReplyDraft.findFirst as any)
      .mockResolvedValueOnce(draftRow())
      .mockResolvedValueOnce(draftRow({ status: 'SENT' }));
    await expect(caller().openInCompose({ draftId: 'draft-1' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This draft was already sent.',
    });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });
});

describe('replyDraft.dismiss (MVP-012)', () => {
  it('sets the draft aside without sending it', async () => {
    await expect(caller().dismiss({ draftId: 'draft-1' })).resolves.toEqual({ dismissed: true });
    expect(moves()).toEqual([['DRAFT', 'DISMISSED']]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cannot dismiss a draft already sent', async () => {
    (prismaMock.contactReplyDraft.findFirst as any).mockResolvedValue(draftRow({ status: 'SENT' }));
    await expect(caller().dismiss({ draftId: 'draft-1' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

/** Source without its block and line comments (one linear pass, no backtracking regex). */
function codeOnly(source: string): string {
  let out = '';
  let at = 0;
  while (at < source.length) {
    const open = source.indexOf('/*', at);
    if (open === -1) {
      out += source.slice(at);
      break;
    }
    out += source.slice(at, open);
    const close = source.indexOf('*/', open + 2);
    at = close === -1 ? source.length : close + 2;
  }
  return out
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('never sent without a click (ADR-037)', () => {
  it('the drafting job only ever writes DRAFT', () => {
    const source = readFileSync(
      join(__dirname, '../../../../../ai-worker/src/jobs/reply-draft.job.ts'),
      'utf8'
    );
    // The code only: its comments name SENT to say it is never written.
    const job = codeOnly(source);
    expect(job).toContain("status: 'DRAFT'");
    expect(job).not.toMatch(/status:\s*'(SENT|SENDING)'/);
    expect(job).not.toMatch(/dispatchUserMail|sendRaw|sendEmail/);
  });

  it('only the Send action sends: Edit and Dismiss never reach the mailbox', async () => {
    await caller().openInCompose({ draftId: 'draft-1' });
    await caller().dismiss({ draftId: 'draft-1' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('writes the draft text as escaped HTML paragraphs', () => {
    expect(draftBodyHtml('a <i>\nb\r\n\r\nc & d')).toBe('<p>a &lt;i&gt;<br>b</p><p>c &amp; d</p>');
  });
});
