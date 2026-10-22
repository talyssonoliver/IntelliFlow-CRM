import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import { prismaMock, createTestContext, createAdminContext, TEST_UUIDS } from '../../../test/setup';

const logAction = vi.fn();
const logPermissionDenied = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied }),
}));

import { emailMailboxRouter, __resetConnectionTestLimiter } from '../email-mailbox.router';
import { __resetAccessTokenCache } from '../mailbox-transport';

const tenantId = TEST_UUIDS.tenant;
const secret = 'x'.repeat(22);
// What the field-encryption extension would have written (opaque to the router).
const storedCiphertext = 'c'.repeat(16);
const updatedAt = new Date(Date.UTC(2026, 9, 20));

const smtpRow = (over: Record<string, unknown> = {}) => ({
  id: 'mb1',
  tenantId,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@mail.example.com',
  fromName: null,
  smtpHost: 'smtp.mail.example.com',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'me@mail.example.com',
  smtpPassword: secret,
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  imapPassword: null,
  accountAddress: null,
  refreshToken: null,
  tokenVersion: 0,
  updatedAt,
  ...over,
});

function makeTransports() {
  const oauthClient = {
    authorizationUrl: vi.fn(
      ({ state, codeChallenge }: any) =>
        `https://accounts.google.com/auth?state=${state}&cc=${codeChallenge}`
    ),
    exchangeCode: vi.fn(async () => ({
      accessToken: 'at',
      refreshToken: secret,
      expiresAt: new Date(Date.UTC(2030, 0, 1)),
      scopes: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    })),
    accountAddress: vi.fn(async () => 'me@gmail.example'),
    revoke: vi.fn(async () => undefined),
    refresh: vi.fn(async () => ({
      accessToken: 'at2',
      refreshToken: secret,
      expiresAt: new Date(Date.UTC(2030, 0, 1)),
    })),
    sendRaw: vi.fn(),
    listDsnSince: vi.fn(),
  };
  return {
    oauthClient,
    transports: {
      smtp: { send: vi.fn(), verify: vi.fn(async () => undefined) },
      imap: { read: vi.fn(), verify: vi.fn(async () => undefined) },
      oauth: vi.fn((p: string) => (p === 'GMAIL' ? oauthClient : null)),
      oauthConfigured: { GMAIL: true, MICROSOFT: false },
    },
  };
}

let t: ReturnType<typeof makeTransports>;
const ctxWith = (base: any) => ({
  ...base,
  adapters: { ...base.adapters, mailboxTransports: t.transports, storageService: {} },
});
const member = () => emailMailboxRouter.createCaller(ctxWith(createTestContext()) as never);
const admin = () => emailMailboxRouter.createCaller(ctxWith(createAdminContext()) as never);

const saveInput = {
  scope: 'USER' as const,
  smtpHost: 'smtp.mail.example.com',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS' as const,
  smtpUsername: 'me@mail.example.com',
  smtpPassword: secret,
  fromAddress: 'me@mail.example.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', 'k'.repeat(44));
  __resetConnectionTestLimiter();
  __resetAccessTokenCache();
  t = makeTransports();
  logAction.mockResolvedValue('a');
  logPermissionDenied.mockResolvedValue('b');
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
  (prismaMock.emailMailbox.create as any).mockImplementation(async ({ data }: any) =>
    smtpRow({ ...data, smtpPassword: storedCiphertext })
  );
  (prismaMock.emailMailbox.update as any).mockImplementation(async ({ data }: any) =>
    smtpRow({ ...data, smtpPassword: storedCiphertext })
  );
  (prismaMock.emailMailbox.updateMany as any).mockResolvedValue({ count: 1 });
});

describe('emailMailbox.getMine / getTenant', () => {
  it('returns my mailbox (no secrets) and which OAuth providers are configured', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    const result = await member().getMine();
    expect(result.providersAvailable).toEqual({ GMAIL: true, MICROSOFT: false });
    expect(result.mailbox?.hasSmtpPassword).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(prismaMock.emailMailbox.findFirst).toHaveBeenCalledWith({
      where: { tenantId, scope: 'USER', userId: TEST_UUIDS.user1 },
    });
  });

  it('shows the company mailbox connection only to admins', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ scope: 'TENANT', userId: null })
    );
    await expect(member().getTenant()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const dto = await admin().getTenant();
    expect(dto?.smtpHost).toBe('smtp.mail.example.com');
    expect(prismaMock.emailMailbox.findFirst).toHaveBeenCalledWith({
      where: { tenantId, scope: 'TENANT' },
    });
  });
});

describe('emailMailbox.saveSmtp', () => {
  it('creates my SMTP mailbox with plain-string secrets and returns a secret-free DTO', async () => {
    const dto = await member().saveSmtp(saveInput);
    expect(prismaMock.emailMailbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        scope: 'USER',
        userId: TEST_UUIDS.user1,
        kind: 'SMTP',
        status: 'ACTIVE',
        lastErrorCode: null,
        smtpPassword: secret,
        refreshToken: null,
        accountAddress: null,
      }),
    });
    expect(JSON.stringify(dto)).not.toContain(secret);
    expect(JSON.stringify(dto)).not.toContain(storedCiphertext);
    expect(JSON.stringify(logAction.mock.calls)).not.toContain(secret);
    expect(logAction.mock.calls[0][4].afterState).toMatchObject({ smtpPassword: 'set' });
  });

  it('keeps the stored password when none is sent and updates in place', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    await member().saveSmtp({ ...saveInput, smtpPassword: undefined });
    const data = (prismaMock.emailMailbox.update as any).mock.calls[0][0].data;
    expect(data).not.toHaveProperty('smtpPassword');
    // Only the row that was read and validated: a save meanwhile is not overwritten.
    expect((prismaMock.emailMailbox.update as any).mock.calls[0][0].where).toEqual({
      id: 'mb1',
      tenantId,
      tokenVersion: 0,
    });
  });

  it('new credentials end any in-flight bounce scan lease (its stale writes are refused)', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    await member().saveSmtp(saveInput);
    const data = (prismaMock.emailMailbox.update as any).mock.calls[0][0].data;
    expect(data.lockedUntil).toBeNull();
  });

  it('saving working credentials clears the bounce-scan failure streak', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow({ failureCount: 5 }));
    await member().saveSmtp(saveInput);
    const data = (prismaMock.emailMailbox.update as any).mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'ACTIVE', failureCount: 0 });
    expect(data.nextScanAt).toBeInstanceOf(Date);
  });

  it('never reuses a stored password for a different server or username', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({
        imapHost: 'imap.mail.example.com',
        imapPort: 993,
        imapUsername: 'u',
        imapPassword: secret,
      })
    );
    await expect(
      member().saveSmtp({
        ...saveInput,
        smtpPassword: undefined,
        smtpHost: 'smtp.other.example.com',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      member().saveSmtp({
        ...saveInput,
        smtpPassword: undefined,
        smtpUsername: 'other@mail.example.com',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      member().saveSmtp({
        ...saveInput,
        smtpPassword: undefined,
        imapHost: 'imap.other.example.com',
        imapPort: 993,
        imapUsername: 'u',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prismaMock.emailMailbox.update).not.toHaveBeenCalled();
  });

  it('starts bounce reading afresh when the IMAP account changes', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({
        imapHost: 'imap.mail.example.com',
        imapPort: 993,
        imapUsername: 'old',
        imapPassword: secret,
      })
    );
    await member().saveSmtp({
      ...saveInput,
      smtpPassword: undefined,
      imapHost: 'imap.mail.example.com',
      imapPort: 993,
      imapUsername: 'new',
      imapPassword: secret,
    });
    expect((prismaMock.emailMailbox.update as any).mock.calls[0][0].data).toMatchObject({
      imapUidValidity: null,
      imapLastUid: null,
      scanCursorAt: null,
    });
  });

  it('keeps the bounce cursor when the IMAP account is unchanged', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({
        imapHost: 'imap.mail.example.com',
        imapPort: 993,
        imapUsername: 'u',
        imapPassword: secret,
      })
    );
    await member().saveSmtp({
      ...saveInput,
      smtpPassword: undefined,
      imapHost: 'imap.mail.example.com',
      imapPort: 993,
      imapUsername: 'u',
    });
    expect((prismaMock.emailMailbox.update as any).mock.calls[0][0].data).not.toHaveProperty(
      'imapLastUid'
    );
  });

  it('requires a password for a new mailbox', async () => {
    await expect(
      member().saveSmtp({ ...saveInput, smtpPassword: undefined })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('clearing the password disconnects the mailbox', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    await member().saveSmtp({ ...saveInput, smtpPassword: null });
    expect((prismaMock.emailMailbox.update as any).mock.calls[0][0].data).toMatchObject({
      smtpPassword: null,
      status: 'DISCONNECTED',
    });
  });

  it('switching from an OAuth mailbox to SMTP drops the refresh token', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ kind: 'GMAIL', refreshToken: secret })
    );
    await member().saveSmtp(saveInput);
    expect((prismaMock.emailMailbox.update as any).mock.calls[0][0].data).toMatchObject({
      kind: 'SMTP',
      refreshToken: null,
      accountAddress: null,
    });
  });

  it('stores IMAP settings for bounce reading and requires an IMAP password', async () => {
    await member().saveSmtp({
      ...saveInput,
      imapHost: 'imap.mail.example.com',
      imapPort: 993,
      imapUsername: 'me@mail.example.com',
      imapPassword: secret,
    });
    expect((prismaMock.emailMailbox.create as any).mock.calls[0][0].data).toMatchObject({
      imapHost: 'imap.mail.example.com',
      imapPort: 993,
      imapPassword: secret,
    });
    vi.clearAllMocks();
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(null);
    await expect(
      member().saveSmtp({
        ...saveInput,
        imapHost: 'imap.mail.example.com',
        imapPort: 993,
        imapUsername: 'me@mail.example.com',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses to store secrets without the encryption key (nothing written)', async () => {
    vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', '');
    await expect(member().saveSmtp(saveInput)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prismaMock.emailMailbox.create).not.toHaveBeenCalled();
    expect(prismaMock.emailMailbox.update).not.toHaveBeenCalled();
  });

  it('lets only admins configure the company mailbox', async () => {
    await expect(member().saveSmtp({ ...saveInput, scope: 'TENANT' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await admin().saveSmtp({ ...saveInput, scope: 'TENANT' });
    expect((prismaMock.emailMailbox.create as any).mock.calls[0][0].data).toMatchObject({
      scope: 'TENANT',
      userId: null,
    });
  });

  it('maps a racing duplicate mailbox to CONFLICT', async () => {
    (prismaMock.emailMailbox.create as any).mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' })
    );
    await expect(member().saveSmtp(saveInput)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('a save that raced another save is CONFLICT, so a kept password never meets another server (codex HIGH)', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow({ tokenVersion: 3 }));
    // Another save moved tokenVersion on after this one read and validated the row.
    (prismaMock.emailMailbox.update as any).mockRejectedValueOnce(
      Object.assign(new Error('not found'), { code: 'P2025' })
    );
    await expect(
      member().saveSmtp({ ...saveInput, smtpPassword: undefined })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((prismaMock.emailMailbox.update as any).mock.calls[0][0].where).toEqual({
      id: 'mb1',
      tenantId,
      tokenVersion: 3,
    });
  });

  it('refuses an unverified user (verifiedTenantProcedure)', async () => {
    const ctx = ctxWith(
      createTestContext({ user: { ...createTestContext().user!, emailVerified: false } } as never)
    );
    await expect(
      emailMailboxRouter.createCaller(ctx as never).saveSmtp(saveInput)
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('emailMailbox.testConnection', () => {
  it('verifies SMTP (and IMAP when set), marks the mailbox ACTIVE and returns ok', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({
        imapHost: 'imap.mail.example.com',
        imapPort: 993,
        imapUsername: 'u',
        imapPassword: secret,
      })
    );
    await expect(member().testConnection({ scope: 'USER' })).resolves.toEqual({
      ok: true,
      code: null,
    });
    expect(t.transports.smtp.verify).toHaveBeenCalled();
    expect(t.transports.imap.verify).toHaveBeenCalledWith({
      host: 'imap.mail.example.com',
      port: 993,
      username: 'u',
      password: secret,
    });
    expect(prismaMock.emailMailbox.updateMany).toHaveBeenCalledWith({
      // Only the credentials tested: a save or disconnect meanwhile stands.
      where: { id: 'mb1', tenantId, tokenVersion: 0 },
      // A repaired mailbox starts bounce reading afresh, not on its old failure streak.
      data: {
        status: 'ACTIVE',
        lastErrorCode: null,
        failureCount: 0,
        nextScanAt: expect.any(Date),
      },
    });
  });

  it('returns a coded failure and marks ERROR on authentication failure', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    t.transports.smtp.verify.mockRejectedValueOnce(new MailboxTransportError('AUTH_FAILED'));
    await expect(member().testConnection({ scope: 'USER' })).resolves.toEqual({
      ok: false,
      code: 'AUTH_FAILED',
    });
    expect(prismaMock.emailMailbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'mb1', tenantId, tokenVersion: 0 },
      data: { status: 'ERROR', lastErrorCode: 'AUTH_FAILED' },
    });
  });

  it('records an OAuth test against the version it rotated to, not the one it read', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ kind: 'GMAIL', smtpHost: null, smtpPassword: null, refreshToken: secret })
    );
    // The provider rotates the refresh token; storing it moves the version to 1.
    t.oauthClient.refresh.mockResolvedValueOnce({
      accessToken: 'at-rotated',
      refreshToken: 'r'.repeat(20),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    (prismaMock.emailMailbox.updateMany as any).mockResolvedValue({ count: 1 });
    await expect(member().testConnection({ scope: 'USER' })).resolves.toEqual({
      ok: true,
      code: null,
    });
    const writes = (prismaMock.emailMailbox.updateMany as any).mock.calls.map((c: any) => c[0]);
    expect(writes.at(-1).where).toEqual({ id: 'mb1', tenantId, tokenVersion: 1 });
  });

  it('checks an OAuth mailbox by refreshing and reading the account address', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({
        kind: 'GMAIL',
        smtpHost: null,
        smtpPassword: null,
        refreshToken: secret,
        accountAddress: 'me@gmail.example',
      })
    );
    await expect(member().testConnection({ scope: 'USER' })).resolves.toEqual({
      ok: true,
      code: null,
    });
    expect(t.oauthClient.accountAddress).toHaveBeenCalledWith('at2');
  });

  it('is NOT_FOUND without a mailbox and rate-limited to 5 per minute', async () => {
    await expect(member().testConnection({ scope: 'USER' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(smtpRow());
    for (let i = 0; i < 4; i++) await member().testConnection({ scope: 'USER' });
    await expect(member().testConnection({ scope: 'USER' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('forbids members from testing the company mailbox', async () => {
    await expect(member().testConnection({ scope: 'TENANT' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('emailMailbox OAuth connect', () => {
  it('starts with a hashed single-use state, a PKCE challenge and an encrypted verifier', async () => {
    (prismaMock.emailOAuthState.create as any).mockResolvedValue({});
    const { url } = await member().oauthStart({ provider: 'GMAIL', scope: 'USER' });
    const state = new URL(url).searchParams.get('state')!;
    const data = (prismaMock.emailOAuthState.create as any).mock.calls[0][0].data;
    expect(data.stateHash).toBe(createHash('sha256').update(state).digest('hex'));
    expect(data).toMatchObject({
      tenantId,
      userId: TEST_UUIDS.user1,
      scope: 'USER',
      provider: 'GMAIL',
    });
    expect(new URL(url).searchParams.get('cc')).toBe(
      createHash('sha256').update(data.codeVerifier).digest('base64url')
    );
    expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
  });

  it('refuses an unconfigured provider and missing encryption key', async () => {
    await expect(
      member().oauthStart({ provider: 'MICROSOFT', scope: 'USER' })
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', '');
    await expect(member().oauthStart({ provider: 'GMAIL', scope: 'USER' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(prismaMock.emailOAuthState.create).not.toHaveBeenCalled();
  });

  it('completes: consumes the state once, binds the verified address and stores the refresh token', async () => {
    const state = 's'.repeat(43);
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v'.repeat(43),
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    const dto = await member().oauthComplete({ provider: 'GMAIL', code: 'c'.repeat(20), state });
    expect(prismaMock.emailOAuthState.findFirst).toHaveBeenCalledWith({
      where: {
        stateHash: createHash('sha256').update(state).digest('hex'),
        tenantId,
        userId: TEST_UUIDS.user1,
        provider: 'GMAIL',
      },
    });
    expect(prismaMock.emailOAuthState.deleteMany).toHaveBeenCalledWith({
      where: { id: 'st1', tenantId, userId: TEST_UUIDS.user1, provider: 'GMAIL' },
    });
    expect(t.oauthClient.exchangeCode).toHaveBeenCalledWith(
      'c'.repeat(20),
      'v'.repeat(43),
      expect.any(Date)
    );
    expect((prismaMock.emailMailbox.create as any).mock.calls[0][0].data).toMatchObject({
      kind: 'GMAIL',
      scope: 'USER',
      userId: TEST_UUIDS.user1,
      status: 'ACTIVE',
      fromAddress: 'me@gmail.example',
      accountAddress: 'me@gmail.example',
      refreshToken: secret,
      smtpPassword: null,
    });
    expect(JSON.stringify(dto)).not.toContain(secret);
  });

  it('refuses an unknown, foreign, expired or replayed state (nothing exchanged)', async () => {
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue(null);
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c', state: 's'.repeat(43) })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v',
      expiresAt: new Date(Date.now() - 1),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c', state: 's'.repeat(43) })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 0 });
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c', state: 's'.repeat(43) })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(t.oauthClient.exchangeCode).not.toHaveBeenCalled();
  });

  it('refuses (and revokes) a grant missing the send or read permission', async () => {
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v'.repeat(43),
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    t.oauthClient.exchangeCode.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: secret,
      expiresAt: new Date(Date.UTC(2030, 0, 1)),
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.send'],
    });
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c'.repeat(20), state: 's'.repeat(43) })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/^MISSING_PERMISSIONS/),
    });
    expect(t.oauthClient.revoke).toHaveBeenCalledWith(secret);
    expect(prismaMock.emailMailbox.create).not.toHaveBeenCalled();
    expect(prismaMock.emailMailbox.update).not.toHaveBeenCalled();
  });

  it('reconnecting an existing mailbox moves its credential version on', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ kind: 'GMAIL', smtpPassword: null, refreshToken: secret, tokenVersion: 4 })
    );
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v'.repeat(43),
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    await member().oauthComplete({
      provider: 'GMAIL',
      code: 'c'.repeat(20),
      state: 's'.repeat(43),
    });
    const data = (prismaMock.emailMailbox.update as any).mock.calls[0][0].data;
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(data).toMatchObject({ status: 'ACTIVE', failureCount: 0 });
  });

  it('gives the new grant back when a racing save wins the reconnect (CONFLICT)', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ kind: 'GMAIL', smtpPassword: null, refreshToken: 'old', tokenVersion: 4 })
    );
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v'.repeat(43),
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    (prismaMock.emailMailbox.update as any).mockRejectedValueOnce(
      Object.assign(new Error('not found'), { code: 'P2025' })
    );
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c'.repeat(20), state: 's'.repeat(43) })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(t.oauthClient.revoke).toHaveBeenCalledWith(secret);
    expect(t.oauthClient.revoke).not.toHaveBeenCalledWith('old');
  });

  it('maps a provider failure during completion to a coded BAD_REQUEST', async () => {
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'USER',
      codeVerifier: 'v',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    t.oauthClient.accountAddress.mockRejectedValueOnce(new MailboxTransportError('AUTH_FAILED'));
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c', state: 's'.repeat(43) })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('AUTH_FAILED'),
    });
    expect(prismaMock.emailMailbox.create).not.toHaveBeenCalled();
  });

  it('a company-mailbox state needs an admin at completion too', async () => {
    (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
      id: 'st1',
      scope: 'TENANT',
      codeVerifier: 'v',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
    await expect(
      member().oauthComplete({ provider: 'GMAIL', code: 'c', state: 's'.repeat(43) })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('emailMailbox.disconnect', () => {
  it('revokes an OAuth grant, deletes every secret and marks DISCONNECTED', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ kind: 'GMAIL', refreshToken: secret, smtpPassword: null })
    );
    await expect(member().disconnect({ scope: 'USER' })).resolves.toEqual({ disconnected: true });
    expect(t.oauthClient.revoke).toHaveBeenCalledWith(secret);
    expect(prismaMock.emailMailbox.update).toHaveBeenCalledWith({
      where: { id: 'mb1' },
      data: {
        status: 'DISCONNECTED',
        lastErrorCode: null,
        smtpPassword: null,
        imapPassword: null,
        refreshToken: null,
        imapUidValidity: null,
        imapLastUid: null,
        scanCursorAt: null,
        tokenVersion: { increment: 1 },
        // An in-flight bounce scan loses its lease and writes nothing back.
        lockedUntil: null,
      },
    });
  });

  it('still deletes the secrets when the provider revoke fails', async () => {
    (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
      smtpRow({ kind: 'GMAIL', refreshToken: secret, smtpPassword: null })
    );
    t.oauthClient.revoke.mockRejectedValueOnce(new Error('down'));
    await member().disconnect({ scope: 'USER' });
    expect(prismaMock.emailMailbox.update).toHaveBeenCalled();
  });

  it('is NOT_FOUND without a mailbox; members cannot disconnect the company mailbox', async () => {
    await expect(member().disconnect({ scope: 'USER' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(member().disconnect({ scope: 'TENANT' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
