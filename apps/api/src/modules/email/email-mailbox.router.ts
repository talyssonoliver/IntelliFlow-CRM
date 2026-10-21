/**
 * Email Mailbox Router — PG-207 (owner rulings Q1, Q6, Q7; ADR-085).
 *
 * A user connects their own mailbox (SMTP with Gmail/Outlook presets, or
 * Google / Microsoft OAuth); an admin connects the company mailbox. The owner
 * of a USER mailbox always comes from ctx, never from input.
 *
 * Secrets: written only as plain strings through the field-encryption client
 * after `requireEncryptionKey()`; never returned (DTO booleans), never logged
 * or audited (audit records "set"/"cleared"). OAuth: PKCE S256, an opaque
 * state stored only as its sha256 with the encrypted verifier, consumed once
 * by the same user/tenant/provider within 10 minutes, completed through this
 * authenticated call from the web callback page; the From address is the
 * provider-verified account address. Disconnect revokes (best effort) and
 * deletes every secret.
 */
import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { MailboxTransportError, createPkcePair } from '@intelliflow/adapters';
import {
  EMAIL_LIMITS,
  type MailboxErrorCode,
  type OAuthMailboxProvider,
} from '@intelliflow/domain';
import {
  mailboxScopeInputSchema,
  oauthCompleteInputSchema,
  oauthStartInputSchema,
  saveSmtpMailboxInputSchema,
  type ConnectionTestResultDto,
  type MailboxDto,
  type OAuthProvidersAvailableDto,
  type SaveSmtpMailboxInput,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure, verifiedTenantProcedure } from '../../trpc';
import { assertTenantContext } from '../../security/tenant-context';
import {
  assertEmailAdmin,
  auditEmail,
  emailRuntimeDeps,
  prismaErrorCode,
  type EmailRouterCtx,
  type EmailAuditResource,
} from './email-access';
import { toMailboxDto, type MailboxRowLike } from './email-dto';
import { requireEncryptionKey } from './encryption-guard';
import { getOAuthAccessToken, type TransportMailbox } from './mailbox-transport';

const RESOURCE: EmailAuditResource = 'email_mailbox';

type MailboxScope = 'USER' | 'TENANT';
type MailboxRow = MailboxRowLike & TransportMailbox & { scope: string; userId: string | null };

// ─── Connection-test limiter (5 per minute per user, per process) ───────────
const TEST_LIMIT = 5;
const TEST_WINDOW_MS = 60_000;
const testCalls = new Map<string, number[]>();

/** Test-only: forget recorded connection tests. */
export function __resetConnectionTestLimiter(): void {
  testCalls.clear();
}

function consumeConnectionTest(userId: string, now: number): void {
  const recent = (testCalls.get(userId) ?? []).filter((at) => now - at < TEST_WINDOW_MS);
  if (recent.length >= TEST_LIMIT) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many connection tests. Wait a minute and try again.',
    });
  }
  recent.push(now);
  testCalls.set(userId, recent);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ownerFor(ctx: EmailRouterCtx, scope: MailboxScope) {
  return scope === 'TENANT'
    ? { tenantId: ctx.tenant.tenantId, scope, userId: null as string | null }
    : { tenantId: ctx.tenant.tenantId, scope, userId: ctx.tenant.userId as string | null };
}

function assertScopeAllowed(ctx: EmailRouterCtx, scope: MailboxScope, action: string): void {
  if (scope === 'TENANT') assertEmailAdmin(ctx, RESOURCE, action);
}

async function findMailbox(ctx: EmailRouterCtx, scope: MailboxScope): Promise<MailboxRow | null> {
  const owner = ownerFor(ctx, scope);
  return ctx.prismaWithTenant.emailMailbox.findFirst({
    where:
      scope === 'TENANT'
        ? { tenantId: owner.tenantId, scope: 'TENANT' }
        : { tenantId: owner.tenantId, scope: 'USER', userId: owner.userId },
  });
}

function mailboxNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'No mailbox is connected.' });
}

function stateHash(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

/**
 * A mailbox made ACTIVE again (new credentials or a passing test) starts bounce
 * reading afresh: an old failure streak would otherwise turn the next single
 * scan failure back into ERROR.
 */
function freshScanState(): { failureCount: number; nextScanAt: Date } {
  return { failureCount: 0, nextScanAt: new Date() };
}

/** Creates or updates the scope's mailbox. A racing duplicate is CONFLICT. */
async function writeMailbox(
  ctx: EmailRouterCtx,
  existing: MailboxRow | null,
  owner: ReturnType<typeof ownerFor>,
  written: Record<string, unknown>
): Promise<MailboxRow> {
  const data = written.status === 'ACTIVE' ? { ...written, ...freshScanState() } : written;
  try {
    if (existing) {
      // New credentials: cached access tokens of the old ones stop being valid.
      return await ctx.prismaWithTenant.emailMailbox.update({
        where: { id: existing.id },
        data: { ...data, tokenVersion: { increment: 1 } },
      });
    }
    return await ctx.prismaWithTenant.emailMailbox.create({
      data: { tenantId: owner.tenantId, scope: owner.scope, userId: owner.userId, ...data },
    });
  } catch (err) {
    if (prismaErrorCode(err) === 'P2002') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This mailbox was just connected. Reload and try again.',
      });
    }
    throw err;
  }
}

/** Scopes without which a connected mailbox could not send or read its bounce reports. */
const REQUIRED_SCOPES: Record<OAuthMailboxProvider, readonly string[]> = {
  GMAIL: ['gmail.send', 'gmail.readonly'],
  MICROSOFT: ['Mail.Send', 'Mail.Read'],
};

/**
 * Whether the user granted what the mailbox needs (Google lets users untick
 * scopes). Providers report scopes as bare names or full URIs, so a granted
 * scope matches on its last path segment. An empty list (scope not reported)
 * cannot be checked and is accepted; a missing scope then surfaces as a coded
 * send or scan failure.
 */
function hasRequiredScopes(provider: OAuthMailboxProvider, granted: string[]): boolean {
  if (granted.length === 0) return true;
  const names = new Set(granted.map((scope) => scope.split('/').pop()?.toLowerCase()));
  return REQUIRED_SCOPES[provider].every((scope) => names.has(scope.toLowerCase()));
}

function secretAudit(value: string | null | undefined): 'set' | 'cleared' | 'unchanged' {
  if (value === undefined) return 'unchanged';
  return value === null ? 'cleared' : 'set';
}

function badRequest(message: string): TRPCError {
  return new TRPCError({ code: 'BAD_REQUEST', message });
}

/**
 * A stored password is only reused for the same server and account: it must
 * never be sent to a host or username it was not entered for.
 */
function assertStoredPasswordsReusable(input: SaveSmtpMailboxInput, existing: MailboxRow): void {
  const smtpAccountChanged =
    existing.smtpHost !== input.smtpHost || existing.smtpUsername !== input.smtpUsername;
  if (input.smtpPassword === undefined && smtpAccountChanged) {
    throw badRequest('Re-enter the password when you change the server or username.');
  }
  const imapAccountChanged =
    existing.imapHost !== input.imapHost || existing.imapUsername !== input.imapUsername;
  if (
    input.imapHost &&
    input.imapPassword === undefined &&
    existing.imapPassword &&
    imapAccountChanged
  ) {
    throw badRequest('Re-enter the IMAP password when you change the IMAP server or username.');
  }
}

/** Every password the mailbox needs is either sent now or safely reusable; secrets need the key. */
function assertPasswordsAvailable(input: SaveSmtpMailboxInput, stored: MailboxRow | null): void {
  if (stored) assertStoredPasswordsReusable(input, stored);
  const smtpPassword = input.smtpPassword === undefined ? stored?.smtpPassword : input.smtpPassword;
  if (!smtpPassword && input.smtpPassword !== null) throw badRequest('Enter the mailbox password.');
  const imapPassword = input.imapPassword === undefined ? stored?.imapPassword : input.imapPassword;
  if (input.imapHost && !imapPassword) {
    throw badRequest('Enter the IMAP password for bounce reading.');
  }
  if (input.smtpPassword || input.imapPassword) requireEncryptionKey();
}

/** The SMTP mailbox write: plain-string secrets (CA-3); an absent password keeps the stored one. */
function smtpMailboxData(
  input: SaveSmtpMailboxInput,
  existing: MailboxRow | null
): Record<string, unknown> {
  assertPasswordsAvailable(input, existing?.kind === 'SMTP' ? existing : null);

  const data: Record<string, unknown> = {
    kind: 'SMTP',
    status: input.smtpPassword === null ? 'DISCONNECTED' : 'ACTIVE',
    lastErrorCode: null,
    fromAddress: input.fromAddress,
    fromName: input.fromName,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecurity: input.smtpSecurity,
    smtpUsername: input.smtpUsername,
    imapHost: input.imapHost,
    imapPort: input.imapHost ? input.imapPort : null,
    imapUsername: input.imapHost ? input.imapUsername : null,
    accountAddress: null,
    refreshToken: null,
    grantedScopes: [],
  };
  if (input.smtpPassword !== undefined) data.smtpPassword = input.smtpPassword;
  if (!input.imapHost) data.imapPassword = null;
  else if (input.imapPassword !== undefined) data.imapPassword = input.imapPassword;
  if (!existing) {
    data.smtpPassword ??= null;
    data.imapPassword ??= null;
  }
  if (existing && imapAccountChanged(existing, input)) {
    // The bounce cursor belongs to the old account: UIDVALIDITY is not an
    // account identity, so a kept cursor could skip the new account's reports.
    Object.assign(data, { imapUidValidity: null, imapLastUid: null, scanCursorAt: null });
  }
  return data;
}

function imapAccountChanged(existing: MailboxRow, input: SaveSmtpMailboxInput): boolean {
  return (
    existing.kind !== 'SMTP' ||
    existing.imapHost !== input.imapHost ||
    existing.imapUsername !== (input.imapHost ? input.imapUsername : null)
  );
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const emailMailboxRouter = createTRPCRouter({
  getMine: tenantProcedure.query(
    async ({
      ctx,
    }): Promise<{ mailbox: MailboxDto | null; providersAvailable: OAuthProvidersAvailableDto }> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const { transports } = emailRuntimeDeps(c);
      const row = await findMailbox(c, 'USER');
      return {
        mailbox: row ? toMailboxDto(row, { includeConnection: true }) : null,
        providersAvailable: { ...transports.oauthConfigured },
      };
    }
  ),

  getTenant: tenantProcedure.query(async ({ ctx }): Promise<MailboxDto | null> => {
    assertTenantContext(ctx);
    const c = ctx as unknown as EmailRouterCtx;
    assertEmailAdmin(c, RESOURCE, 'getTenant');
    const row = await findMailbox(c, 'TENANT');
    return row ? toMailboxDto(row, { includeConnection: true }) : null;
  }),

  saveSmtp: verifiedTenantProcedure
    .input(saveSmtpMailboxInputSchema)
    .mutation(async ({ ctx, input }): Promise<MailboxDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertScopeAllowed(c, input.scope, 'saveSmtp');
      const existing = await findMailbox(c, input.scope);
      const data = smtpMailboxData(input, existing);

      const row = await writeMailbox(c, existing, ownerFor(c, input.scope), data);
      auditEmail(c, existing ? 'UPDATE' : 'CREATE', RESOURCE, row.id, {
        scope: input.scope,
        kind: 'SMTP',
        smtpPassword: secretAudit(input.smtpPassword),
        imapPassword: secretAudit(input.imapHost ? input.imapPassword : null),
      });
      return toMailboxDto(row, { includeConnection: true });
    }),

  testConnection: verifiedTenantProcedure
    .input(mailboxScopeInputSchema)
    .mutation(async ({ ctx, input }): Promise<ConnectionTestResultDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertScopeAllowed(c, input.scope, 'testConnection');
      consumeConnectionTest(c.tenant.userId, Date.now());
      const { transports } = emailRuntimeDeps(c);
      const row = await findMailbox(c, input.scope);
      if (!row) throw mailboxNotFound();

      let code: MailboxErrorCode | null = null;
      try {
        if (row.kind === 'SMTP') {
          await transports.smtp.verify({
            host: row.smtpHost ?? '',
            port: row.smtpPort ?? 0,
            security: (row.smtpSecurity ?? 'STARTTLS') as 'SSL' | 'STARTTLS',
            username: row.smtpUsername ?? '',
            password: row.smtpPassword ?? '',
          });
          if (row.imapHost && row.imapPassword) {
            await transports.imap.verify({
              host: row.imapHost,
              port: row.imapPort ?? 0,
              username: row.imapUsername ?? '',
              password: row.imapPassword,
            });
          }
        } else {
          const client = transports.oauth(row.kind as OAuthMailboxProvider);
          if (!client) throw new MailboxTransportError('CONNECT_FAILED');
          const token = await getOAuthAccessToken(c.prismaWithTenant, row, transports, new Date());
          await client.accountAddress(token);
        }
      } catch (error) {
        code = error instanceof MailboxTransportError ? error.code : 'CONNECT_FAILED';
      }

      if (code === null || code === 'AUTH_FAILED' || code === 'TOKEN_REVOKED') {
        await c.prismaWithTenant.emailMailbox.updateMany({
          where: { id: row.id, tenantId: c.tenant.tenantId },
          data:
            code === null
              ? { status: 'ACTIVE', lastErrorCode: null, ...freshScanState() }
              : { status: 'ERROR', lastErrorCode: code },
        });
      }
      return { ok: code === null, code };
    }),

  oauthStart: verifiedTenantProcedure
    .input(oauthStartInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ url: string }> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertScopeAllowed(c, input.scope, 'oauthStart');
      const client = emailRuntimeDeps(c).transports.oauth(input.provider);
      if (!client) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Signing in with this provider is not configured on this server.',
        });
      }
      requireEncryptionKey();
      const state = randomBytes(32).toString('base64url');
      const { verifier, challenge } = createPkcePair();
      await c.prismaWithTenant.emailOAuthState.create({
        data: {
          tenantId: c.tenant.tenantId,
          userId: c.tenant.userId,
          scope: input.scope,
          provider: input.provider,
          stateHash: stateHash(state),
          codeVerifier: verifier,
          expiresAt: new Date(Date.now() + EMAIL_LIMITS.oauthStateTtlMinutes * 60_000),
        },
      });
      return { url: client.authorizationUrl({ state, codeChallenge: challenge }) };
    }),

  oauthComplete: verifiedTenantProcedure
    .input(oauthCompleteInputSchema)
    .mutation(async ({ ctx, input }): Promise<MailboxDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const where = {
        tenantId: c.tenant.tenantId,
        userId: c.tenant.userId,
        provider: input.provider,
      };
      const invalid = () =>
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This connection link has expired. Start again.',
        });

      // Read through Prisma (decrypts the verifier), then consume it exactly once.
      const saved: {
        id: string;
        scope: MailboxScope;
        codeVerifier: string;
        expiresAt: Date;
      } | null = await c.prismaWithTenant.emailOAuthState.findFirst({
        where: { stateHash: stateHash(input.state), ...where },
      });
      if (!saved) throw invalid();
      const consumed = await c.prismaWithTenant.emailOAuthState.deleteMany({
        where: { id: saved.id, ...where },
      });
      if (consumed.count !== 1 || saved.expiresAt.getTime() <= Date.now()) throw invalid();
      assertScopeAllowed(c, saved.scope, 'oauthComplete');

      const client = emailRuntimeDeps(c).transports.oauth(input.provider);
      if (!client) throw invalid();
      let tokens;
      let address: string;
      try {
        tokens = await client.exchangeCode(input.code, saved.codeVerifier, new Date());
        address = await client.accountAddress(tokens.accessToken);
      } catch (error) {
        const code = error instanceof MailboxTransportError ? error.code : 'AUTH_FAILED';
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${code}: The mailbox could not be connected.`,
        });
      }

      if (!hasRequiredScopes(input.provider, tokens.scopes)) {
        await client.revoke(tokens.refreshToken).catch(() => undefined);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'MISSING_PERMISSIONS: Allow both sending email and reading bounce reports, then connect again.',
        });
      }

      requireEncryptionKey();
      const existing = await findMailbox(c, saved.scope);
      const row = await writeMailbox(c, existing, ownerFor(c, saved.scope), {
        kind: input.provider,
        status: 'ACTIVE',
        lastErrorCode: null,
        fromAddress: address,
        fromName: null,
        accountAddress: address,
        refreshToken: tokens.refreshToken,
        grantedScopes: tokens.scopes,
        smtpHost: null,
        smtpPort: null,
        smtpSecurity: null,
        smtpUsername: null,
        smtpPassword: null,
        imapHost: null,
        imapPort: null,
        imapUsername: null,
        imapPassword: null,
        imapUidValidity: null,
        imapLastUid: null,
        scanCursorAt: null,
      });
      auditEmail(c, existing ? 'UPDATE' : 'CREATE', RESOURCE, row.id, {
        scope: saved.scope,
        kind: input.provider,
        refreshToken: 'set',
      });
      return toMailboxDto(row, { includeConnection: true });
    }),

  disconnect: verifiedTenantProcedure
    .input(mailboxScopeInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ disconnected: true }> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertScopeAllowed(c, input.scope, 'disconnect');
      const row = await findMailbox(c, input.scope);
      if (!row) throw mailboxNotFound();
      if (row.kind !== 'SMTP' && row.refreshToken) {
        const client = emailRuntimeDeps(c).transports.oauth(row.kind as OAuthMailboxProvider);
        await client?.revoke(row.refreshToken).catch(() => undefined);
      }
      await c.prismaWithTenant.emailMailbox.update({
        where: { id: row.id },
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
        },
      });
      auditEmail(c, 'UPDATE', RESOURCE, row.id, { scope: input.scope, disconnected: true });
      return { disconnected: true };
    }),
});
