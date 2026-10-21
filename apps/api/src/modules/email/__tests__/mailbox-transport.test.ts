import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import {
  __resetAccessTokenCache,
  claimSendSlot,
  createMailboxTransports,
  getOAuthAccessToken,
  oauthConfigFromEnv,
  sendThroughMailbox,
  type MailboxTransports,
} from '../mailbox-transport';

const secret = 'x'.repeat(24);
const NOW = new Date(Date.UTC(2026, 9, 20, 12));

function prismaStub() {
  return {
    emailMailbox: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(),
    },
  };
}

function transports(overrides: Partial<Record<string, any>> = {}): MailboxTransports {
  const oauthClient = {
    refresh: vi.fn(async () => ({
      accessToken: 'at-new',
      refreshToken: 'rt-1',
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })),
    sendRaw: vi.fn(async () => ({ providerMessageId: 'gm-1' })),
    ...overrides.oauthClient,
  };
  return {
    smtp: {
      send: vi.fn(async () => ({ providerMessageId: '<srv@x>' })),
      verify: vi.fn(),
      ...overrides.smtp,
    },
    imap: { read: vi.fn(), verify: vi.fn() },
    oauth: vi.fn(() => (overrides.noOauth ? null : oauthClient)),
    oauthConfigured: { GMAIL: !overrides.noOauth, MICROSOFT: !overrides.noOauth },
  } as unknown as MailboxTransports;
}

const smtpMailbox = {
  id: 'mb1',
  tenantId: 't1',
  kind: 'SMTP',
  smtpHost: 'smtp.mail.example.com',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'me@mail.example.com',
  smtpPassword: secret,
  refreshToken: null,
  tokenVersion: 0,
};
const gmailMailbox = {
  ...smtpMailbox,
  id: 'mb2',
  kind: 'GMAIL',
  smtpHost: null,
  smtpPassword: null,
  refreshToken: 'rt-1',
};

beforeEach(() => {
  __resetAccessTokenCache();
  vi.unstubAllEnvs();
});

describe('oauthConfigFromEnv', () => {
  it('returns a provider config only when client id, secret and redirect URI are all set', () => {
    expect(oauthConfigFromEnv({})).toEqual({ GMAIL: null, MICROSOFT: null });
    expect(
      oauthConfigFromEnv({
        EMAIL_OAUTH_REDIRECT_URI: 'https://app.example.invalid/email/oauth/callback',
        EMAIL_OAUTH_GOOGLE_CLIENT_ID: 'g',
        EMAIL_OAUTH_GOOGLE_CLIENT_SECRET: 'gs',
        EMAIL_OAUTH_MICROSOFT_CLIENT_ID: 'm',
      })
    ).toEqual({
      GMAIL: {
        clientId: 'g',
        clientSecret: 'gs',
        redirectUri: 'https://app.example.invalid/email/oauth/callback',
      },
      MICROSOFT: null,
    });
  });

  it('builds transports whose oauth() is null for an unconfigured provider', () => {
    const t = createMailboxTransports({});
    expect(t.oauth('GMAIL')).toBeNull();
    expect(t.oauthConfigured).toEqual({ GMAIL: false, MICROSOFT: false });
    expect(typeof t.smtp.send).toBe('function');
    expect(typeof t.imap.read).toBe('function');
  });

  it('builds an OAuth client when configured', () => {
    const t = createMailboxTransports({
      EMAIL_OAUTH_REDIRECT_URI: 'https://app.example.invalid/cb',
      EMAIL_OAUTH_MICROSOFT_CLIENT_ID: 'm',
      EMAIL_OAUTH_MICROSOFT_CLIENT_SECRET: 'ms',
    });
    expect(t.oauth('MICROSOFT')).not.toBeNull();
    expect(t.oauthConfigured.MICROSOFT).toBe(true);
  });
});

describe('getOAuthAccessToken', () => {
  it('refreshes once and caches the access token until it nears expiry', async () => {
    const t = transports();
    const prisma = prismaStub();
    expect(await getOAuthAccessToken(prisma as never, gmailMailbox as never, t, NOW)).toBe(
      'at-new'
    );
    expect(await getOAuthAccessToken(prisma as never, gmailMailbox as never, t, NOW)).toBe(
      'at-new'
    );
    expect((t.oauth('GMAIL') as any).refresh).toHaveBeenCalledTimes(1);
    expect(prisma.emailMailbox.updateMany).not.toHaveBeenCalled();
  });

  it('stores a rotated refresh token with a tokenVersion compare-and-set (key required)', async () => {
    vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', 'k'.repeat(44));
    const t = transports({
      oauthClient: {
        refresh: vi.fn(async () => ({
          accessToken: 'at',
          refreshToken: 'rt-2',
          expiresAt: new Date(NOW.getTime() + 3600_000),
        })),
      },
    });
    const prisma = prismaStub();
    await getOAuthAccessToken(
      prisma as never,
      { ...gmailMailbox, kind: 'MICROSOFT', tokenVersion: 4 } as never,
      t,
      NOW
    );
    expect(prisma.emailMailbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'mb2', tenantId: 't1', tokenVersion: 4 },
      data: { refreshToken: 'rt-2', tokenVersion: { increment: 1 } },
    });
  });

  it('does not store a rotated token when the encryption key is missing (still returns the access token)', async () => {
    vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', '');
    const t = transports({
      oauthClient: {
        refresh: vi.fn(async () => ({
          accessToken: 'at',
          refreshToken: 'rt-2',
          expiresAt: new Date(NOW.getTime() + 3600_000),
        })),
      },
    });
    const prisma = prismaStub();
    await expect(
      getOAuthAccessToken(prisma as never, gmailMailbox as never, t, NOW)
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prisma.emailMailbox.updateMany).not.toHaveBeenCalled();
  });

  it('marks the mailbox ERROR (TOKEN_REVOKED) when the grant is revoked', async () => {
    const t = transports({
      oauthClient: {
        refresh: vi.fn(async () => Promise.reject(new MailboxTransportError('TOKEN_REVOKED'))),
      },
    });
    const prisma = prismaStub();
    await expect(
      getOAuthAccessToken(prisma as never, gmailMailbox as never, t, NOW)
    ).rejects.toMatchObject({
      code: 'TOKEN_REVOKED',
    });
    expect(prisma.emailMailbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'mb2', tenantId: 't1' },
      data: { status: 'ERROR', lastErrorCode: 'TOKEN_REVOKED' },
    });
  });

  it('refuses when the provider is not configured or the mailbox has no token', async () => {
    await expect(
      getOAuthAccessToken(
        prismaStub() as never,
        gmailMailbox as never,
        transports({ noOauth: true }),
        NOW
      )
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    await expect(
      getOAuthAccessToken(
        prismaStub() as never,
        { ...gmailMailbox, refreshToken: null } as never,
        transports(),
        NOW
      )
    ).rejects.toMatchObject({ code: 'TOKEN_REVOKED' });
  });
});

describe('sendThroughMailbox', () => {
  const envelope = { from: 'me@mail.example.com', to: ['a@example.invalid'] };

  it('sends SMTP mail with the stored credentials', async () => {
    const t = transports();
    await expect(
      sendThroughMailbox(
        prismaStub() as never,
        smtpMailbox as never,
        t,
        envelope,
        Buffer.from('raw'),
        NOW
      )
    ).resolves.toEqual({ provider: 'SMTP', providerMessageId: '<srv@x>' });
    expect(t.smtp.send).toHaveBeenCalledWith(
      {
        host: 'smtp.mail.example.com',
        port: 587,
        security: 'STARTTLS',
        username: 'me@mail.example.com',
        password: secret,
      },
      envelope,
      Buffer.from('raw')
    );
  });

  it('refuses an SMTP mailbox missing its connection details', async () => {
    await expect(
      sendThroughMailbox(
        prismaStub() as never,
        { ...smtpMailbox, smtpPassword: null } as never,
        transports(),
        envelope,
        Buffer.from('r'),
        NOW
      )
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('sends OAuth mail with a fresh access token', async () => {
    const t = transports();
    await expect(
      sendThroughMailbox(
        prismaStub() as never,
        gmailMailbox as never,
        t,
        envelope,
        Buffer.from('raw'),
        NOW
      )
    ).resolves.toEqual({ provider: 'GMAIL', providerMessageId: 'gm-1' });
    expect((t.oauth('GMAIL') as any).sendRaw).toHaveBeenCalledWith('at-new', Buffer.from('raw'));
  });

  it('drops a cached token after an auth failure so the next send refreshes', async () => {
    const sendRaw = vi
      .fn()
      .mockRejectedValueOnce(new MailboxTransportError('AUTH_FAILED'))
      .mockResolvedValueOnce({ providerMessageId: 'gm-2' });
    const t = transports({ oauthClient: { sendRaw } });
    await expect(
      sendThroughMailbox(
        prismaStub() as never,
        gmailMailbox as never,
        t,
        envelope,
        Buffer.from('r'),
        NOW
      )
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    await sendThroughMailbox(
      prismaStub() as never,
      gmailMailbox as never,
      t,
      envelope,
      Buffer.from('r'),
      NOW
    );
    expect((t.oauth('GMAIL') as any).refresh).toHaveBeenCalledTimes(2);
  });
});

describe('claimSendSlot (per-mailbox hourly cap)', () => {
  it('opens a new window when none is open', async () => {
    const prisma = prismaStub();
    await claimSendSlot(prisma as never, { id: 'mb1', tenantId: 't1' }, NOW);
    expect(prisma.emailMailbox.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.emailMailbox.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'mb1',
        tenantId: 't1',
        OR: [
          { sendWindowStart: null },
          { sendWindowStart: { lt: new Date(NOW.getTime() - 3600_000) } },
        ],
      },
      data: { sendWindowStart: NOW, sendWindowCount: 1 },
    });
  });

  it('counts within the open window and refuses past the cap', async () => {
    const prisma = prismaStub();
    prisma.emailMailbox.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await claimSendSlot(prisma as never, { id: 'mb1', tenantId: 't1' }, NOW);
    expect(prisma.emailMailbox.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'mb1', tenantId: 't1', sendWindowCount: { lt: 100 } },
      data: { sendWindowCount: { increment: 1 } },
    });
    prisma.emailMailbox.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      claimSendSlot(prisma as never, { id: 'mb1', tenantId: 't1' }, NOW)
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});
