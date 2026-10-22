/**
 * OAuth mailbox client for Google (Gmail API) and Microsoft (Graph) — PG-207,
 * ADR-085.
 *
 * The first production use of OAuth mail in IntelliFlow (the legacy
 * GmailAdapter / OutlookAdapter only run health checks). Kept separate from
 * those adapters on purpose: it asks for explicit minimal scopes (send + read
 * for the bounce scan + identity, never the legacy modify/labels/ReadWrite
 * defaults), uses S256 PKCE, talks only to fixed provider hosts, sends the
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

export const GMAIL_MAILBOX_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
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
/** Times a Gmail window past the page cap is halved before the scan gives up moving on. */
const MAX_GMAIL_WINDOW_SPLITS = 8;
/** Largest bounce report read; bigger ones are skipped unread, as the IMAP reader does. */
const MAX_REPORT_BYTES = EMAIL_LIMITS.bounceScanMaxMessageBytes;
/** Gmail's JSON for a report at the limit: the base64url MIME plus the other fields. */
const MAX_GMAIL_RAW_RESPONSE_BYTES = Math.ceil(MAX_REPORT_BYTES / 3) * 4 + 16 * 1024;

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

  authorizationUrl(args: { state: string; codeChallenge: string }): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
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
    const headers = { Authorization: `Bearer ${accessToken}` };
    return this.provider === 'GMAIL'
      ? this.listGmailDsns(headers, since, limit)
      : this.listGraphDsns(headers, since, limit);
  }

  /**
   * Gmail searches bounce senders server-side but lists newest first, so the
   * ids are paged in full (they are cheap) and read oldest first. When the ids
   * since the cursor pass the page cap the oldest are out of reach, so the
   * window is halved until it fits; the next scan resumes where it ended.
   */
  private async listGmailDsns(
    headers: Record<string, string>,
    since: Date,
    limit: number
  ): Promise<DsnListing> {
    let windowEnd: number | null = null;
    let listing = await listGmailIds(headers, since, windowEnd);
    for (let split = 0; listing.capped && split < MAX_GMAIL_WINDOW_SPLITS; split++) {
      const end: number = windowEnd ?? Math.floor(Date.now() / 1000);
      windowEnd = Math.floor((Math.floor(since.getTime() / 1000) + end) / 2);
      listing = await listGmailIds(headers, since, windowEnd);
    }

    const out: RawDsnMessage[] = [];
    let resumeAt: Date | null = null;
    for (const id of listing.ids.reverse()) {
      const message = await readGmailRaw(headers, id);
      if (!message) continue;
      // Past the limit, stop only at a new second: `after:` is by the second,
      // so a cut inside one would list the same batch again next time.
      const last = out.at(-1);
      if (out.length >= limit && last && epochSecond(message) !== epochSecond(last)) {
        resumeAt = new Date(epochSecond(message) * 1000);
        break;
      }
      out.push(message);
    }
    const resumeFrom = gmailResumeFrom({ capped: listing.capped, resumeAt, since, windowEnd });
    return { messages: out, resumeFrom };
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

/**
 * Where a Gmail scan resumes, never past an unread report: still capped, the
 * oldest are unknown (stay); over the limit, after the last one read; a
 * narrowed window read in full, just inside its end (`before:` is by the second).
 */
function gmailResumeFrom(scan: {
  capped: boolean;
  resumeAt: Date | null;
  since: Date;
  windowEnd: number | null;
}): Date | null {
  if (scan.capped) return scan.since;
  if (scan.resumeAt) return scan.resumeAt;
  return scan.windowEnd === null ? null : new Date((scan.windowEnd - 1) * 1000);
}

function epochSecond(message: RawDsnMessage): number {
  return Math.floor(message.receivedAt.getTime() / 1000);
}

/** One Gmail message as raw MIME, or null when it has none or it is oversized (skipped). */
async function readGmailRaw(
  headers: Record<string, string>,
  id: string
): Promise<RawDsnMessage | null> {
  const response = await call(`${GMAIL_API}/messages/${encodeURIComponent(id)}?format=raw`, {
    headers,
  });
  if (!response.ok) throw httpError(response.status);
  const text = await boundedText(response, MAX_GMAIL_RAW_RESPONSE_BYTES);
  if (text === null) return null;
  let data: { id: string; raw?: string; internalDate?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new MailboxTransportError('REJECTED');
  }
  if (!data.raw) return null;
  const raw = Buffer.from(data.raw, 'base64url');
  if (raw.byteLength > MAX_REPORT_BYTES) return null;
  return {
    key: data.id,
    raw: raw.toString('utf8'),
    receivedAt: new Date(Number(data.internalDate ?? 0)),
  };
}

/** Bounce-sender message ids since `since` (and before `windowEnd`, epoch seconds), newest first. */
async function listGmailIds(
  headers: Record<string, string>,
  since: Date,
  windowEnd: number | null
): Promise<{ ids: string[]; capped: boolean }> {
  let q = `from:(mailer-daemon OR postmaster) after:${Math.floor(since.getTime() / 1000)}`;
  if (windowEnd !== null) q += ` before:${windowEnd}`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const params = new URLSearchParams({ q, maxResults: String(LIST_PAGE_SIZE) });
    if (pageToken) params.set('pageToken', pageToken);
    const list = await call(`${GMAIL_API}/messages?${params.toString()}`, { headers });
    if (!list.ok) throw httpError(list.status);
    const page = await json<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(list);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_LIST_PAGES);
  return { ids, capped: pageToken !== undefined };
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
