/**
 * PG-207 SEC-02/03 (runner ACs 1–2): mailbox secrets — SMTP/IMAP passwords,
 * OAuth refresh tokens, PKCE verifiers — are never returned by any procedure
 * and never reach a log line or an audit entry, on success or error paths.
 *
 * Every Prisma row below carries the secret in plaintext, exactly as the
 * field-encryption extension hands it back after decrypting.
 */
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { inferRouterOutputs } from '@trpc/server';
import { MailboxTransportError } from '@intelliflow/adapters';
import { prismaMock, createTestContext, createAdminContext, TEST_UUIDS } from '../../../test/setup';

const audit = vi.hoisted(() => ({ logAction: vi.fn(), logPermissionDenied: vi.fn() }));
vi.mock('../../../security/audit-logger', () => ({ getAuditLogger: () => audit }));

const transport = vi.hoisted(() => ({ send: vi.fn(), claim: vi.fn() }));
vi.mock('../mailbox-transport', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  sendThroughMailbox: transport.send,
  claimSendSlot: transport.claim,
}));

import { emailMailboxRouter, __resetConnectionTestLimiter } from '../email-mailbox.router';
import { emailSettingsRouter } from '../email-settings.router';
import { emailSignaturesRouter } from '../email-signatures.router';
import { emailAttachmentsRouter } from '../email-attachments.router';
import { inboundEmailRouter } from '../inbound.router';
import { __resetAccessTokenCache } from '../mailbox-transport';

const tenantId = TEST_UUIDS.tenant;
// Repeated placeholder characters: secret-shaped only in length, never in form.
const SMTP_SECRET = 'p'.repeat(24);
const IMAP_SECRET = 'q'.repeat(24);
const TOKEN_SECRET = 'r'.repeat(40);
const VERIFIER_SECRET = 'v'.repeat(43);
const SECRETS = [SMTP_SECRET, IMAP_SECRET, TOKEN_SECRET, VERIFIER_SECRET];

const row = (over: Record<string, unknown> = {}) => ({
  id: 'mb1',
  tenantId,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@mail.example.invalid',
  fromName: null,
  smtpHost: 'smtp.mail.example.invalid',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'me@mail.example.invalid',
  smtpPassword: SMTP_SECRET,
  imapHost: 'imap.mail.example.invalid',
  imapPort: 993,
  imapUsername: 'me@mail.example.invalid',
  imapPassword: IMAP_SECRET,
  accountAddress: null,
  refreshToken: null,
  tokenVersion: 0,
  updatedAt: new Date(Date.UTC(2026, 9, 20)),
  ...over,
});

function transports() {
  const oauthClient = {
    authorizationUrl: vi.fn(
      ({ state }: any) => `https://accounts.example.invalid/auth?state=${state}`
    ),
    exchangeCode: vi.fn(async () => ({
      accessToken: 'a'.repeat(30),
      refreshToken: TOKEN_SECRET,
      expiresAt: new Date(Date.UTC(2030, 0, 1)),
      scopes: ['openid', 'email'],
    })),
    accountAddress: vi.fn(async () => 'me@gmail.example.invalid'),
    revoke: vi.fn(async () => {
      throw new Error(`revoke failed for ${TOKEN_SECRET}`);
    }),
    refresh: vi.fn(async () => {
      throw new MailboxTransportError('TOKEN_REVOKED');
    }),
    sendRaw: vi.fn(),
    listDsnSince: vi.fn(),
  };
  return {
    smtp: {
      send: vi.fn(),
      verify: vi.fn(async () => {
        throw new Error(`535 auth failed for ${SMTP_SECRET}`);
      }),
    },
    imap: { read: vi.fn(), verify: vi.fn(async () => undefined) },
    oauth: vi.fn((p: string) => (p === 'GMAIL' ? oauthClient : null)),
    oauthConfigured: { GMAIL: true, MICROSOFT: false },
  };
}

const withAdapters = (base: any) => ({
  ...base,
  adapters: { ...base.adapters, mailboxTransports: transports(), storageService: {} },
});
const ctxs = () => [withAdapters(createTestContext()), withAdapters(createAdminContext())];

let consoleCalls: unknown[][];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PRISMA_FIELD_ENCRYPTION_KEY', 'k'.repeat(44));
  __resetConnectionTestLimiter();
  __resetAccessTokenCache();
  consoleCalls = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
  audit.logAction.mockResolvedValue('a');
  audit.logPermissionDenied.mockResolvedValue('b');
  transport.claim.mockResolvedValue(undefined);
  transport.send.mockRejectedValue(new Error(`550 rejected, password ${SMTP_SECRET}`));
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) =>
    typeof fn === 'function' ? fn(prismaMock) : Promise.all(fn)
  );
  (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(row());
  (prismaMock.emailMailbox.findMany as any).mockResolvedValue([row()]);
  (prismaMock.emailMailbox.create as any).mockImplementation(async ({ data }: any) => row(data));
  (prismaMock.emailMailbox.update as any).mockImplementation(async ({ data }: any) => row(data));
  (prismaMock.emailMailbox.updateMany as any).mockResolvedValue({ count: 1 });
  (prismaMock.emailOAuthState.create as any).mockResolvedValue({});
  (prismaMock.emailOAuthState.findFirst as any).mockResolvedValue({
    id: 'st1',
    scope: 'USER',
    codeVerifier: VERIFIER_SECRET,
    expiresAt: new Date(Date.now() + 60_000),
  });
  (prismaMock.emailOAuthState.deleteMany as any).mockResolvedValue({ count: 1 });
  (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
  (prismaMock.tenantEmailSettings.upsert as any).mockResolvedValue({});
  (prismaMock.emailSuppression.findMany as any).mockResolvedValue([]);
  (prismaMock.emailRecord.create as any).mockResolvedValue({ id: 'rec-1' });
  (prismaMock.emailRecord.update as any).mockResolvedValue({});
  (prismaMock.emailSignature.findMany as any).mockResolvedValue([]);
});

/** Runs a call, returning its value or its error, so both are inspected. */
async function settle(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    const e = error as { message?: string; code?: string; cause?: unknown };
    return { message: e.message, code: e.code, cause: e.cause };
  }
}

function expectNoSecret(label: string, value: unknown): void {
  const text = JSON.stringify(value) ?? '';
  for (const s of SECRETS) expect(text, `${label} leaked a secret`).not.toContain(s);
}

describe('no mailbox secret ever leaves the server', () => {
  it('is absent from every procedure result and error, every log line and every audit entry', async () => {
    const outputs: Array<[string, unknown]> = [];
    for (const ctx of ctxs()) {
      const mailbox = emailMailboxRouter.createCaller(ctx as never);
      const settings = emailSettingsRouter.createCaller(ctx as never);
      const signatures = emailSignaturesRouter.createCaller(ctx as never);
      const attachments = emailAttachmentsRouter.createCaller(ctx as never);
      const email = inboundEmailRouter.createCaller(ctx as never);
      const role = ctx.user.role;

      outputs.push(
        [`${role} getMine`, await settle(() => mailbox.getMine())],
        [`${role} getTenant`, await settle(() => mailbox.getTenant())],
        [
          `${role} saveSmtp`,
          await settle(() =>
            mailbox.saveSmtp({
              scope: 'USER',
              smtpHost: 'smtp.mail.example.invalid',
              smtpPort: 587,
              smtpSecurity: 'STARTTLS',
              smtpUsername: 'me@mail.example.invalid',
              smtpPassword: SMTP_SECRET,
              imapHost: 'imap.mail.example.invalid',
              imapPort: 993,
              imapUsername: 'me@mail.example.invalid',
              imapPassword: IMAP_SECRET,
              fromAddress: 'me@mail.example.invalid',
            } as never)
          ),
        ],
        [
          `${role} testConnection smtp`,
          await settle(() => mailbox.testConnection({ scope: 'USER' })),
        ],
        [
          `${role} oauthStart`,
          await settle(() => mailbox.oauthStart({ provider: 'GMAIL', scope: 'USER' })),
        ],
        [
          `${role} oauthComplete`,
          await settle(() =>
            mailbox.oauthComplete({
              provider: 'GMAIL',
              code: 'c'.repeat(20),
              state: 's'.repeat(43),
            })
          ),
        ],
        [
          `${role} sendEmail`,
          await settle(() =>
            email.sendEmail({ to: ['a@example.invalid'], subject: 'Hi', htmlBody: '<p>x</p>' })
          ),
        ],
        [`${role} settings.get`, await settle(() => settings.get())],
        [`${role} signatures.list`, await settle(() => signatures.list())],
        [
          `${role} attachments.upload`,
          await settle(() =>
            attachments.upload({
              fileName: 'a.pdf',
              contentType: 'application/pdf',
              contentBase64: 'cGRm',
            } as never)
          ),
        ]
      );

      // OAuth mailbox: refresh failure and a failed revoke during disconnect.
      (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(
        row({ kind: 'GMAIL', smtpPassword: null, imapPassword: null, refreshToken: TOKEN_SECRET })
      );
      outputs.push(
        [
          `${role} testConnection oauth`,
          await settle(() => mailbox.testConnection({ scope: 'USER' })),
        ],
        [`${role} disconnect`, await settle(() => mailbox.disconnect({ scope: 'USER' }))]
      );
      (prismaMock.emailMailbox.findFirst as any).mockResolvedValue(row());
      __resetConnectionTestLimiter();
    }

    // The sweep really exercised the secret-bearing paths.
    expect(outputs.length).toBe(24);
    expect(transport.send).toHaveBeenCalled();
    expect(prismaMock.emailMailbox.update).toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalled();
    expect(consoleCalls.length).toBeGreaterThan(0);

    for (const [label, value] of outputs) expectNoSecret(label, value);
    consoleCalls.forEach((args, i) => expectNoSecret(`console call ${i}`, args.map(String)));
    consoleCalls.forEach((args, i) => expectNoSecret(`console call ${i} (structured)`, args));
    for (const fn of [audit.logAction, audit.logPermissionDenied]) {
      fn.mock.calls.forEach((args, i) => expectNoSecret(`audit call ${i}`, args));
    }
  });
});

type SecretKey = 'smtpPassword' | 'imapPassword' | 'refreshToken' | 'codeVerifier' | 'accessToken';
type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends Date
    ? never
    : T extends object
      ? { [K in keyof T]-?: K | DeepKeys<T[K]> }[keyof T]
      : never;
type LeakedKeys<R> = Extract<DeepKeys<R>, SecretKey>;

describe('router output types carry no secret field', () => {
  it('holds for every PG-207 router and email.sendEmail', () => {
    expectTypeOf<
      LeakedKeys<inferRouterOutputs<typeof emailMailboxRouter>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      LeakedKeys<inferRouterOutputs<typeof emailSettingsRouter>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      LeakedKeys<inferRouterOutputs<typeof emailSignaturesRouter>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      LeakedKeys<inferRouterOutputs<typeof emailAttachmentsRouter>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      LeakedKeys<inferRouterOutputs<typeof inboundEmailRouter>['sendEmail']>
    >().toEqualTypeOf<never>();
  });
});
