/**
 * PG-207 ships dark: with nothing configured by the owner (no OAuth apps, no
 * PRISMA_FIELD_ENCRYPTION_KEY, no email-attachments bucket yet), building the
 * email runtime never throws, and every email-settings path answers with a
 * coded "not configured" outcome instead of crashing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, createTestContext } from '../../../test/setup';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: vi.fn(), logPermissionDenied: vi.fn() }),
}));

import { createMailboxTransports } from '../mailbox-transport';
import { emailMailboxRouter } from '../email-mailbox.router';
import { dispatchUserMail } from '../mailbox-sender';
import { emailSendErrorFromCause } from '../email-send-error';
import { startBounceScanner, stopBounceScanner } from '../bounce-scheduler';

/** The environment of an API whose owner configured none of PG-207's settings. */
const BARE_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'production' };

const member = () =>
  emailMailboxRouter.createCaller({
    ...createTestContext(),
    adapters: { mailboxTransports: createMailboxTransports(BARE_ENV), storageService: {} },
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', '');
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  stopBounceScanner();
});

describe('PG-207 with nothing configured', () => {
  it('builds the mailbox transports without OAuth apps: both providers off, no client', () => {
    const transports = createMailboxTransports(BARE_ENV);
    expect(transports.oauthConfigured).toEqual({ GMAIL: false, MICROSOFT: false });
    expect(transports.oauth('GMAIL')).toBeNull();
    expect(transports.oauth('MICROSOFT')).toBeNull();
  });

  it('the settings page reads as "not connected, providers unavailable"', async () => {
    await expect(member().getMine()).resolves.toMatchObject({
      mailbox: null,
      providersAvailable: { GMAIL: false, MICROSOFT: false },
    });
  });

  it('Connect with Google is refused with a coded error, nothing written', async () => {
    await expect(member().oauthStart({ scope: 'USER', provider: 'GMAIL' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prismaMock.emailOAuthState.create).not.toHaveBeenCalled();
  });

  it('saving SMTP credentials without the encryption key is PRECONDITION_FAILED, nothing written', async () => {
    await expect(
      member().saveSmtp({
        scope: 'USER',
        smtpHost: 'smtp.mail.example.com',
        smtpPort: 587,
        smtpSecurity: 'STARTTLS',
        smtpUsername: 'me@mail.example.com',
        smtpPassword: 'p'.repeat(12),
        fromAddress: 'me@mail.example.com',
      })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(prismaMock.emailMailbox.create).not.toHaveBeenCalled();
    expect(prismaMock.emailMailbox.update).not.toHaveBeenCalled();
  });

  it('sending with no mailbox fails visibly (NO_MAILBOX) and records nothing as sent', async () => {
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
    (prismaMock.emailMailbox.findMany as any).mockResolvedValue([]);
    const error = await dispatchUserMail(
      createTestContext() as never,
      { to: ['a@example.invalid'], subject: 'Hi', htmlBody: '<p>Hi</p>' } as never,
      { transports: createMailboxTransports(BARE_ENV), storage: {} as never }
    ).catch((e: unknown) => e);
    expect(emailSendErrorFromCause((error as { cause?: unknown }).cause)?.code).toBe('NO_MAILBOX');
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('a failing bounce-scan tick (e.g. tables not migrated yet) is logged, never thrown', async () => {
    vi.useFakeTimers();
    try {
      const log = { warn: vi.fn(), info: vi.fn() };
      startBounceScanner({
        intervalMs: 1000,
        run: () => Promise.reject(new Error('relation "email_mailboxes" does not exist')),
        log,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('tick failed'));
    } finally {
      vi.useRealTimers();
    }
  });
});
