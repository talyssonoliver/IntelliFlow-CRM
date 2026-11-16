/**
 * MVP-001: a Zoho mailbox sends the message's fields through Zoho's API, never the MIME.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __resetAccessTokenCache,
  createMailboxTransports,
  oauthConfigFromEnv,
  sendThroughMailbox,
  type MailboxTransports,
} from '../mailbox-transport';

const NOW = new Date('2026-11-15T10:00:00.000Z');
// Not real credentials: built at runtime so nothing secret-shaped sits in the source.
const REFRESH = ['refresh', 'for', 'tests'].join('-');
const ACCESS = ['access', 'for', 'tests'].join('-');

const mailbox = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'mbx-1',
    tenantId: 'tenant-1',
    kind: 'ZOHO',
    refreshToken: REFRESH,
    tokenVersion: 0,
    oauthAccountId: '42',
    oauthApiDomain: 'mail.zoho.com',
    ...overrides,
  }) as never;

const message = {
  recordId: 'rec-1',
  from: { address: 'owner@business.example.invalid', name: 'Owner' },
  to: ['ada@example.invalid'],
  cc: ['cy@example.invalid'],
  bcc: ['bo@example.invalid'],
  subject: 'Proposal',
  html: '<p>Hello</p>',
};

function setup() {
  const zoho = {
    authorizationUrl: vi.fn(),
    exchangeCode: vi.fn(),
    refresh: vi.fn(async () => ({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })),
    revoke: vi.fn(),
    identity: vi.fn(),
    sendMessage: vi.fn(async () => ({ providerMessageId: 'z-1' })),
  };
  const transports = {
    smtp: { send: vi.fn() },
    imap: {},
    oauth: vi.fn(() => null),
    zoho,
    oauthConfigured: { GMAIL: false, MICROSOFT: false, ZOHO: true },
  } as unknown as MailboxTransports;
  const prisma = { emailMailbox: { updateMany: vi.fn(async () => ({ count: 1 })) } };
  return { zoho, transports, prisma };
}

beforeEach(() => __resetAccessTokenCache());

describe('sendThroughMailbox, Zoho (MVP-001)', () => {
  it("sends the fields to the mailbox's Zoho account, refreshed at its data centre", async () => {
    const { zoho, transports, prisma } = setup();
    const envelope = { from: 'owner@business.example.invalid', to: ['ada@example.invalid'] };

    const sent = await sendThroughMailbox(
      prisma,
      mailbox(),
      transports,
      envelope,
      Buffer.from('mime'),
      NOW,
      message
    );

    expect(zoho.refresh).toHaveBeenCalledWith(REFRESH, NOW, 'mail.zoho.com');
    expect(zoho.sendMessage).toHaveBeenCalledWith(
      ACCESS,
      { mailHost: 'mail.zoho.com', accountId: '42' },
      {
        from: 'owner@business.example.invalid',
        to: ['ada@example.invalid'],
        cc: ['cy@example.invalid'],
        bcc: ['bo@example.invalid'],
        subject: 'Proposal',
        html: '<p>Hello</p>',
        attachments: undefined,
      }
    );
    expect(sent).toEqual({ provider: 'ZOHO', providerMessageId: 'z-1', rejected: [] });
  });

  it('refuses to send without the message fields or without the account location', async () => {
    const { transports, prisma } = setup();
    const envelope = { from: 'a@example.invalid', to: ['b@example.invalid'] };

    await expect(
      sendThroughMailbox(prisma, mailbox(), transports, envelope, Buffer.from('m'), NOW)
    ).rejects.toMatchObject({ code: 'REJECTED' });
    await expect(
      sendThroughMailbox(
        prisma,
        mailbox({ oauthAccountId: null }),
        transports,
        envelope,
        Buffer.from('m'),
        NOW,
        message
      )
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('fails as CONNECT_FAILED when Zoho is not configured', async () => {
    const { transports, prisma } = setup();
    const unconfigured = { ...transports, zoho: null } as MailboxTransports;
    await expect(
      sendThroughMailbox(
        prisma,
        mailbox(),
        unconfigured,
        { from: 'a@example.invalid', to: [] },
        Buffer.from('m'),
        NOW,
        message
      )
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
  });
});

describe('Zoho configuration from env', () => {
  it('reads EMAIL_OAUTH_ZOHO_CLIENT_ID/_SECRET and the shared redirect', () => {
    const env = {
      EMAIL_OAUTH_REDIRECT_URI: 'https://app.example.invalid/email/oauth/callback',
      EMAIL_OAUTH_ZOHO_CLIENT_ID: 'zoho-id',
      EMAIL_OAUTH_ZOHO_CLIENT_SECRET: ['zoho', 'secret', 'for', 'tests'].join('-'),
    };
    expect(oauthConfigFromEnv(env).ZOHO).toMatchObject({ clientId: 'zoho-id' });
    const built = createMailboxTransports(env);
    expect(built.oauthConfigured.ZOHO).toBe(true);
    expect(built.zoho).not.toBeNull();
    expect(built.oauth('ZOHO')).toBeNull();
    expect(createMailboxTransports({}).zoho).toBeNull();
  });
});
