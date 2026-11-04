/**
 * The beginner setup path: what compose can show before sending, and testing
 * mailbox settings before they are saved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import { smtpAccountFields, smtpEndpointFields } from '@intelliflow/validators';
import { prismaMock, createAdminContext, createTestContext, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({
    logAction: async () => 'a',
    logPermissionDenied: async () => 'b',
  }),
}));

import { __resetConnectionTestLimiter, emailMailboxRouter } from '../email-mailbox.router';

const tenantId = TEST_UUIDS.tenant;
const secret = 'x'.repeat(22);

const smtpRow = (over: Record<string, unknown> = {}) => ({
  id: 'mb1',
  tenantId,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@mail.example.com',
  fromName: 'Me',
  ...smtpEndpointFields('smtp.mail.example.com', 587, 'STARTTLS'),
  ...smtpAccountFields('me@mail.example.com', secret),
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  imapPassword: null,
  tokenVersion: 0,
  updatedAt: new Date(Date.UTC(2026, 9, 20)),
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  scope: 'USER' as const,
  ...smtpEndpointFields('smtp.mail.example.com', 587, 'STARTTLS'),
  ...smtpAccountFields('me@mail.example.com', secret),
  fromAddress: 'me@mail.example.com',
  ...over,
});

let smtpVerify: ReturnType<typeof vi.fn>;
let imapVerify: ReturnType<typeof vi.fn>;

const ctxWith = (base: any) => ({
  ...base,
  adapters: {
    ...base.adapters,
    storageService: {},
    mailboxTransports: {
      smtp: { send: vi.fn(), verify: smtpVerify },
      imap: { read: vi.fn(), verify: imapVerify },
      oauth: vi.fn(() => null),
      oauthConfigured: { GMAIL: false, MICROSOFT: false },
    },
  },
});
const member = () => emailMailboxRouter.createCaller(ctxWith(createTestContext()) as never);
const admin = () => emailMailboxRouter.createCaller(ctxWith(createAdminContext()) as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', 'k'.repeat(44));
  __resetConnectionTestLimiter();
  smtpVerify = vi.fn(async () => undefined);
  imapVerify = vi.fn(async () => undefined);
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.findMany as any).mockResolvedValue([]);
  (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
});

describe('emailMailbox.sendingIdentity', () => {
  it("is the user's own active mailbox", async () => {
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([smtpRow()]);

    await expect(member().sendingIdentity()).resolves.toEqual({
      address: 'me@mail.example.com',
      name: 'Me',
      scope: 'USER',
      refusal: null,
    });
  });

  it('says NO_MAILBOX when nothing can send', async () => {
    await expect(member().sendingIdentity()).resolves.toEqual({
      address: null,
      name: null,
      scope: null,
      refusal: 'NO_MAILBOX',
    });
  });

  it('says MAILBOX_ERROR for a broken mailbox, as a send would', async () => {
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([smtpRow({ status: 'ERROR' })]);

    await expect(member().sendingIdentity()).resolves.toMatchObject({
      address: null,
      refusal: 'MAILBOX_ERROR',
    });
  });

  it('is the company mailbox only when a member may fall back to it', async () => {
    const company = smtpRow({
      scope: 'TENANT',
      userId: null,
      fromAddress: 'team@mail.example.com',
    });
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([company]);

    await expect(member().sendingIdentity()).resolves.toMatchObject({ refusal: 'NO_MAILBOX' });

    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue({
      allowTenantMailboxFallback: true,
    });
    await expect(member().sendingIdentity()).resolves.toMatchObject({
      address: 'team@mail.example.com',
      scope: 'TENANT',
      refusal: null,
    });
  });
});

describe('emailMailbox.testSmtpSettings', () => {
  it('tries the typed settings and saves nothing', async () => {
    await expect(member().testSmtpSettings(input())).resolves.toEqual({ ok: true, code: null });

    expect(smtpVerify).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.mail.example.com', port: 587, password: secret })
    );
    expect(prismaMock.emailMailbox.create).not.toHaveBeenCalled();
    expect(prismaMock.emailMailbox.update).not.toHaveBeenCalled();
    expect(prismaMock.emailMailbox.updateMany).not.toHaveBeenCalled();
  });

  it('reports a refused sign-in as a result, not an error', async () => {
    smtpVerify.mockRejectedValue(new MailboxTransportError('AUTH_FAILED'));

    await expect(member().testSmtpSettings(input())).resolves.toEqual({
      ok: false,
      code: 'AUTH_FAILED',
    });
  });

  it('checks the bounce-reading login too, when it is on', async () => {
    imapVerify.mockRejectedValue(new MailboxTransportError('AUTH_FAILED'));

    await expect(
      member().testSmtpSettings(
        input({
          imapHost: 'imap.mail.example.com',
          imapPort: 993,
          imapUsername: 'me',
          imapPassword: secret,
        })
      )
    ).resolves.toEqual({ ok: false, code: 'AUTH_FAILED' });
  });

  it('reuses the saved password only for the same server and account', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    const { smtpPassword: _omit, ...kept } = input();

    await expect(member().testSmtpSettings(kept as never)).resolves.toMatchObject({ ok: true });
    expect(smtpVerify).toHaveBeenCalledWith(expect.objectContaining({ password: secret }));

    smtpVerify.mockClear();
    await expect(
      member().testSmtpSettings({
        ...kept,
        ...smtpEndpointFields('smtp.other.example.com', 587, 'STARTTLS'),
      } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(smtpVerify).not.toHaveBeenCalled();
  });

  it('asks for a password when there is none to use', async () => {
    const { smtpPassword: _omit, ...noPassword } = input();

    await expect(member().testSmtpSettings(noPassword as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Enter the password for this mailbox.',
    });
  });

  it('shares the connection test limit', async () => {
    for (let i = 0; i < 5; i++) await member().testSmtpSettings(input());

    await expect(member().testSmtpSettings(input())).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('keeps the company mailbox to admins', async () => {
    await expect(member().testSmtpSettings(input({ scope: 'TENANT' }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(admin().testSmtpSettings(input({ scope: 'TENANT' }))).resolves.toMatchObject({
      ok: true,
    });
  });
});
