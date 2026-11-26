/**
 * emailAttachments.fetch: the on-demand attachment proxy. Files of synced mail are read from the
 * provider at request time and returned; nothing is stored. Tenant- and permission-checked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
  fetchGraphAttachment: vi.fn(),
  fetchGmailAttachment: vi.fn(),
  fetchZohoAttachment: vi.fn(),
}));
vi.mock('@intelliflow/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/adapters')>()),
  ...provider,
}));
const transport = vi.hoisted(() => ({
  getOAuthAccessToken: vi.fn(),
  forgetAccessToken: vi.fn(),
}));
vi.mock('../mailbox-transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mailbox-transport')>()),
  ...transport,
}));

import { MailboxTransportError } from '@intelliflow/adapters';
import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { emailAttachmentsRouter } from '../email-attachments.router';

const tenantId = TEST_UUIDS.tenant;
const OWNER = TEST_UUIDS.user1;
const INPUT = { emailId: 'email-1', attachmentId: 'att-1' };

const caller = (over: Record<string, unknown> = {}) =>
  emailAttachmentsRouter.createCaller({
    ...createTestContext(over as never),
    adapters: { mailboxTransports: {}, storageService: {} },
  } as never);

function row(over: Record<string, unknown> = {}, email: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    fileName: 'quote.pdf',
    fileType: 'application/pdf',
    fileSize: 1000,
    providerAttachmentId: 'loc-1',
    email: {
      id: 'email-1',
      tenantId,
      userId: null,
      mailboxId: 'mbx-1',
      provider: 'MICROSOFT',
      providerMessageId: 'msg-1',
      ...email,
    },
    ...over,
  };
}

function mailbox(over: Record<string, unknown> = {}) {
  return { id: 'mbx-1', tenantId, kind: 'MICROSOFT', status: 'ACTIVE', ...over };
}

function setRows(attachment: unknown, box: unknown = mailbox()) {
  (prismaMock as any).emailAttachment.findFirst.mockResolvedValue(attachment);
  (prismaMock as any).emailMailbox.findFirst.mockResolvedValue(box);
}

beforeEach(() => {
  vi.clearAllMocks();
  transport.getOAuthAccessToken.mockResolvedValue('access-for-tests');
  const file = { bytes: Buffer.from('%PDF-bytes'), contentType: 'application/pdf; charset=binary' };
  provider.fetchGraphAttachment.mockResolvedValue(file);
  provider.fetchGmailAttachment.mockResolvedValue(file);
  provider.fetchZohoAttachment.mockResolvedValue(file);
});

describe('emailAttachments.fetch', () => {
  it('reads the file from the provider and returns it, writing nothing', async () => {
    setRows(row());
    const out = await caller().fetch(INPUT);
    expect(out).toEqual({
      fileName: 'quote.pdf',
      contentType: 'application/pdf',
      size: 10,
      contentBase64: Buffer.from('%PDF-bytes').toString('base64'),
    });
    expect(provider.fetchGraphAttachment).toHaveBeenCalledWith('access-for-tests', {
      messageId: 'msg-1',
      attachmentId: 'loc-1',
    });
    // Never persisted: no write of any kind reached the database.
    expect((prismaMock as any).emailAttachment.create).not.toHaveBeenCalled();
    expect((prismaMock as any).emailAttachment.update).not.toHaveBeenCalled();
    expect((prismaMock as any).emailRecord.update).not.toHaveBeenCalled();
  });

  it('looks the attachment up inside the caller tenant, on the attachment and on its email', async () => {
    setRows(row());
    await caller().fetch(INPUT);
    const where = (prismaMock as any).emailAttachment.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: 'att-1',
      emailId: 'email-1',
      tenantId,
      email: { tenantId },
    });
    expect((prismaMock as any).emailMailbox.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'mbx-1',
      tenantId,
    });
  });

  it("answers not found for another tenant's attachment and never calls the provider", async () => {
    setRows(null);
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    setRows(row({}, { tenantId: 'other-tenant' }));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(transport.getOAuthAccessToken).not.toHaveBeenCalled();
    expect(provider.fetchGraphAttachment).not.toHaveBeenCalled();
  });

  it("hides another user's mail from a member, and shows it to an email admin", async () => {
    setRows(row({}, { userId: 'someone-else' }));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(provider.fetchGraphAttachment).not.toHaveBeenCalled();

    const admin = { user: { ...createTestContext().user!, role: 'ADMIN' } };
    await expect(caller(admin).fetch(INPUT)).resolves.toMatchObject({ fileName: 'quote.pdf' });
  });

  it("serves the caller's own mail", async () => {
    setRows(row({}, { userId: OWNER }));
    await expect(caller().fetch(INPUT)).resolves.toMatchObject({ size: 10 });
  });

  it('does not serve an attachment with no provider locator (not an on-demand file)', async () => {
    setRows(row({ providerAttachmentId: null }));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(provider.fetchGraphAttachment).not.toHaveBeenCalled();
  });

  it('refuses a file over the size cap before asking the provider', async () => {
    setRows(row({ fileSize: 16 * 1024 * 1024 }));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(provider.fetchGraphAttachment).not.toHaveBeenCalled();
  });

  it('needs the mailbox the mail came from to be connected and of the same kind', async () => {
    setRows(row(), mailbox({ status: 'ERROR' }));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    setRows(row(), null);
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    setRows(row(), mailbox({ kind: 'GMAIL' }));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transport.getOAuthAccessToken).not.toHaveBeenCalled();
  });

  it('asks Gmail for the part and Zoho for the folder-qualified id', async () => {
    setRows(row({}, { provider: 'GMAIL' }), mailbox({ kind: 'GMAIL' }));
    await caller().fetch(INPUT);
    expect(provider.fetchGmailAttachment).toHaveBeenCalledWith('access-for-tests', {
      messageId: 'msg-1',
      partId: 'loc-1',
    });
    setRows(
      row({ providerAttachmentId: '99:77' }, { provider: 'ZOHO' }),
      mailbox({ kind: 'ZOHO', oauthAccountId: '55', oauthApiDomain: 'mail.zoho.eu' })
    );
    await caller().fetch(INPUT);
    expect(provider.fetchZohoAttachment).toHaveBeenCalledWith(
      'access-for-tests',
      { accountId: '55', mailHost: 'mail.zoho.eu' },
      { messageId: 'msg-1', providerAttachmentId: '99:77' }
    );
  });

  it('maps provider failures to fixed messages, never the provider text', async () => {
    setRows(row());
    provider.fetchGraphAttachment.mockRejectedValueOnce(new MailboxTransportError('REJECTED'));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    provider.fetchGraphAttachment.mockRejectedValueOnce(new MailboxTransportError('AUTH_FAILED'));
    await expect(caller().fetch(INPUT)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transport.forgetAccessToken).toHaveBeenCalledWith('mbx-1');

    provider.fetchGraphAttachment.mockRejectedValueOnce(new Error('graph said: secret detail'));
    const error = await caller()
      .fetch(INPUT)
      .then(
        () => {
          throw new Error('expected a rejection');
        },
        (e: unknown) => e as Error
      );
    expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(error.message).not.toContain('secret detail');
  });
});
