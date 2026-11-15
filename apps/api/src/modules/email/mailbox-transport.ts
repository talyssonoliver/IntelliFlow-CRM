/**
 * Mailbox transports for user mail (PG-207, ADR-085).
 *
 * Wraps the adapters (SMTP, IMAP bounce reader, OAuth Gmail/Graph, Zoho Mail API) with what
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
  ZohoMailboxClient,
  type BuildMimeInput,
  type OAuthClientConfig,
  type SmtpConnectionConfig,
  type SmtpEnvelope,
} from '@intelliflow/adapters';
import { EMAIL_LIMITS, type MailboxKind, type OAuthMailboxProvider } from '@intelliflow/domain';
import {
  hasSmtpAccount,
  hasSmtpEndpoint,
  smtpAccountConfig,
  smtpEndpointConfig,
  type SmtpAccountRow,
  type SmtpEndpointRow,
} from '@intelliflow/validators';
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

/** Zoho Mail (MVP-001): HTTPS API, its own shape (data centre host, JSON send). */
export type ZohoClientLike = Pick<
  ZohoMailboxClient,
  'authorizationUrl' | 'exchangeCode' | 'refresh' | 'revoke' | 'identity' | 'sendMessage'
>;

export interface MailboxTransports {
  smtp: Pick<SmtpMailboxTransport, 'send' | 'verify'>;
  imap: Pick<ImapBounceReader, 'read' | 'verify'>;
  /** null when the provider's OAuth client is not configured in this environment. */
  oauth(provider: OAuthMailboxProvider): OAuthClientLike | null;
  /** null when Zoho is not configured; Zoho is never returned by `oauth()`. */
  zoho: ZohoClientLike | null;
  oauthConfigured: Record<OAuthMailboxProvider, boolean>;
}

const ENV_PREFIX: Record<OAuthMailboxProvider, string> = {
  GMAIL: 'EMAIL_OAUTH_GOOGLE',
  MICROSOFT: 'EMAIL_OAUTH_MICROSOFT',
  ZOHO: 'EMAIL_OAUTH_ZOHO',
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
  return { GMAIL: read('GMAIL'), MICROSOFT: read('MICROSOFT'), ZOHO: read('ZOHO') };
}

export function createMailboxTransports(env: NodeJS.ProcessEnv = process.env): MailboxTransports {
  const configs = oauthConfigFromEnv(env);
  const clients: Record<OAuthMailboxProvider, OAuthClientLike | null> = {
    GMAIL: configs.GMAIL ? new OAuthMailboxClient('GMAIL', configs.GMAIL) : null,
    MICROSOFT: configs.MICROSOFT ? new OAuthMailboxClient('MICROSOFT', configs.MICROSOFT) : null,
    ZOHO: null,
  };
  return {
    smtp: new SmtpMailboxTransport(),
    imap: new ImapBounceReader(),
    oauth: (provider) => clients[provider],
    zoho: configs.ZOHO ? new ZohoMailboxClient(configs.ZOHO) : null,
    oauthConfigured: {
      GMAIL: Boolean(configs.GMAIL),
      MICROSOFT: Boolean(configs.MICROSOFT),
      ZOHO: Boolean(configs.ZOHO),
    },
  };
}

/**
 * The mailbox fields the transport needs (decrypted by the field-encryption client).
 * The SMTP columns come from SmtpEndpointRow and SmtpAccountRow (#1103).
 */
export interface TransportMailbox extends SmtpEndpointRow, SmtpAccountRow {
  id: string;
  tenantId: string;
  kind: string;
  refreshToken: string | null;
  tokenVersion: number;
  /** Zoho only: the Mail account id and its data centre's API host. */
  oauthAccountId?: string | null;
  oauthApiDomain?: string | null;
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

/** A fresh access token from the mailbox's provider (Zoho at the account's own data centre). */
function refreshAccess(
  mailbox: TransportMailbox,
  transports: MailboxTransports,
  refreshToken: string,
  now: Date
) {
  if (mailbox.kind === 'ZOHO') {
    if (!transports.zoho) throw new MailboxTransportError('CONNECT_FAILED');
    return transports.zoho.refresh(refreshToken, now, mailbox.oauthApiDomain ?? '');
  }
  const client = transports.oauth(oauthProvider(mailbox.kind));
  if (!client) throw new MailboxTransportError('CONNECT_FAILED');
  return client.refresh(refreshToken, now);
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
 * the version on. A rotation that finds the credentials changed meanwhile
 * fails with CONNECT_FAILED and never hands out the token it minted.
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

  if (mailbox.kind !== 'ZOHO' && !transports.oauth(oauthProvider(mailbox.kind))) {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
  if (mailbox.kind === 'ZOHO' && !transports.zoho)
    throw new MailboxTransportError('CONNECT_FAILED');
  if (!mailbox.refreshToken) throw new MailboxTransportError('TOKEN_REVOKED');

  let refreshed;
  try {
    refreshed = await refreshAccess(mailbox, transports, mailbox.refreshToken, now);
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
    // The credentials changed meanwhile (rotated elsewhere, reconnected or
    // disconnected): the token minted from the old ones is never used. The
    // code is a retryable one that leaves the mailbox status alone.
    if (stored.count !== 1) throw new MailboxTransportError('CONNECT_FAILED');
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
  if (!hasSmtpEndpoint(mailbox) || !hasSmtpAccount(mailbox)) {
    throw new MailboxTransportError('AUTH_FAILED');
  }
  return { ...smtpEndpointConfig(mailbox), ...smtpAccountConfig(mailbox) };
}

/**
 * Sends one message through the mailbox; failures are MailboxTransportError codes. SMTP, Gmail
 * and Graph take the MIME; Zoho takes `message`'s fields (its API has no raw MIME send).
 */
export async function sendThroughMailbox(
  prisma: MailboxWriter,
  mailbox: TransportMailbox,
  transports: MailboxTransports,
  envelope: SmtpEnvelope,
  raw: Buffer,
  now: Date,
  message?: BuildMimeInput
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
      ...(result.rejectedTemporarily ? { rejectedTemporarily: result.rejectedTemporarily } : {}),
    };
  }
  if (mailbox.kind === 'ZOHO') return sendThroughZoho(prisma, mailbox, transports, now, message);
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

async function sendThroughZoho(
  prisma: MailboxWriter,
  mailbox: TransportMailbox,
  transports: MailboxTransports,
  now: Date,
  message: BuildMimeInput | undefined
): Promise<{ provider: MailboxKind; providerMessageId: string | null; rejected: string[] }> {
  const zoho = transports.zoho;
  if (!zoho) throw new MailboxTransportError('CONNECT_FAILED');
  if (!message) throw new MailboxTransportError('REJECTED');
  if (!mailbox.oauthAccountId || !mailbox.oauthApiDomain) {
    throw new MailboxTransportError('AUTH_FAILED');
  }
  const token = await getOAuthAccessToken(prisma, mailbox, transports, now);
  try {
    const result = await zoho.sendMessage(
      token,
      { mailHost: mailbox.oauthApiDomain, accountId: mailbox.oauthAccountId },
      {
        from: message.from.address,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        html: message.html,
        attachments: message.attachments,
      }
    );
    return { provider: 'ZOHO', ...result, rejected: [] };
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
