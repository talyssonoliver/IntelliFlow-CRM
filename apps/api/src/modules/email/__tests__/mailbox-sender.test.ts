import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { MailboxTransportError } from '@intelliflow/adapters';
import { prismaMock, createTestContext, createAdminContext, TEST_UUIDS } from '../../../test/setup';

const quota = vi.hoisted(() => ({ release: vi.fn(), reserveQuota: vi.fn() }));
vi.mock('../../../shared/quota-guard', () => ({ reserveQuota: quota.reserveQuota }));

const transport = vi.hoisted(() => ({ send: vi.fn(), claim: vi.fn() }));
vi.mock('../mailbox-transport', () => ({
  sendThroughMailbox: transport.send,
  claimSendSlot: transport.claim,
}));

import { dispatchUserMail, emailSendErrorFromCause } from '../mailbox-sender';

const tenantId = TEST_UUIDS.tenant;
const NOW = new Date(Date.UTC(2026, 9, 20, 12));
const secret = 'x'.repeat(20);

const ownMailbox = {
  id: 'mb-own',
  tenantId,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  kind: 'SMTP',
  status: 'ACTIVE',
  fromAddress: 'me@mail.example.com',
  fromName: 'Me',
  smtpHost: 'smtp.mail.example.com',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'me@mail.example.com',
  smtpPassword: secret,
  refreshToken: null,
  tokenVersion: 0,
};
const tenantMailbox = {
  ...ownMailbox,
  id: 'mb-team',
  scope: 'TENANT',
  userId: null,
  fromAddress: 'team@mail.example.com',
};

const storage = { downloadEmailAttachment: vi.fn() };
const deps = () => ({ transports: {} as never, storage, now: () => NOW });
const input = { to: ['A@example.invalid'], subject: 'Hello', htmlBody: '<p>Hi</p>' };

function errorOf(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e as TRPCError
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  quota.reserveQuota.mockResolvedValue(quota.release);
  transport.claim.mockResolvedValue(undefined);
  transport.send.mockResolvedValue({ provider: 'SMTP', providerMessageId: '<srv@x>' });
  (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.findMany as any).mockResolvedValue([ownMailbox]);
  (prismaMock.emailSuppression.findMany as any).mockResolvedValue([]);
  (prismaMock.emailRecord.create as any).mockImplementation(async ({ data }: any) => ({
    id: 'rec-1',
    ...data,
  }));
  (prismaMock.emailRecord.update as any).mockResolvedValue({});
  (prismaMock.emailMailbox.updateMany as any).mockResolvedValue({ count: 1 });
  (prismaMock.emailAttachment.createMany as any).mockResolvedValue({ count: 1 });
  storage.downloadEmailAttachment.mockResolvedValue(Buffer.from('pdf'));
});

describe('dispatchUserMail', () => {
  it('sends through the sender’s own mailbox and records SENT with the message ids', async () => {
    const ctx = createTestContext();
    await expect(dispatchUserMail(ctx as never, input, deps())).resolves.toEqual({
      id: 'rec-1',
      status: 'SENT',
      skipped: [],
    });
    expect(prismaMock.emailMailbox.findMany).toHaveBeenCalledWith({
      where: { tenantId, OR: [{ scope: 'USER', userId: TEST_UUIDS.user1 }, { scope: 'TENANT' }] },
    });
    const created = (prismaMock.emailRecord.create as any).mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId,
      userId: TEST_UUIDS.user1,
      mailboxId: 'mb-own',
      fromEmail: 'me@mail.example.com',
      toEmail: 'A@example.invalid',
      status: 'PENDING',
    });
    const [, mailbox, , envelope, raw] = transport.send.mock.calls[0];
    expect(mailbox.id).toBe('mb-own');
    expect(envelope).toEqual({ from: 'me@mail.example.com', to: ['A@example.invalid'] });
    const text = (raw as Buffer).toString('utf8');
    expect(text).toMatch(/X-IntelliFlow-Record: rec-1/i);
    const update = (prismaMock.emailRecord.update as any).mock.calls[0][0];
    expect(update.where).toEqual({ id: 'rec-1', tenantId });
    expect(update.data).toMatchObject({
      status: 'SENT',
      sentAt: NOW,
      provider: 'SMTP',
      providerMessageId: '<srv@x>',
    });
    expect(update.data.messageIdHeader).toMatch(/^<rec-1\.[0-9a-f]{16}@mail\.example\.com>$/);
    expect(quota.release).not.toHaveBeenCalled();
  });

  it('sends exactly the caller’s HTML (no signature appended) with the tenant reply-to', async () => {
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue({
      replyToAddress: 'replies@example.invalid',
    });
    await dispatchUserMail(
      createTestContext() as never,
      { ...input, htmlBody: '<p>exact body</p>' },
      deps()
    );
    const text = (transport.send.mock.calls[0][4] as Buffer).toString('utf8');
    expect(text).toContain('<p>exact body</p>');
    expect(text).toMatch(/^Reply-To: replies@example\.invalid/m);
  });

  it('refuses with NO_MAILBOX (no record, no quota) when the user has none and fallback is off', async () => {
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([tenantMailbox]);
    const error = await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    expect(error.code).toBe('PRECONDITION_FAILED');
    expect(emailSendErrorFromCause(error.cause)).toEqual({
      code: 'NO_MAILBOX',
      mailboxErrorCode: null,
      skipped: [],
    });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
    expect(quota.reserveQuota).not.toHaveBeenCalled();
  });

  it('uses the company mailbox when the user has none and fallback is on', async () => {
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue({
      allowTenantMailboxFallback: true,
    });
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([tenantMailbox]);
    await dispatchUserMail(createTestContext() as never, input, deps());
    expect(transport.send.mock.calls[0][1].id).toBe('mb-team');
    expect((prismaMock.emailRecord.create as any).mock.calls[0][0].data.userId).toBe(
      TEST_UUIDS.user1
    );
  });

  it('lets an admin use the company mailbox even with fallback off', async () => {
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([tenantMailbox]);
    await dispatchUserMail(createAdminContext() as never, input, deps());
    expect(transport.send.mock.calls[0][1].id).toBe('mb-team');
  });

  it('refuses with MAILBOX_ERROR when the own mailbox is broken (never falls back)', async () => {
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue({
      allowTenantMailboxFallback: true,
    });
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([
      { ...ownMailbox, status: 'ERROR' },
      tenantMailbox,
    ]);
    const error = await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    expect(emailSendErrorFromCause(error.cause)?.code).toBe('MAILBOX_ERROR');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('skips suppressed recipients, reserves quota only for the rest and reports them', async () => {
    (prismaMock.emailSuppression.findMany as any).mockResolvedValue([
      { email: 'gone@example.invalid' },
    ]);
    const result = await dispatchUserMail(
      createTestContext() as never,
      { ...input, to: ['ok@example.invalid', 'Gone@example.invalid'], cc: ['c@example.invalid'] },
      deps()
    );
    expect(result.skipped).toEqual(['gone@example.invalid']);
    expect(prismaMock.emailSuppression.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        email: { in: ['ok@example.invalid', 'gone@example.invalid', 'c@example.invalid'] },
      },
      select: { email: true },
    });
    expect(quota.reserveQuota).toHaveBeenCalledWith(
      expect.anything(),
      tenantId,
      'emailsPerMonth',
      2
    );
    const created = (prismaMock.emailRecord.create as any).mock.calls[0][0].data;
    expect(created.toEmail).toBe('ok@example.invalid');
    expect(created.metadata.skippedRecipients).toEqual(['gone@example.invalid']);
  });

  it('sends nothing (ALL_SUPPRESSED, no quota, no record) when every recipient is suppressed', async () => {
    (prismaMock.emailSuppression.findMany as any).mockResolvedValue([
      { email: 'a@example.invalid' },
    ]);
    const error = await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    expect(emailSendErrorFromCause(error.cause)).toEqual({
      code: 'ALL_SUPPRESSED',
      mailboxErrorCode: null,
      skipped: ['a@example.invalid'],
    });
    expect(quota.reserveQuota).not.toHaveBeenCalled();
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('records FAILED with a code, releases quota and never retries elsewhere when the transport fails', async () => {
    transport.send.mockRejectedValue(new MailboxTransportError('REJECTED'));
    const error = await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    expect(error.code).toBe('BAD_GATEWAY');
    expect(emailSendErrorFromCause(error.cause)).toEqual({
      code: 'SEND_FAILED',
      mailboxErrorCode: 'REJECTED',
      skipped: [],
    });
    expect(transport.send).toHaveBeenCalledTimes(1);
    const update = (prismaMock.emailRecord.update as any).mock.calls[0][0];
    expect(update.data.status).toBe('FAILED');
    expect(update.data.metadata.sendErrorCode).toBe('REJECTED');
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('marks the mailbox ERROR on an authentication failure', async () => {
    transport.send.mockRejectedValue(new MailboxTransportError('AUTH_FAILED'));
    await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    expect(prismaMock.emailMailbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'mb-own', tenantId },
      data: { status: 'ERROR', lastErrorCode: 'AUTH_FAILED' },
    });
  });

  it('releases quota when the hourly cap is reached (RATE_LIMITED, no record)', async () => {
    transport.claim.mockRejectedValue(new MailboxTransportError('RATE_LIMITED'));
    const error = await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    expect(emailSendErrorFromCause(error.cause)?.mailboxErrorCode).toBe('RATE_LIMITED');
    expect(quota.reserveQuota).not.toHaveBeenCalled();
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('keeps the charge and never records FAILED when the send succeeded but the update threw', async () => {
    (prismaMock.emailRecord.update as any).mockRejectedValueOnce(new Error('db blip'));
    await expect(dispatchUserMail(createTestContext() as never, input, deps())).rejects.toThrow(
      'db blip'
    );
    expect(quota.release).not.toHaveBeenCalled();
    expect(prismaMock.emailRecord.update).toHaveBeenCalledTimes(1);
  });

  it('releases quota if creating the record fails', async () => {
    (prismaMock.emailRecord.create as any).mockRejectedValue(new Error('db down'));
    await expect(dispatchUserMail(createTestContext() as never, input, deps())).rejects.toThrow(
      'db down'
    );
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('attaches stored files of the tenant and fails the send when one cannot be read', async () => {
    const attachment = {
      storagePath: `${tenantId}/u-report.pdf`,
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      size: 3,
    };
    await dispatchUserMail(
      createTestContext() as never,
      { ...input, attachments: [attachment] },
      deps()
    );
    expect(storage.downloadEmailAttachment).toHaveBeenCalledWith(tenantId, attachment.storagePath);
    expect((transport.send.mock.calls[0][4] as Buffer).toString('utf8')).toContain('report.pdf');
    expect(prismaMock.emailAttachment.createMany).toHaveBeenCalledWith({
      data: [
        {
          emailId: 'rec-1',
          tenantId,
          fileName: 'report.pdf',
          fileSize: 3,
          fileType: 'application/pdf',
          fileUrl: attachment.storagePath,
        },
      ],
    });

    vi.clearAllMocks();
    quota.reserveQuota.mockResolvedValue(quota.release);
    transport.claim.mockResolvedValue(undefined);
    storage.downloadEmailAttachment.mockRejectedValue(new Error('missing'));
    const error = await errorOf(
      dispatchUserMail(
        createTestContext() as never,
        { ...input, attachments: [attachment] },
        deps()
      )
    );
    expect(emailSendErrorFromCause(error.cause)?.mailboxErrorCode).toBe('ATTACHMENT_UNAVAILABLE');
    expect(transport.send).not.toHaveBeenCalled();
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('refuses attachments whose stored bytes exceed 25 MB in total (declared sizes are client input)', async () => {
    const small = (name: string) => ({
      storagePath: `${tenantId}/u-${name}`,
      fileName: name,
      contentType: 'application/pdf',
      size: 1,
    });
    storage.downloadEmailAttachment.mockResolvedValue(Buffer.alloc(13 * 1024 * 1024));
    const error = await errorOf(
      dispatchUserMail(
        createTestContext() as never,
        { ...input, attachments: [small('a.pdf'), small('b.pdf')] },
        deps()
      )
    );
    expect(emailSendErrorFromCause(error.cause)?.mailboxErrorCode).toBe('ATTACHMENT_UNAVAILABLE');
    expect(transport.send).not.toHaveBeenCalled();
    expect(quota.release).toHaveBeenCalledTimes(1);
  });

  it('keeps Bcc in the MIME for OAuth mailboxes and out of it for SMTP', async () => {
    await dispatchUserMail(
      createTestContext() as never,
      { ...input, bcc: ['b@example.invalid'] },
      deps()
    );
    expect((transport.send.mock.calls[0][4] as Buffer).toString('utf8')).not.toMatch(/^Bcc:/m);
    expect(transport.send.mock.calls[0][3].to).toContain('b@example.invalid');

    transport.send.mockClear();
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([
      { ...ownMailbox, kind: 'GMAIL', refreshToken: secret },
    ]);
    transport.send.mockResolvedValue({ provider: 'GMAIL', providerMessageId: 'gm' });
    await dispatchUserMail(
      createTestContext() as never,
      { ...input, bcc: ['b@example.invalid'] },
      deps()
    );
    expect((transport.send.mock.calls[0][4] as Buffer).toString('utf8')).toMatch(
      /^Bcc: b@example\.invalid/m
    );
  });

  it('never logs the mailbox secret on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    transport.send.mockRejectedValue(new MailboxTransportError('AUTH_FAILED'));
    await errorOf(dispatchUserMail(createTestContext() as never, input, deps()));
    for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(secret);
    spy.mockRestore();
  });
});

describe('emailSendErrorFromCause', () => {
  it('returns null for anything that is not a send error', () => {
    expect(emailSendErrorFromCause(undefined)).toBeNull();
    expect(emailSendErrorFromCause(new Error('x'))).toBeNull();
    expect(emailSendErrorFromCause({ emailSendError: 'OTHER' })).toBeNull();
  });
});
