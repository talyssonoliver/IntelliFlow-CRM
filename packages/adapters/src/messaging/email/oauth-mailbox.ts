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
import type { OAuthMailboxProvider } from '@intelliflow/domain';
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
const BOUNCE_SENDER = /^(postmaster|mailer-daemon|microsoftexchange[0-9a-f]*)@/i;
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
    if (!response.ok) {
      throw new MailboxTransportError(
        data.error === 'invalid_grant' ? 'TOKEN_REVOKED' : 'AUTH_FAILED'
      );
    }
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

  /** Raw bounce-report candidates received since `since` (the parser decides what is one). */
  async listDsnSince(accessToken: string, since: Date, limit: number): Promise<RawDsnMessage[]> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (this.provider === 'GMAIL') {
      const params = new URLSearchParams({
        q: `from:(mailer-daemon OR postmaster) after:${Math.floor(since.getTime() / 1000)}`,
        maxResults: String(limit),
      });
      const list = await call(`${GMAIL_API}/messages?${params.toString()}`, { headers });
      if (!list.ok) throw httpError(list.status);
      const ids = ((await json<{ messages?: Array<{ id: string }> }>(list)).messages ?? []).slice(
        0,
        limit
      );
      const out: RawDsnMessage[] = [];
      for (const { id } of ids) {
        const response = await call(`${GMAIL_API}/messages/${encodeURIComponent(id)}?format=raw`, {
          headers,
        });
        if (!response.ok) throw httpError(response.status);
        const data = await json<{ id: string; raw?: string; internalDate?: string }>(response);
        if (!data.raw) continue;
        out.push({
          key: data.id,
          raw: Buffer.from(data.raw, 'base64url').toString('utf8'),
          receivedAt: new Date(Number(data.internalDate ?? 0)),
        });
      }
      return out;
    }

    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${since.toISOString()}`,
      $select: 'id,subject,from,receivedDateTime',
      $orderby: 'receivedDateTime asc',
      $top: String(Math.min(limit * 2, 100)),
    });
    const list = await call(`${GRAPH_API}/messages?${params.toString()}`, { headers });
    if (!list.ok) throw httpError(list.status);
    const candidates = (
      (
        await json<{
          value?: Array<{
            id: string;
            subject?: string;
            from?: { emailAddress?: { address?: string } };
            receivedDateTime: string;
          }>;
        }>(list)
      ).value ?? []
    )
      .filter(
        (m) =>
          BOUNCE_SENDER.test(m.from?.emailAddress?.address ?? '') ||
          BOUNCE_SUBJECT.test(m.subject ?? '')
      )
      .slice(0, limit);
    const out: RawDsnMessage[] = [];
    for (const message of candidates) {
      const response = await call(
        `${GRAPH_API}/messages/${encodeURIComponent(message.id)}/$value`,
        {
          headers,
        }
      );
      if (!response.ok) throw httpError(response.status);
      out.push({
        key: message.id,
        raw: await response.text(),
        receivedAt: new Date(message.receivedDateTime),
      });
    }
    return out;
  }
}
