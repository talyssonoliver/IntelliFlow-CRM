/**
 * Zoho Mail over Zoho's HTTPS API (MVP-001): connect, refresh, revoke, account lookup and send.
 *
 * Our hosting blocks outbound SMTP, so a Zoho mailbox sends through Zoho Mail's REST API with
 * OAuth instead of a password. Zoho differs from Google and Microsoft in four ways handled here:
 * - It takes the message as JSON fields, not as raw MIME (`sendMessage`).
 * - Each account lives in one data centre (US, EU, IN, ...). The OAuth redirect names the
 *   account's accounts server; the token calls and the Mail API go to that data centre. Only
 *   hosts in ZOHO_DATA_CENTRES are ever called: a host from a redirect or a stored row is data,
 *   never a trusted URL, and the token never goes anywhere else.
 * - The API wants `Authorization: Zoho-oauthtoken <token>`, not Bearer.
 * - The token endpoint can answer 200 with an `error` field, so errors are read from the body.
 * Every failure is a MailboxTransportError code; provider text never leaves this file.
 */
import { MailboxTransportError } from './mailbox-errors';
import type { MimeAttachment } from './mime';
import type { OAuthClientConfig, OAuthTokens, RefreshedTokens } from './oauth-mailbox';
import type { MailboxErrorCode } from '@intelliflow/domain';

/** Send mail, and read the account's id and allowed From addresses. Nothing else. */
export const ZOHO_MAILBOX_SCOPES = ['ZohoMail.messages.CREATE', 'ZohoMail.accounts.READ'] as const;

export interface ZohoDataCentre {
  location: string;
  accounts: string;
  mail: string;
}

/** Zoho's data centres (zoho.com/accounts/protocol/oauth/multi-dc.html): the only hosts used. */
export const ZOHO_DATA_CENTRES: readonly ZohoDataCentre[] = [
  { location: 'us', accounts: 'accounts.zoho.com', mail: 'mail.zoho.com' },
  { location: 'eu', accounts: 'accounts.zoho.eu', mail: 'mail.zoho.eu' },
  { location: 'in', accounts: 'accounts.zoho.in', mail: 'mail.zoho.in' },
  { location: 'au', accounts: 'accounts.zoho.com.au', mail: 'mail.zoho.com.au' },
  { location: 'jp', accounts: 'accounts.zoho.jp', mail: 'mail.zoho.jp' },
  { location: 'ca', accounts: 'accounts.zohocloud.ca', mail: 'mail.zohocloud.ca' },
  { location: 'sa', accounts: 'accounts.zoho.sa', mail: 'mail.zoho.sa' },
  { location: 'uk', accounts: 'accounts.zoho.uk', mail: 'mail.zoho.uk' },
];

const US = ZOHO_DATA_CENTRES[0]!;

function hostOf(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The data centre of an accounts server from the OAuth redirect; null when not Zoho's own. */
export function zohoDataCentreByAccounts(accountsServer: string): ZohoDataCentre | null {
  const host = hostOf(accountsServer);
  return ZOHO_DATA_CENTRES.find((dc) => dc.accounts === host) ?? null;
}

/** The data centre of a stored Mail API host; null when not Zoho's own. */
export function zohoDataCentreByMailHost(mailHost: string): ZohoDataCentre | null {
  const host = hostOf(mailHost);
  return ZOHO_DATA_CENTRES.find((dc) => dc.mail === host) ?? null;
}

/** Where a Zoho mailbox lives: its Mail API host and account id (both stored on the mailbox). */
export interface ZohoAccountRef {
  mailHost: string;
  accountId: string;
}

export interface ZohoTokens extends OAuthTokens {
  /** The Mail API host of the account's data centre. */
  mailHost: string;
}

export interface ZohoIdentity {
  accountId: string;
  /** The account's primary address, lower-cased. */
  address: string;
  /** Every address the account may send as (primary, confirmed aliases, validated send-as). */
  sendAs: string[];
}

export interface ZohoOutgoingMessage {
  from: string;
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  html: string;
  attachments?: readonly MimeAttachment[];
}

interface TokenBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

function httpError(status: number): MailboxTransportError {
  if (status === 401 || status === 403) return new MailboxTransportError('AUTH_FAILED');
  if (status === 429) return new MailboxTransportError('RATE_LIMITED');
  if (status >= 500) return new MailboxTransportError('CONNECT_FAILED');
  return new MailboxTransportError('REJECTED');
}

/** Zoho's token errors: a dead refresh token means reconnect; anything else is a failed sign-in. */
const DEAD_REFRESH_TOKEN = new Set(['invalid_code', 'invalid_token', 'access_denied']);

function tokenError(error: string | undefined, refreshing: boolean): MailboxErrorCode {
  return refreshing && DEAD_REFRESH_TOKEN.has(error ?? '') ? 'TOKEN_REVOKED' : 'AUTH_FAILED';
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
}

/** Zoho Mail's error codes for a token it no longer accepts (any HTTP status). */
const DEAD_TOKEN_CODES = new Set(['INVALID_OAUTHTOKEN', 'INVALID_TICKET', 'OAUTH_TOKEN_EXPIRED']);

/** A failed Mail API call as a code: a dead token by its body's errorCode, else by status. */
async function apiError(response: Response): Promise<MailboxTransportError> {
  const body = await response.text().catch(() => '');
  let errorCode: unknown;
  try {
    errorCode = (JSON.parse(body) as { data?: { errorCode?: unknown } }).data?.errorCode;
  } catch {
    errorCode = undefined;
  }
  if (typeof errorCode === 'string' && DEAD_TOKEN_CODES.has(errorCode)) {
    return new MailboxTransportError('AUTH_FAILED');
  }
  return httpError(response.status);
}

/** The keys whose values are Zoho ids (about 19 digits, past what a JSON number holds exactly). */
const ID_KEYS = new Set(['accountId', 'messageId']);

/**
 * JSON.parse that keeps every id as the exact digits Zoho sent (each record keeps its own id),
 * using the parser's source text. Without source access an unsafe number id is dropped, never
 * rounded.
 */
export function parseKeepingIds(text: string): unknown {
  const reviver = (key: string, value: unknown, context?: { source?: string }): unknown => {
    if (!ID_KEYS.has(key) || typeof value !== 'number') return value;
    if (context?.source) return context.source;
    return Number.isSafeInteger(value) ? String(value) : undefined;
  };
  return JSON.parse(text, reviver as (this: unknown, key: string, value: unknown) => unknown);
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new MailboxTransportError('REJECTED');
  }
}

function dataCentreFor(mailHost: string): ZohoDataCentre {
  const dc = zohoDataCentreByMailHost(mailHost);
  if (!dc) throw new MailboxTransportError('AUTH_FAILED');
  return dc;
}

export class ZohoMailboxClient {
  constructor(
    private readonly config: OAuthClientConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /** Consent always starts at the US accounts server; Zoho redirects other data centres back. */
  authorizationUrl(args: { state: string; codeChallenge: string }): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: ZOHO_MAILBOX_SCOPES.join(','),
      state: args.state,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: args.codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://${US.accounts}/oauth/v2/auth?${params.toString()}`;
  }

  private async token(
    dc: ZohoDataCentre,
    body: Record<string, string>,
    refreshing: boolean
  ): Promise<TokenBody> {
    const response = await call(this.fetchImpl, `https://${dc.accounts}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...body,
      }).toString(),
    });
    const data = await readJson<TokenBody>(response).catch(() => ({}) as TokenBody);
    if (!response.ok || data.error) {
      if (response.status >= 500) throw new MailboxTransportError('CONNECT_FAILED');
      throw new MailboxTransportError(tokenError(data.error, refreshing));
    }
    if (!data.access_token) throw new MailboxTransportError('AUTH_FAILED');
    return data;
  }

  /** `accountsServer` is the redirect's `accounts-server`: it picks the account's data centre. */
  async exchangeCode(
    code: string,
    verifier: string,
    now: Date,
    accountsServer: string | null
  ): Promise<ZohoTokens> {
    const dc = accountsServer === null ? US : zohoDataCentreByAccounts(accountsServer);
    if (!dc) throw new MailboxTransportError('AUTH_FAILED');
    const data = await this.token(
      dc,
      {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: this.config.redirectUri,
      },
      false
    );
    if (!data.refresh_token) throw new MailboxTransportError('TOKEN_REVOKED');
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token,
      expiresAt: new Date(now.getTime() + (data.expires_in ?? 0) * 1000),
      scopes: (data.scope ?? '').split(/[ ,]+/).filter(Boolean),
      mailHost: dc.mail,
    };
  }

  /** Zoho keeps the same refresh token (no rotation). */
  async refresh(refreshToken: string, now: Date, mailHost: string): Promise<RefreshedTokens> {
    const data = await this.token(
      dataCentreFor(mailHost),
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      true
    );
    return {
      accessToken: data.access_token as string,
      refreshToken,
      expiresAt: new Date(now.getTime() + (data.expires_in ?? 0) * 1000),
    };
  }

  /** Best effort: a failure here must not block deleting the stored token. */
  async revoke(refreshToken: string, mailHost: string): Promise<void> {
    const dc = zohoDataCentreByMailHost(mailHost);
    if (!dc) return;
    const query = new URLSearchParams({ token: refreshToken }).toString();
    await call(this.fetchImpl, `https://${dc.accounts}/oauth/v2/token/revoke?${query}`, {
      method: 'POST',
    }).catch(() => undefined);
  }

  private headers(accessToken: string): Record<string, string> {
    return { Authorization: `Zoho-oauthtoken ${accessToken}` };
  }

  /** The account's id and the addresses it may send as: the only From values allowed. */
  async identity(accessToken: string, mailHost: string): Promise<ZohoIdentity> {
    const dc = dataCentreFor(mailHost);
    const response = await call(this.fetchImpl, `https://${dc.mail}/api/accounts`, {
      headers: this.headers(accessToken),
    });
    if (!response.ok) throw await apiError(response);
    const text = await response.text().catch(() => '');
    let body: { data?: ZohoAccount[] };
    try {
      body = parseKeepingIds(text) as { data?: ZohoAccount[] };
    } catch {
      throw new MailboxTransportError('REJECTED');
    }
    const account = (body.data ?? []).find((a) => a.accountId && a.primaryEmailAddress);
    if (!account) throw new MailboxTransportError('AUTH_FAILED');
    const address = normalised(account.primaryEmailAddress);
    if (!address) throw new MailboxTransportError('AUTH_FAILED');
    // The id of this very record, as the exact digits Zoho sent (see parseKeepingIds).
    const accountId = account.accountId;
    if (typeof accountId !== 'string' || !/^\d+$/.test(accountId)) {
      throw new MailboxTransportError('AUTH_FAILED');
    }
    return { accountId, address, sendAs: sendAsAddresses(account) };
  }

  /** Sends one message; attachments are uploaded first, as Zoho requires. */
  async sendMessage(
    accessToken: string,
    ref: ZohoAccountRef,
    message: ZohoOutgoingMessage
  ): Promise<{ providerMessageId: string | null }> {
    const base = `https://${dataCentreFor(ref.mailHost).mail}/api/accounts/${encodeURIComponent(ref.accountId)}`;
    const attachments = [];
    for (const file of message.attachments ?? []) {
      attachments.push(await this.upload(accessToken, base, file));
    }
    const response = await call(this.fetchImpl, `${base}/messages`, {
      method: 'POST',
      headers: { ...this.headers(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromAddress: message.from,
        toAddress: primaryRecipients(message).join(','),
        ...(ccOf(message).length ? { ccAddress: ccOf(message).join(',') } : {}),
        ...(message.bcc?.length ? { bccAddress: message.bcc.join(',') } : {}),
        subject: message.subject,
        content: message.html,
        mailFormat: 'html',
        ...(attachments.length ? { attachments } : {}),
      }),
    });
    if (!response.ok) throw await apiError(response);
    const text = await response.text().catch(() => '');
    let id: unknown;
    try {
      id = (parseKeepingIds(text) as { data?: { messageId?: unknown } } | null)?.data?.messageId;
    } catch {
      id = undefined;
    }
    return { providerMessageId: typeof id === 'string' ? id : null };
  }

  private async upload(
    accessToken: string,
    base: string,
    file: MimeAttachment
  ): Promise<{ storeName: string; attachmentPath: string; attachmentName: string }> {
    const query = new URLSearchParams({ fileName: file.filename }).toString();
    const response = await call(this.fetchImpl, `${base}/messages/attachments?${query}`, {
      method: 'POST',
      headers: { ...this.headers(accessToken), 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(file.content),
    });
    if (!response.ok) throw await apiError(response);
    const body = await readJson<{ data?: UploadedFile | UploadedFile[] }>(response);
    const uploaded = Array.isArray(body.data) ? body.data[0] : body.data;
    if (!uploaded?.storeName || !uploaded.attachmentPath) {
      throw new MailboxTransportError('ATTACHMENT_UNAVAILABLE');
    }
    return {
      storeName: uploaded.storeName,
      attachmentPath: uploaded.attachmentPath,
      attachmentName: uploaded.attachmentName ?? file.filename,
    };
  }
}

/**
 * Zoho requires a To. A Cc-only send uses its first Cc as the To; a Bcc-only one is addressed to
 * the sender (the usual way), so no Bcc address is shown to the other Bcc recipients.
 */
function primaryRecipients(message: ZohoOutgoingMessage): readonly string[] {
  if (message.to.length > 0) return message.to;
  const firstCc = message.cc?.[0];
  return firstCc ? [firstCc] : [message.from];
}

function ccOf(message: ZohoOutgoingMessage): readonly string[] {
  const cc = message.cc ?? [];
  return message.to.length > 0 ? cc : cc.slice(1);
}

interface UploadedFile {
  storeName?: string;
  attachmentPath?: string;
  attachmentName?: string;
}

interface ZohoAccount {
  accountId?: string | number;
  primaryEmailAddress?: string;
  emailAddress?: Array<{ mailId?: string; isConfirmed?: boolean }>;
  sendMailDetails?: Array<{ fromAddress?: string; validated?: boolean; status?: boolean }>;
}

function normalised(value: string | null | undefined): string | null {
  const address = (value ?? '').trim().toLowerCase();
  return address.includes('@') ? address : null;
}

function sendAsAddresses(account: ZohoAccount): string[] {
  const out = new Set<string>();
  const add = (value: string | undefined) => {
    const address = normalised(value);
    if (address) out.add(address);
  };
  add(account.primaryEmailAddress);
  for (const entry of account.emailAddress ?? [])
    if (entry.isConfirmed !== false) add(entry.mailId);
  for (const entry of account.sendMailDetails ?? []) {
    if (entry.validated !== false && entry.status !== false) add(entry.fromAddress);
  }
  return [...out];
}
