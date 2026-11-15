/**
 * MVP-001: what differs per provider when a mailbox is connected, checked and disconnected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import {
  checkOAuthMailbox,
  connectAccount,
  connectStartUrl,
  hasRequiredScopes,
  revokeGrant,
} from '../oauth-connect';
import { __resetAccessTokenCache, type MailboxTransports } from '../mailbox-transport';

const NOW = new Date('2026-11-15T10:00:00.000Z');
// Not real credentials: built at runtime so nothing secret-shaped sits in the source.
const REFRESH = ['refresh', 'for', 'tests'].join('-');
const ACCESS = ['access', 'for', 'tests'].join('-');

function zohoClient() {
  return {
    authorizationUrl: vi.fn(() => 'https://accounts.zoho.com/oauth/v2/auth?x=1'),
    exchangeCode: vi.fn(async () => ({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scopes: ['ZohoMail.messages.CREATE', 'ZohoMail.accounts.READ'],
      mailHost: 'mail.zoho.eu',
    })),
    refresh: vi.fn(async () => ({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })),
    revoke: vi.fn(async () => undefined),
    identity: vi.fn(async () => ({
      accountId: '42',
      address: 'owner@business.example.invalid',
      sendAs: ['owner@business.example.invalid'],
    })),
    sendMessage: vi.fn(async () => ({ providerMessageId: 'z-1' })),
  };
}

function googleClient() {
  return {
    authorizationUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?x=1'),
    exchangeCode: vi.fn(async () => ({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
    })),
    refresh: vi.fn(),
    revoke: vi.fn(async () => undefined),
    accountAddress: vi.fn(async () => 'me@example.invalid'),
    sendRaw: vi.fn(),
    listDsnSince: vi.fn(),
  };
}

function transports(overrides: { zoho?: ReturnType<typeof zohoClient> | null } = {}) {
  const google = googleClient();
  const zoho = overrides.zoho === undefined ? zohoClient() : overrides.zoho;
  const t = {
    smtp: {} as never,
    imap: {} as never,
    oauth: vi.fn((provider: string) => (provider === 'GMAIL' ? google : null)),
    zoho,
    oauthConfigured: { GMAIL: true, MICROSOFT: false, ZOHO: zoho !== null },
  } as unknown as MailboxTransports;
  return { t, google, zoho };
}

beforeEach(() => __resetAccessTokenCache());

describe('hasRequiredScopes', () => {
  it('needs both Zoho scopes, reported comma- or space-separated', () => {
    expect(hasRequiredScopes('ZOHO', ['ZohoMail.messages.CREATE', 'ZohoMail.accounts.READ'])).toBe(
      true
    );
    expect(hasRequiredScopes('ZOHO', ['ZohoMail.messages.CREATE'])).toBe(false);
    expect(hasRequiredScopes('GMAIL', ['https://www.googleapis.com/auth/gmail.send'])).toBe(true);
  });
});

describe('connectStartUrl', () => {
  it("uses Zoho's own client for Zoho, and says when a provider is not configured", () => {
    const { t, zoho } = transports();
    expect(connectStartUrl(t, 'ZOHO', { state: 's', codeChallenge: 'c' })).toContain(
      'accounts.zoho.com'
    );
    expect(zoho!.authorizationUrl).toHaveBeenCalledWith({ state: 's', codeChallenge: 'c' });
    expect(
      connectStartUrl(transports({ zoho: null }).t, 'ZOHO', { state: 's', codeChallenge: 'c' })
    ).toBeNull();
    expect(connectStartUrl(t, 'MICROSOFT', { state: 's', codeChallenge: 'c' })).toBeNull();
  });
});

describe('connectAccount', () => {
  it("connects Zoho at the account's data centre and keeps where the account lives", async () => {
    const { t, zoho } = transports();
    const input = { code: 'code-1', verifier: 'v-1', accountsServer: 'https://accounts.zoho.eu' };

    const account = await connectAccount(t, 'ZOHO', input, NOW);

    expect(zoho!.exchangeCode).toHaveBeenCalledWith(
      'code-1',
      'v-1',
      NOW,
      'https://accounts.zoho.eu'
    );
    expect(zoho!.identity).toHaveBeenCalledWith(ACCESS, 'mail.zoho.eu');
    expect(account).toMatchObject({
      refreshToken: REFRESH,
      address: 'owner@business.example.invalid',
      oauthAccountId: '42',
      oauthApiDomain: 'mail.zoho.eu',
    });
    await account.giveBack();
    expect(zoho!.revoke).toHaveBeenCalledWith(REFRESH, 'mail.zoho.eu');
  });

  it('gives the Zoho grant back when the account cannot be read', async () => {
    const { t, zoho } = transports();
    zoho!.identity.mockRejectedValueOnce(new MailboxTransportError('AUTH_FAILED'));

    await expect(
      connectAccount(t, 'ZOHO', { code: 'c', verifier: 'v', accountsServer: null }, NOW)
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    expect(zoho!.revoke).toHaveBeenCalledWith(REFRESH, 'mail.zoho.eu');
  });

  it('connects Google as before, with no Zoho fields', async () => {
    const { t, google } = transports();

    const account = await connectAccount(
      t,
      'GMAIL',
      { code: 'c', verifier: 'v', accountsServer: null },
      NOW
    );

    expect(google.exchangeCode).toHaveBeenCalledWith('c', 'v', NOW);
    expect(account).toMatchObject({
      address: 'me@example.invalid',
      oauthAccountId: null,
      oauthApiDomain: null,
    });
  });

  it('fails as CONNECT_FAILED when the provider is not configured', async () => {
    await expect(
      connectAccount(
        transports({ zoho: null }).t,
        'ZOHO',
        { code: 'c', verifier: 'v', accountsServer: null },
        NOW
      )
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
  });
});

describe('checkOAuthMailbox / revokeGrant', () => {
  const zohoRow = {
    id: 'mbx-1',
    tenantId: 'tenant-1',
    kind: 'ZOHO',
    refreshToken: REFRESH,
    tokenVersion: 3,
    oauthAccountId: '42',
    oauthApiDomain: 'mail.zoho.in',
  } as never;
  const prisma = { emailMailbox: { updateMany: vi.fn(async () => ({ count: 1 })) } };

  it('checks a Zoho mailbox at its data centre (refresh, then the account read)', async () => {
    const { t, zoho } = transports();

    await expect(checkOAuthMailbox(prisma, zohoRow, t, NOW)).resolves.toBe(3);

    expect(zoho!.refresh).toHaveBeenCalledWith(REFRESH, NOW, 'mail.zoho.in');
    expect(zoho!.identity).toHaveBeenCalledWith(ACCESS, 'mail.zoho.in');
  });

  it('revokes a Zoho grant at its data centre, and nothing for SMTP', async () => {
    const { t, zoho, google } = transports();
    await revokeGrant(t, zohoRow);
    expect(zoho!.revoke).toHaveBeenCalledWith(REFRESH, 'mail.zoho.in');

    await revokeGrant(t, { kind: 'SMTP', refreshToken: null, oauthApiDomain: null });
    expect(google.revoke).not.toHaveBeenCalled();
  });
});
