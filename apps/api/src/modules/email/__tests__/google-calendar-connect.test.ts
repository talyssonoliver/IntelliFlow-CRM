/**
 * MVP-013: connecting a Google mailbox also asks to use the calendar. Google lets the user untick
 * it, and a domain whose admin does not trust Aurora grants less: the mailbox is kept for mail
 * either way, and says whether the calendar permission is there (calendarAccess), so settings can
 * show a card when it is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_SMTP_ACCOUNT, NO_SMTP_ENDPOINT } from '@intelliflow/validators';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: vi.fn(async () => 'a'), logPermissionDenied: vi.fn() }),
}));

import { emailMailboxRouter } from '../email-mailbox.router';
import { __resetAccessTokenCache } from '../mailbox-transport';

const SEND = 'https://www.googleapis.com/auth/gmail.send';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';
const CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
// Not a real credential: built at runtime so nothing secret-shaped sits in the source.
const REFRESH = ['refresh', 'for', 'tests'].join('-');

function googleClient(granted: string[]) {
  return {
    clientId: ['1234', 'apps.googleusercontent.example.invalid'].join('-'),
    authorizationUrl: vi.fn(),
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
const caller = () => {
  const base = createTestContext() as any;
  const transports = {
    smtp: {} as never,
    imap: {} as never,
    oauth: vi.fn((p: string) => (p === 'GMAIL' ? google : null)),
    zoho: null,
    oauthConfigured: { GMAIL: true, MICROSOFT: false, ZOHO: false },
  };
  return emailMailboxRouter.createCaller({
    ...base,
    adapters: { ...base.adapters, mailboxTransports: transports, storageService: {} },
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
  updatedAt: new Date(Date.UTC(2026, 10, 19)),
  ...data,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', 'k'.repeat(44));
  __resetAccessTokenCache();
  google = googleClient([SEND, READ, CALENDAR]);
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.create as any).mockImplementation(async ({ data }: any) =>
    mailboxRow(data)
  );
  (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
    id: 'st1',
    scope: 'USER',
    codeVerifier: 'v'.repeat(43),
    expiresAt: new Date(Date.now() + 60_000),
  });
  (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
});

const complete = () =>
  caller().oauthComplete({ provider: 'GMAIL', code: 'c'.repeat(20), state: 's'.repeat(43) });

describe('connecting Google asks to use the calendar too (MVP-013)', () => {
  it('stores the calendar permission with the others, and says it is granted', async () => {
    const dto = await complete();

    expect((prismaMock.emailMailbox.create as any).mock.calls[0][0].data.grantedScopes).toEqual([
      'openid',
      SEND,
      READ,
      CALENDAR,
    ]);
    expect(dto).toMatchObject({ status: 'ACTIVE', replySync: 'ON', calendarAccess: 'GRANTED' });
  });

  it('keeps the mailbox when the user unticked the calendar, and says it is not granted', async () => {
    google = googleClient([SEND, READ]);

    const dto = await complete();

    expect(dto).toMatchObject({
      kind: 'GMAIL',
      status: 'ACTIVE',
      replySync: 'ON',
      calendarAccess: 'NOT_GRANTED',
    });
    // Kept for mail, so the grant is not given back.
    expect(google.revoke).not.toHaveBeenCalled();
  });

  it('a domain that grants send only has no calendar either, and waits for its admin', async () => {
    google = googleClient([SEND]);

    const dto = await complete();

    expect(dto).toMatchObject({
      status: 'ACTIVE',
      replySync: 'NEEDS_ADMIN_TRUST',
      calendarAccess: 'NOT_GRANTED',
    });
  });

  it('the settings page gets calendarAccess for a mailbox connected before it was asked for', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      mailboxRow({
        kind: 'GMAIL',
        fromAddress: 'owner@studio.example.invalid',
        accountAddress: 'owner@studio.example.invalid',
        refreshToken: REFRESH,
        grantedScopes: [SEND, READ],
      })
    );

    const mine = await caller().getMine();

    expect(mine.mailbox).toMatchObject({ kind: 'GMAIL', calendarAccess: 'NOT_GRANTED' });
  });
});
