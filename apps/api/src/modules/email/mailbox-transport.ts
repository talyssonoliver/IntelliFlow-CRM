/**
 * Mailbox transports for user mail (PG-207, ADR-085).
 *
 * Wraps the adapters (SMTP, IMAP bounce reader, OAuth Gmail/Graph) with what
 * the API owns: OAuth client config from env, an in-memory access-token cache
 * (access tokens are never persisted), refresh-token rotation written with a
 * tokenVersion compare-and-set, a revoked grant moving the mailbox to ERROR,
 * and the per-mailbox hourly send cap. Built once in container.ts.
 */
import {
  ImapBounceReader,
  MailboxTransportError,
  OAuthMailboxClient,
  SmtpMailboxTransport,
  type OAuthClientConfig,
  type SmtpConnectionConfig,
  type SmtpEnvelope,
} from '@intelliflow/adapters';
import {
  EMAIL_LIMITS,
  type MailboxKind,
  type OAuthMailboxProvider,
  type SmtpSecurityMode,
} from '@intelliflow/domain';
import { requireEncryptionKey } from './encryption-guard';

type OAuthClientLike = Pick<
  OAuthMailboxClient,
  | 'authorizationUrl'
  | 'exchangeCode'
  | 'refresh'
  | 'revoke'
  | 'accountAddress'
  | 'sendRaw'
  | 'listDsnSince'
>;

export interface MailboxTransports {
  smtp: Pick<SmtpMailboxTransport, 'send' | 'verify'>;
  imap: Pick<ImapBounceReader, 'read' | 'verify'>;
  /** null when the provider's OAuth client is not configured in this environment. */
  oauth(provider: OAuthMailboxProvider): OAuthClientLike | null;
  oauthConfigured: Record<OAuthMailboxProvider, boolean>;
}

const ENV_PREFIX: Record<OAuthMailboxProvider, string> = {
  GMAIL: 'EMAIL_OAUTH_GOOGLE',
  MICROSOFT: 'EMAIL_OAUTH_MICROSOFT',
};

/**
 * OAuth clients for mailbox connection — separate from the sign-in clients.
 * The redirect URI is the web callback page and comes from env only.
 */
export function oauthConfigFromEnv(
  env: NodeJS.ProcessEnv
): Record<OAuthMailboxProvider, OAuthClientConfig | null> {
  const redirectUri = env.EMAIL_OAUTH_REDIRECT_URI?.trim();
  const read = (provider: OAuthMailboxProvider): OAuthClientConfig | null => {
    const clientId = env[`${ENV_PREFIX[provider]}_CLIENT_ID`]?.trim();
    const clientSecret = env[`${ENV_PREFIX[provider]}_CLIENT_SECRET`]?.trim();
    return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
  };
  return { GMAIL: read('GMAIL'), MICROSOFT: read('MICROSOFT') };
}

export function createMailboxTransports(env: NodeJS.ProcessEnv = process.env): MailboxTransports {
  const configs = oauthConfigFromEnv(env);
  const clients: Record<OAuthMailboxProvider, OAuthClientLike | null> = {
    GMAIL: configs.GMAIL ? new OAuthMailboxClient('GMAIL', configs.GMAIL) : null,
    MICROSOFT: configs.MICROSOFT ? new OAuthMailboxClient('MICROSOFT', configs.MICROSOFT) : null,
  };
  return {
    smtp: new SmtpMailboxTransport(),
    imap: new ImapBounceReader(),
    oauth: (provider) => clients[provider],
    oauthConfigured: { GMAIL: Boolean(configs.GMAIL), MICROSOFT: Boolean(configs.MICROSOFT) },
  };
}

/** The mailbox fields the transport needs (decrypted by the field-encryption client). */
export interface TransportMailbox {
  id: string;
  tenantId: string;
  kind: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: string | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  refreshToken: string | null;
  tokenVersion: number;
}

interface MailboxWriter {
  emailMailbox: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

/**
 * Access tokens live in memory only. An entry is valid for the credentials it
 * was minted from: `tokenVersion` moves on every save, reconnect, disconnect
 * and rotation, so a reconnect to another account (on any replica) never
 * reuses the previous account's token.
 */
const accessTokens = new Map<
  string,
  { accessToken: string; expiresAt: number; tokenVersion: number; kind: string }
>();
const EXPIRY_MARGIN_MS = 60_000;

/** Test-only: forget cached access tokens. */
export function __resetAccessTokenCache(): void {
  accessTokens.clear();
}

function oauthProvider(kind: string): OAuthMailboxProvider {
  return kind === 'MICROSOFT' ? 'MICROSOFT' : 'GMAIL';
}

/** A valid access token for an OAuth mailbox, refreshing (and rotating) when needed. */
export async function getOAuthAccessToken(
  prisma: MailboxWriter,
  mailbox: TransportMailbox,
  transports: MailboxTransports,
  now: Date
): Promise<string> {
  return (await getOAuthAccess(prisma, mailbox, transports, now)).accessToken;
}

/**
 * The access token and the credential version it belongs to: a rotation moves
 * the version on, and a stale rotation (credentials changed meanwhile) keeps
 * the version read, which no longer matches the stored one.
 */
export async function getOAuthAccess(
  prisma: MailboxWriter,
  mailbox: TransportMailbox,
  transports: MailboxTransports,
  now: Date
): Promise<{ accessToken: string; tokenVersion: number }> {
  const cached = accessTokens.get(mailbox.id);
  if (
    cached &&
    cached.tokenVersion === mailbox.tokenVersion &&
    cached.kind === mailbox.kind &&
    cached.expiresAt - EXPIRY_MARGIN_MS > now.getTime()
  ) {
    return { accessToken: cached.accessToken, tokenVersion: cached.tokenVersion };
  }

  const client = transports.oauth(oauthProvider(mailbox.kind));
  if (!client) throw new MailboxTransportError('CONNECT_FAILED');
  if (!mailbox.refreshToken) throw new MailboxTransportError('TOKEN_REVOKED');

  let refreshed;
  try {
    refreshed = await client.refresh(mailbox.refreshToken, now);
  } catch (error) {
    if (error instanceof MailboxTransportError && error.code === 'TOKEN_REVOKED') {
      // Only these credentials: a reconnect meanwhile moved tokenVersion on.
      await prisma.emailMailbox.updateMany({
        where: { id: mailbox.id, tenantId: mailbox.tenantId, tokenVersion: mailbox.tokenVersion },
        data: { status: 'ERROR', lastErrorCode: 'TOKEN_REVOKED' },
      });
    }
    throw error;
  }

  let tokenVersion = mailbox.tokenVersion;
  if (refreshed.refreshToken !== mailbox.refreshToken) {
    // Rotated (Microsoft): store it only if the credentials did not change
    // meanwhile (rotated elsewhere, reconnected or disconnected).
    requireEncryptionKey();
    const stored = await prisma.emailMailbox.updateMany({
      where: { id: mailbox.id, tenantId: mailbox.tenantId, tokenVersion: mailbox.tokenVersion },
      data: { refreshToken: refreshed.refreshToken, tokenVersion: { increment: 1 } },
    });
    // Stale credentials: do not cache.
    if (stored.count !== 1) return { accessToken: refreshed.accessToken, tokenVersion };
    tokenVersion += 1;
  }
  accessTokens.set(mailbox.id, {
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt.getTime(),
    tokenVersion,
    kind: mailbox.kind,
  });
  return { accessToken: refreshed.accessToken, tokenVersion };
}

function smtpConfig(mailbox: TransportMailbox): SmtpConnectionConfig {
  if (
    !mailbox.smtpHost ||
    !mailbox.smtpPort ||
    !mailbox.smtpSecurity ||
    !mailbox.smtpUsername ||
    !mailbox.smtpPassword
  ) {
    throw new MailboxTransportError('AUTH_FAILED');
  }
  return {
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    security: mailbox.smtpSecurity as SmtpSecurityMode,
    username: mailbox.smtpUsername,
    password: mailbox.smtpPassword,
  };
}

/** Sends one MIME message through the mailbox; failures are MailboxTransportError codes. */
export async function sendThroughMailbox(
  prisma: MailboxWriter,
  mailbox: TransportMailbox,
  transports: MailboxTransports,
  envelope: SmtpEnvelope,
  raw: Buffer,
  now: Date
): Promise<{
  provider: MailboxKind;
  providerMessageId: string | null;
  rejected: string[];
  rejectedTemporarily?: string[];
}> {
  if (mailbox.kind === 'SMTP') {
    const result = await transports.smtp.send(smtpConfig(mailbox), envelope, raw);
    return {
      provider: 'SMTP',
      providerMessageId: result.providerMessageId,
      rejected: result.rejected ?? [],
    };
  }
  const provider = oauthProvider(mailbox.kind);
  const client = transports.oauth(provider);
  if (!client) throw new MailboxTransportError('CONNECT_FAILED');
  const token = await getOAuthAccessToken(prisma, mailbox, transports, now);
  try {
    // Gmail and Graph accept the whole message; refusals come back as bounce reports.
    const result = await client.sendRaw(token, raw);
    return { provider, ...result, rejected: [] };
  } catch (error) {
    if (error instanceof MailboxTransportError && error.code === 'AUTH_FAILED') {
      accessTokens.delete(mailbox.id);
    }
    throw error;
  }
}

/**
 * Per-mailbox hourly cap (SEC-11): opens a new one-hour window or counts in
 * the open one, atomically; RATE_LIMITED once the window is full.
 */
export async function claimSendSlot(
  prisma: MailboxWriter,
  mailbox: { id: string; tenantId: string },
  now: Date
): Promise<void> {
  const windowStart = new Date(now.getTime() - 3600_000);
  const opened = await prisma.emailMailbox.updateMany({
    where: {
      id: mailbox.id,
      tenantId: mailbox.tenantId,
      OR: [{ sendWindowStart: null }, { sendWindowStart: { lt: windowStart } }],
    },
    data: { sendWindowStart: now, sendWindowCount: 1 },
  });
  if (opened.count === 1) return;
  const counted = await prisma.emailMailbox.updateMany({
    where: {
      id: mailbox.id,
      tenantId: mailbox.tenantId,
      sendWindowCount: { lt: EMAIL_LIMITS.mailboxHourlySendCap },
    },
    data: { sendWindowCount: { increment: 1 } },
  });
  if (counted.count === 0) throw new MailboxTransportError('RATE_LIMITED');
}
