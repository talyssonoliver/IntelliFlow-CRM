/**
 * OAuth mailbox client for Google (Gmail API) and Microsoft (Graph) — PG-207,
 * ADR-085.
 *
 * The first production use of OAuth mail in IntelliFlow (the legacy
 * GmailAdapter / OutlookAdapter only run health checks). Kept separate from
 * those adapters on purpose: it asks for explicit minimal scopes (send + identity, plus read
 * for Microsoft's bounce scan and inbox sync, and gmail.readonly for Gmail's inbox sync, MVP-011,
 * which a Workspace domain grants once its admin trusts Aurora; else send only; and Gmail's
 * calendar events, MVP-013), never the legacy
 * modify/labels/ReadWrite defaults, uses S256 PKCE, talks only to fixed provider hosts, sends the
 * one MIME message built by `buildMime`, revokes with the token in the body,
 * and reduces every failure to a MailboxTransportError code — provider error
 * text and tokens are never carried.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  EMAIL_LIMITS,
  type MailboxErrorCode,
  type OAuthMailboxProvider,
} from '@intelliflow/domain';
import { isBounceSenderAddress } from './bounce-senders';
import { MailboxTransportError } from './mailbox-errors';

/** Sending only: what a Google mailbox falls back to when its domain does not trust Aurora. */
export const GMAIL_SEND_ONLY_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
] as const;

/**
 * MVP-013: view and edit events on the user's Google calendars, so appointments sync both ways. It
 * rides the same Google sign-in as mail; Google lets the user untick it, and the mailbox then works
 * without a calendar (the settings card says so). Narrower than the full calendar scope: no
 * calendar settings, sharing or deletion of calendars.
 */
export const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/**
 * MVP-011: send, and read for the inbox sync (Workspace admin-trusted apps need no assessment).
 * MVP-013: and the calendar events scope.
 */
export const GMAIL_MAILBOX_SCOPES = [
  ...GMAIL_SEND_ONLY_SCOPES,
  'https://www.googleapis.com/auth/gmail.readonly',
  GOOGLE_CALENDAR_EVENTS_SCOPE,
] as const;

export const MICROSOFT_MAILBOX_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Send',
  'Mail.Read',
] as const;

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MS_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_API = 'https://graph.microsoft.com/v1.0/me';

/** Bounce reports come from these senders or carry these subjects (Graph has no content-type filter). */
const BOUNCE_SUBJECT =
  /undeliverable|delivery status notification|delivery has failed|returned mail|failure notice/i;

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export interface RefreshedTokens {
  accessToken: string;
  /** The provider's rotated refresh token, or the one passed in. */
  refreshToken: string;
  expiresAt: Date;
}

export interface RawDsnMessage {
  key: string;
  raw: string;
  receivedAt: Date;
}

/**
 * One scan's worth of bounce-report candidates. `resumeFrom` is set when the
 * listing stopped before reaching the newest mail (the candidate limit or the
 * page cap): the receive time from which nothing has been read yet, and the
 * caller must not move its cursor past it, or the unread reports would be
 * skipped for good. Null means everything since `since` was read.
 */
export interface DsnListing {
  messages: RawDsnMessage[];
  resumeFrom: Date | null;
}

/** Provider list pages read per scan; the rest is picked up by the next scan via `resumeFrom`. */
const MAX_LIST_PAGES = 20;
const LIST_PAGE_SIZE = 100;
/** Largest bounce report read; bigger ones are skipped unread, as the IMAP reader does. */
const MAX_REPORT_BYTES = EMAIL_LIMITS.bounceScanMaxMessageBytes;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

/** A 43-character base64url verifier and its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function httpError(status: number): MailboxTransportError {
  if (status === 401 || status === 403) return new MailboxTransportError('AUTH_FAILED');
  if (status === 429) return new MailboxTransportError('RATE_LIMITED');
  if (status >= 500) return new MailboxTransportError('CONNECT_FAILED');
  return new MailboxTransportError('REJECTED');
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
}

async function json<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new MailboxTransportError('REJECTED');
  }
}

/**
 * A response body as text, or null once it passes `maxBytes`: a declared
 * length over it is refused unread, and a longer stream is cancelled at the
 * byte that crosses it, so an oversized message is never held in memory.
 */
async function boundedText(response: Response, maxBytes: number): Promise<string | null> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const chunk = await reader.read().catch(() => {
      throw new MailboxTransportError('CONNECT_FAILED');
    });
    if (chunk.done) return Buffer.concat(chunks).toString('utf8');
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(chunk.value);
  }
}

/**
 * A failed token request's code. Throttling and provider outages are temporary
 * (the mailbox stays usable); only real credential errors mark it broken.
 */
function tokenErrorCode(status: number, error: string | undefined): MailboxErrorCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'CONNECT_FAILED';
  return error === 'invalid_grant' ? 'TOKEN_REVOKED' : 'AUTH_FAILED';
}

export class OAuthMailboxClient {
  constructor(
    private readonly provider: OAuthMailboxProvider,
    private readonly config: OAuthClientConfig
  ) {}

  private get scopes(): readonly string[] {
    return this.provider === 'GMAIL' ? GMAIL_MAILBOX_SCOPES : MICROSOFT_MAILBOX_SCOPES;
  }

  private get tokenUrl(): string {
    return this.provider === 'GMAIL' ? GOOGLE_TOKEN : `${MS_AUTHORITY}/token`;
  }

  /** The OAuth client id: public (it is in every consent URL); a Workspace admin trusts it. */
  get clientId(): string {
    return this.config.clientId;
  }

  /** `sendOnly` (Gmail): ask for sending only, after a domain refused the read permission. */
  authorizationUrl(args: { state: string; codeChallenge: string; sendOnly?: boolean }): string {
    const scopes =
      this.provider === 'GMAIL' && args.sendOnly ? GMAIL_SEND_ONLY_SCOPES : this.scopes;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: args.state,
      code_challenge: args.codeChallenge,
      code_challenge_method: 'S256',
    });
    if (this.provider === 'GMAIL') {
      // A refresh token is only issued with offline access + consent.
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
      return `${GOOGLE_AUTHORIZE}?${params.toString()}`;
    }
    params.set('response_mode', 'query');
    return `${MS_AUTHORITY}/authorize?${params.toString()}`;
  }

  private async token(body: Record<string, string>): Promise<TokenResponse> {
    const response = await call(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...body,
      }).toString(),
    });
    const data = await json<TokenResponse>(response).catch(() => ({}) as TokenResponse);
    if (!response.ok) throw new MailboxTransportError(tokenErrorCode(response.status, data.error));
    if (!data.access_token) throw new MailboxTransportError('AUTH_FAILED');
    return data;
  }

  async exchangeCode(code: string, verifier: string, now: Date): Promise<OAuthTokens> {
    const data = await this.token({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: this.config.redirectUri,
      ...(this.provider === 'MICROSOFT' ? { scope: this.scopes.join(' ') } : {}),
    }).catch((error: unknown) => {
      // A bad or replayed code is an authentication failure, not a revoked mailbox.
      if (error instanceof MailboxTransportError && error.code === 'TOKEN_REVOKED') {
        throw new MailboxTransportError('AUTH_FAILED');
      }
      throw error;
    });
    if (!data.refresh_token) throw new MailboxTransportError('TOKEN_REVOKED');
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token,
      expiresAt: new Date(now.getTime() + (data.expires_in ?? 0) * 1000),
      scopes: (data.scope ?? '').split(' ').filter(Boolean),
    };
  }

  async refresh(refreshToken: string, now: Date): Promise<RefreshedTokens> {
    const data = await this.token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...(this.provider === 'MICROSOFT' ? { scope: this.scopes.join(' ') } : {}),
    });
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(now.getTime() + (data.expires_in ?? 0) * 1000),
    };
  }

  /** Best effort: a failure here must not block deleting the stored token. */
  async revoke(token: string): Promise<void> {
    if (this.provider !== 'GMAIL') return; // Microsoft has no token revocation endpoint.
    try {
      await fetch(GOOGLE_REVOKE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      // Ignored by design (see above).
    }
  }

  /** The verified address of the connected account — the only From this mailbox may use. */
  async accountAddress(accessToken: string): Promise<string> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (this.provider === 'GMAIL') {
      const response = await call(GOOGLE_USERINFO, { headers });
      if (!response.ok) throw httpError(response.status);
      const data = await json<{ email?: string; email_verified?: boolean }>(response);
      if (!data.email || data.email_verified !== true)
        throw new MailboxTransportError('AUTH_FAILED');
      return data.email.trim().toLowerCase();
    }
    const response = await call(`${GRAPH_API}?$select=mail,userPrincipalName`, { headers });
    if (!response.ok) throw httpError(response.status);
    const data = await json<{ mail?: string | null; userPrincipalName?: string | null }>(response);
    const address = data.mail ?? data.userPrincipalName;
    if (!address || !address.includes('@')) throw new MailboxTransportError('AUTH_FAILED');
    return address.trim().toLowerCase();
  }

  /**
   * Google's immutable account id (the OpenID `sub`): unlike the address, it does not change when the
   * user renames the account. Null for providers that have no such id here.
   */
  async accountSubject(accessToken: string): Promise<string | null> {
    if (this.provider !== 'GMAIL') return null;
    const response = await call(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw httpError(response.status);
    const data = await json<{ sub?: string }>(response);
    return typeof data.sub === 'string' && data.sub.length > 0 && data.sub.length <= 255
      ? data.sub
      : null;
  }

  async sendRaw(accessToken: string, raw: Buffer): Promise<{ providerMessageId: string | null }> {
    if (this.provider === 'GMAIL') {
      const response = await call(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: raw.toString('base64url') }),
      });
      if (!response.ok) throw httpError(response.status);
      const data = await json<{ id?: string }>(response);
      return { providerMessageId: data.id ?? null };
    }
    // Graph accepts a whole MIME message as base64 text and returns 202 with no body.
    const response = await call(`${GRAPH_API}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' },
      body: raw.toString('base64'),
    });
    if (!response.ok) throw httpError(response.status);
    return { providerMessageId: null };
  }

  /** Bounce-report candidates received since `since`, oldest first (the parser decides what is one). */
  async listDsnSince(accessToken: string, since: Date, limit: number): Promise<DsnListing> {
    // Gmail's bounce reports are not scanned: its read permission is for the inbox sync (MVP-011).
    if (this.provider === 'GMAIL') return { messages: [], resumeFrom: null };
    const headers = { Authorization: `Bearer ${accessToken}` };
    return this.listGraphDsns(headers, since, limit);
  }

  /**
   * Graph has no content-type filter, so every message since the cursor is
   * listed oldest first and bounce-looking ones are kept; pages are followed
   * (only on Graph's own host) until the limit, the page cap or the end.
   */
  private async listGraphDsns(
    headers: Record<string, string>,
    since: Date,
    limit: number
  ): Promise<DsnListing> {
    const scan = await scanGraphCandidates(headers, since, limit);
    const out: RawDsnMessage[] = [];
    for (const message of scan.candidates) {
      const response = await call(
        `${GRAPH_API}/messages/${encodeURIComponent(message.id)}/$value`,
        { headers }
      );
      if (!response.ok) throw httpError(response.status);
      // Oversized: skipped, while the cursor still moves past it.
      const raw = await boundedText(response, MAX_REPORT_BYTES);
      if (raw === null) continue;
      out.push({ key: message.id, raw, receivedAt: new Date(message.receivedDateTime) });
    }
    const resumeFrom = scan.resumeAt ?? scan.lastSeen ?? since;
    return { messages: out, resumeFrom: scan.truncated ? resumeFrom : null };
  }
}

interface GraphScan {
  candidates: GraphMessage[];
  /** Receive time of the last message examined. */
  lastSeen: Date | null;
  /** Receive time of the first message the candidate limit left unexamined. */
  resumeAt: Date | null;
  /** True when messages since `since` were left unexamined. */
  truncated: boolean;
}

/**
 * Walks Graph's message pages oldest first and keeps bounce-looking ones.
 * Stops at the candidate limit, the page cap, the end, or a continuation link
 * off Graph's own host (the access token never goes there).
 */
async function scanGraphCandidates(
  headers: Record<string, string>,
  since: Date,
  limit: number
): Promise<GraphScan> {
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${since.toISOString()}`,
    $select: 'id,subject,from,receivedDateTime',
    $orderby: 'receivedDateTime asc',
    $top: String(LIST_PAGE_SIZE),
  });
  let url: string | undefined = `${GRAPH_API}/messages?${params.toString()}`;
  const scan: GraphScan = { candidates: [], lastSeen: null, resumeAt: null, truncated: false };
  for (let pages = 0; url && pages < MAX_LIST_PAGES && !scan.truncated; pages++) {
    const list = await call(url, { headers });
    if (!list.ok) throw httpError(list.status);
    const page = await json<GraphMessagePage>(list);
    scan.truncated = collectCandidates(page.value ?? [], scan, limit);
    const next = page['@odata.nextLink'];
    url = next && isGraphLink(next) ? next : undefined;
    if (next && !url) scan.truncated = true;
  }
  if (url) scan.truncated = true;
  return scan;
}

/**
 * Adds bounce candidates from one page; true when the limit cut the page short.
 * It only cuts between receive times: the next scan resumes at the first
 * unexamined one (`ge`), so a group sharing one time is never split, or a full
 * batch of them would be listed again forever.
 */
function collectCandidates(messages: GraphMessage[], scan: GraphScan, limit: number): boolean {
  for (const message of messages) {
    const at = new Date(message.receivedDateTime);
    if (scan.candidates.length >= limit && at.getTime() !== scan.lastSeen?.getTime()) {
      scan.resumeAt = at;
      return true;
    }
    scan.lastSeen = at;
    if (isBounceCandidate(message)) scan.candidates.push(message);
  }
  return false;
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string } };
  receivedDateTime: string;
}

interface GraphMessagePage {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
}

function isBounceCandidate(message: GraphMessage): boolean {
  return (
    isBounceSenderAddress(message.from?.emailAddress?.address ?? '') ||
    BOUNCE_SUBJECT.test(message.subject ?? '')
  );
}

function isGraphLink(link: string): boolean {
  return link.startsWith(`${GRAPH_API}/`);
}
