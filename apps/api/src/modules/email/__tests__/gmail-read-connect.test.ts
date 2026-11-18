/**
 * MVP-011: connecting a Google mailbox asks for read as well as send. A Workspace domain whose admin
 * does not trust Aurora grants send only (or blocks the sign-in, then the user signs in for sending
 * only): the mailbox is kept for sending, and says it waits for the admin (NEEDS_ADMIN_TRUST).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_SMTP_ACCOUNT, NO_SMTP_ENDPOINT } from '@intelliflow/validators';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: vi.fn(async () => 'a'), logPermissionDenied: vi.fn() }),
}));

import { emailMailboxRouter } from '../email-mailbox.router';
import { connectStartUrl, googleClientId } from '../oauth-connect';
import { __resetAccessTokenCache, type MailboxTransports } from '../mailbox-transport';

const SEND = 'https://www.googleapis.com/auth/gmail.send';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';
// Not a real credential: built at runtime so nothing secret-shaped sits in the source.
const REFRESH = ['refresh', 'for', 'tests'].join('-');
const CLIENT_ID = ['1234', 'apps.googleusercontent.example.invalid'].join('-');

function googleClient(granted: string[]) {
  return {
    clientId: CLIENT_ID,
    authorizationUrl: vi.fn(
      ({ state }: { state: string }) => `https://accounts.google.com/auth?state=${state}`
    ),
    exchangeCode: vi.fn(async () => ({
      accessToken: 'at',
      refreshToken: REFRESH,
      expiresAt: new Date(Date.UTC(2030, 0, 1)),
      scopes: ['openid', ...granted],
    })),
    accountAddress: vi.fn(async () => 'owner@studio.example.invalid'),
    revoke: vi.fn(async () => undefined),
    refresh: vi.fn(),
    sendRaw: vi.fn(),
    listDsnSince: vi.fn(),
  };
}

let google: ReturnType<typeof googleClient>;
function transports(client: ReturnType<typeof googleClient> | null = google) {
  return {
    smtp: {} as never,
    imap: {} as never,
    oauth: vi.fn((p: string) => (p === 'GMAIL' ? client : null)),
    zoho: null,
    oauthConfigured: { GMAIL: client !== null, MICROSOFT: false, ZOHO: false },
  };
}
const caller = (t = transports()) => {
  const base = createTestContext() as any;
  return emailMailboxRouter.createCaller({
    ...base,
    adapters: { ...base.adapters, mailboxTransports: t, storageService: {} },
  } as never);
};

const mailboxRow = (data: Record<string, unknown>) => ({
  id: 'mb1',
  tenantId: TEST_UUIDS.tenant,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  status: 'ACTIVE',
  lastErrorCode: null,
  fromName: null,
  ...NO_SMTP_ENDPOINT,
  ...NO_SMTP_ACCOUNT,
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  imapPassword: null,
  tokenVersion: 0,
  updatedAt: new Date(Date.UTC(2026, 10, 18)),
  ...data,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', 'k'.repeat(44));
  __resetAccessTokenCache();
  google = googleClient([SEND, READ]);
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.create as any).mockImplementation(async ({ data }: any) =>
    mailboxRow(data)
  );
  (prismaMock.emailOAuthState.create as any).mockResolvedValue({});
  (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
    id: 'st1',
    scope: 'USER',
    codeVerifier: 'v'.repeat(43),
    expiresAt: new Date(Date.now() + 60_000),
  });
  (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
});

const complete = (t = transports()) =>
  caller(t).oauthComplete({ provider: 'GMAIL', code: 'c'.repeat(20), state: 's'.repeat(43) });

describe('connecting Google asks for read as well as send (MVP-011)', () => {
  it('starts with reading by default, and for sending only when asked', async () => {
    await caller().oauthStart({ provider: 'GMAIL', scope: 'USER' });
    expect(google.authorizationUrl.mock.calls[0]?.[0]).not.toHaveProperty('sendOnly');
    await caller().oauthStart({ provider: 'GMAIL', scope: 'USER', sendOnly: true });
    expect(google.authorizationUrl.mock.calls[1]?.[0]).toMatchObject({ sendOnly: true });
  });

  it('a domain that trusts Aurora grants read: replies are logged', async () => {
    const dto = await complete();
    expect((prismaMock.emailMailbox.create as any).mock.calls[0][0].data.grantedScopes).toEqual([
      'openid',
      SEND,
      READ,
    ]);
    expect(dto.replySync).toBe('ON');
  });

  it('a domain that does not trust Aurora grants send only: the mailbox is kept for sending', async () => {
    google = googleClient([SEND]);
    const dto = await complete();
    expect(dto).toMatchObject({ kind: 'GMAIL', status: 'ACTIVE', replySync: 'NEEDS_ADMIN_TRUST' });
    // Kept, so the grant is not given back.
    expect(google.revoke).not.toHaveBeenCalled();
  });

  it('still refuses a grant that cannot even send', async () => {
    google = googleClient([READ]);
    await expect(complete()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(google.revoke).toHaveBeenCalledWith(REFRESH);
    expect(prismaMock.emailMailbox.create).not.toHaveBeenCalled();
  });

  it('tells the settings page the client id an admin trusts, or null without Google', async () => {
    await expect(caller().getMine()).resolves.toMatchObject({ googleClientId: CLIENT_ID });
    await expect(caller(transports(null)).getMine()).resolves.toMatchObject({
      googleClientId: null,
    });
  });
});

describe('connectStartUrl / googleClientId', () => {
  const pkce = { state: 's', codeChallenge: 'c' };

  it('passes sendOnly to Google only', () => {
    const microsoft = {
      ...googleClient([]),
      authorizationUrl: vi.fn(() => 'https://login.example.invalid'),
    };
    const zoho = { authorizationUrl: vi.fn(() => 'https://accounts.zoho.example.invalid') };
    const t = {
      oauth: (p: string) => (p === 'GMAIL' ? google : microsoft),
      zoho,
    } as unknown as MailboxTransports;
    connectStartUrl(t, 'GMAIL', { ...pkce, sendOnly: true });
    expect(google.authorizationUrl).toHaveBeenCalledWith({ ...pkce, sendOnly: true });
    connectStartUrl(t, 'GMAIL', { ...pkce, sendOnly: false });
    expect(google.authorizationUrl).toHaveBeenLastCalledWith(pkce);
    connectStartUrl(t, 'MICROSOFT', { ...pkce, sendOnly: true });
    expect(microsoft.authorizationUrl).toHaveBeenCalledWith(pkce);
    connectStartUrl(t, 'ZOHO', { ...pkce, sendOnly: true });
    expect(zoho.authorizationUrl).toHaveBeenCalledWith(pkce);
  });

  it('reads the client id from the Google client', () => {
    expect(googleClientId(transports() as unknown as MailboxTransports)).toBe(CLIENT_ID);
    expect(googleClientId(transports(null) as unknown as MailboxTransports)).toBeNull();
  });
});
