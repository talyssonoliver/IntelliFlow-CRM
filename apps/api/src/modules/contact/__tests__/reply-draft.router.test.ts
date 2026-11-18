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
import { emailSendError } from '../../email/email-send-error';
import { contactRouter } from '../contact.router';
import { REPLY_DRAFT_STATUSES } from '@intelliflow/validators';

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
  (prismaMock.contact.findFirst as any).mockResolvedValue({ id: TEST_UUIDS.contact1 });
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
      metadata: {
        replyDraftId: 'draft-1',
        replyDraftAttempt: expect.stringMatching(/^[0-9a-f-]{36}$/),
        contactId: TEST_UUIDS.contact1,
        source: 'ai-reply',
      },
    });
    expect(moves()).toEqual([
      ['DRAFT', 'SENDING'],
      ['SENDING', 'SENT'],
    ]);
  });

  it.each(['NO_MAILBOX', 'SEND_FAILED'] as const)(
    'puts the draft back to waiting when the mailbox path refuses (%s), and passes it on',
    async (code) => {
      dispatch.mockRejectedValueOnce(emailSendError(code));

      await expect(caller().send({ draftId: 'draft-1' })).rejects.toThrow(code);
      expect(moves()).toEqual([
        ['DRAFT', 'SENDING'],
        ['SENDING', 'DRAFT'],
      ]);
    }
  );

  it('keeps a draft whose mail may have gone out from being sent again (codex)', async () => {
    // The mailbox accepted it, then storing the outcome failed: the email record exists.
    dispatch.mockRejectedValueOnce(new Error('connection reset while saving'));
    (prismaMock.emailRecord.findFirst as any).mockResolvedValueOnce({ id: 'email-1' });

    await expect(caller().send({ draftId: 'draft-1' })).rejects.toThrow('connection reset');
    expect(moves()).toEqual([['DRAFT', 'SENDING']]);
    // Evidence is looked for under this attempt's own id, the one the send recorded.
    const attempt = dispatch.mock.calls[0]![3].metadata.replyDraftAttempt;
    expect((prismaMock.emailRecord.findFirst as any).mock.calls[0][0].where).toEqual({
      tenantId: TEST_UUIDS.tenant,
      metadata: { path: ['replyDraftAttempt'], equals: attempt },
    });
  });

  it('an earlier failed attempt’s record does not keep a later one stuck (codex)', async () => {
    // Attempt 1 is recorded as failed (its email record exists) and the draft waits again.
    dispatch.mockResolvedValueOnce({ id: 'email-1', status: 'FAILED', skipped: [] });
    await caller().send({ draftId: 'draft-1' });
    const first = dispatch.mock.calls[0]![3].metadata.replyDraftAttempt;
    // Attempt 2 fails before writing anything: only attempt 1's record exists.
    (prismaMock.emailRecord.findFirst as any).mockImplementation(async ({ where }: any) =>
      where.metadata.equals === first ? { id: 'email-1' } : null
    );
    dispatch.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(caller().send({ draftId: 'draft-1' })).rejects.toThrow('database unavailable');
    expect(dispatch.mock.calls[1]![3].metadata.replyDraftAttempt).not.toBe(first);
    expect(moves().at(-1)).toEqual(['SENDING', 'DRAFT']);
  });

  it('makes the draft sendable again after an error before anything was written', async () => {
    dispatch.mockRejectedValueOnce(new Error('database unavailable'));
    (prismaMock.emailRecord.findFirst as any).mockResolvedValueOnce(null);

    await expect(caller().send({ draftId: 'draft-1' })).rejects.toThrow('database unavailable');
    expect(moves().at(-1)).toEqual(['SENDING', 'DRAFT']);
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

  it('does not exist for a user outside the contact’s owner or team scope (codex)', async () => {
    (prismaMock.contact.findFirst as any).mockResolvedValue(null);
    for (const act of ['send', 'openInCompose', 'dismiss'] as const) {
      await expect(caller()[act]({ draftId: 'draft-1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(prismaMock.contactReplyDraft.updateMany).not.toHaveBeenCalled();
    // The scope check is the contact pages' own predicate, on the draft's contact.
    expect((prismaMock.contact.findFirst as any).mock.calls[0][0].where).toMatchObject({
      id: TEST_UUIDS.contact1,
      tenantId: TEST_UUIDS.tenant,
    });
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

describe('contact.listReplyDrafts (MVP-012)', () => {
  it('leaves dismissed drafts out before the limit, so they never hide waiting ones (codex)', async () => {
    (prismaMock.contactReplyDraft.findMany as any).mockResolvedValue([]);
    const list = contactRouter.createCaller(createTestContext() as never);
    await list.listReplyDrafts({ contactId: TEST_UUIDS.contact1, limit: 5 });
    expect((prismaMock.contactReplyDraft.findMany as any).mock.calls[0][0]).toMatchObject({
      where: { contactId: TEST_UUIDS.contact1, status: { not: 'DISMISSED' } },
      take: 5,
    });
  });

  it('lists waiting drafts first, so settled ones never push them past the limit (codex)', async () => {
    (prismaMock.contactReplyDraft.findMany as any).mockResolvedValue([]);
    const list = contactRouter.createCaller(createTestContext() as never);
    await list.listReplyDrafts({ contactId: TEST_UUIDS.contact1, limit: 5 });
    const { orderBy } = (prismaMock.contactReplyDraft.findMany as any).mock.calls[0][0];
    expect(orderBy).toEqual([{ status: 'asc' }, { createdAt: 'desc' }]);
    // The order relies on DRAFT sorting before every other listed status.
    const listed = REPLY_DRAFT_STATUSES.filter((s) => s !== 'DISMISSED');
    expect([...listed].sort((a, b) => a.localeCompare(b))[0]).toBe('DRAFT');
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
