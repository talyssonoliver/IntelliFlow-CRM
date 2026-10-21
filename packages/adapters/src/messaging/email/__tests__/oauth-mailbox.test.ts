import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GMAIL_MAILBOX_SCOPES,
  MICROSOFT_MAILBOX_SCOPES,
  OAuthMailboxClient,
  createPkcePair,
  type OAuthClientConfig,
} from '../oauth-mailbox';

const config: OAuthClientConfig = {
  clientId: 'client-id',
  clientSecret: 'y'.repeat(16),
  redirectUri: 'https://app.example.invalid/email/oauth/callback',
};

type FetchCall = [string, RequestInit | undefined];
const fetchMock = vi.fn();

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Promise.resolve(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
  );
}
const calls = () => fetchMock.mock.calls as FetchCall[];
const hostOf = (url: string) => new URL(url).host;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPkcePair', () => {
  it('makes an S256 challenge of a 43+ character verifier', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe.each([
  ['GMAIL', 'accounts.google.com', GMAIL_MAILBOX_SCOPES],
  ['MICROSOFT', 'login.microsoftonline.com', MICROSOFT_MAILBOX_SCOPES],
] as const)('%s authorization URL', (provider, host, scopes) => {
  it('uses the fixed host, explicit minimal scopes, the env redirect URI and S256 PKCE', () => {
    const url = new URL(
      new OAuthMailboxClient(provider, config).authorizationUrl({
        state: 's'.repeat(43),
        codeChallenge: 'c'.repeat(43),
      })
    );
    expect(url.host).toBe(host);
    expect(url.searchParams.get('scope')).toBe(scopes.join(' '));
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('code_challenge')).toBe('c'.repeat(43));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('s'.repeat(43));
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('scopes', () => {
  it('asks Google only for send + read (bounce scan) + identity', () => {
    expect(GMAIL_MAILBOX_SCOPES).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ]);
  });
  it('asks Microsoft only for send + read (bounce scan) + identity + refresh', () => {
    expect(MICROSOFT_MAILBOX_SCOPES).toEqual([
      'offline_access',
      'User.Read',
      'Mail.Send',
      'Mail.Read',
    ]);
  });
});

describe('exchangeCode', () => {
  it('sends the PKCE verifier and returns tokens', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'a b' })
    );
    const now = new Date(Date.UTC(2026, 9, 20, 12));
    const tokens = await new OAuthMailboxClient('GMAIL', config).exchangeCode(
      'code',
      'v'.repeat(43),
      now
    );
    expect(tokens).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(now.getTime() + 3600_000),
      scopes: ['a', 'b'],
    });
    const [url, init] = calls()[0]!;
    expect(hostOf(url)).toBe('oauth2.googleapis.com');
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('code_verifier')).toBe('v'.repeat(43));
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('refuses a response without a refresh token (the mailbox could not be kept connected)', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { access_token: 'at', expires_in: 3600, scope: '' })
    );
    await expect(
      new OAuthMailboxClient('GMAIL', config).exchangeCode('code', 'v'.repeat(43), new Date())
    ).rejects.toMatchObject({ code: 'TOKEN_REVOKED' });
  });

  it('maps a provider error to AUTH_FAILED without its text', async () => {
    fetchMock.mockReturnValueOnce(
      respond(400, { error: 'invalid_grant', error_description: 'secret detail' })
    );
    const error = await new OAuthMailboxClient('MICROSOFT', config)
      .exchangeCode('code', 'v'.repeat(43), new Date())
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'AUTH_FAILED' });
    expect(String((error as Error).message)).not.toContain('secret detail');
    expect(hostOf(calls()[0]![0])).toBe('login.microsoftonline.com');
  });
});

describe('refresh', () => {
  it('returns a rotated refresh token when the provider sends one', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { access_token: 'at2', refresh_token: 'rt2', expires_in: 60, scope: 'x' })
    );
    const now = new Date(Date.UTC(2026, 9, 20));
    await expect(new OAuthMailboxClient('MICROSOFT', config).refresh('rt1', now)).resolves.toEqual({
      accessToken: 'at2',
      refreshToken: 'rt2',
      expiresAt: new Date(now.getTime() + 60_000),
    });
  });

  it('keeps the old refresh token when none is returned', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { access_token: 'at2', expires_in: 60, scope: 'x' })
    );
    const result = await new OAuthMailboxClient('GMAIL', config).refresh('rt1', new Date());
    expect(result.refreshToken).toBe('rt1');
  });

  it('maps invalid_grant to TOKEN_REVOKED', async () => {
    fetchMock.mockReturnValueOnce(respond(400, { error: 'invalid_grant' }));
    await expect(
      new OAuthMailboxClient('GMAIL', config).refresh('rt1', new Date())
    ).rejects.toMatchObject({
      code: 'TOKEN_REVOKED',
    });
  });

  it('maps a network failure to CONNECT_FAILED', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(
      new OAuthMailboxClient('GMAIL', config).refresh('rt1', new Date())
    ).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
  });
});

describe('revoke', () => {
  it('posts the token in the body for Google (never in the URL)', async () => {
    fetchMock.mockReturnValueOnce(respond(200, {}));
    await new OAuthMailboxClient('GMAIL', config).revoke('rt-secret');
    const [url, init] = calls()[0]!;
    expect(url).not.toContain('rt-secret');
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('rt-secret');
  });

  it('is a best-effort no-op for Microsoft (no revoke endpoint) and never throws', async () => {
    await expect(new OAuthMailboxClient('MICROSOFT', config).revoke('rt')).resolves.toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(new OAuthMailboxClient('GMAIL', config).revoke('rt')).resolves.toBeUndefined();
  });
});

describe('accountAddress', () => {
  it('reads a verified Google address from userinfo', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { email: 'Me@Gmail.example', email_verified: true })
    );
    await expect(new OAuthMailboxClient('GMAIL', config).accountAddress('at')).resolves.toBe(
      'me@gmail.example'
    );
    expect(hostOf(calls()[0]![0])).toBe('openidconnect.googleapis.com');
  });

  it('refuses an unverified Google address', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { email: 'me@gmail.example', email_verified: false })
    );
    await expect(
      new OAuthMailboxClient('GMAIL', config).accountAddress('at')
    ).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('reads the Microsoft address from /me (mail, else userPrincipalName)', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, { mail: null, userPrincipalName: 'Me@Contoso.example' })
    );
    await expect(new OAuthMailboxClient('MICROSOFT', config).accountAddress('at')).resolves.toBe(
      'me@contoso.example'
    );
    expect(hostOf(calls()[0]![0])).toBe('graph.microsoft.com');
  });
});

describe('sendRaw', () => {
  it('sends Gmail raw MIME as base64url and returns the message id', async () => {
    fetchMock.mockReturnValueOnce(respond(200, { id: 'gm1', threadId: 't1' }));
    const raw = Buffer.from('From: a\r\n\r\nbody');
    await expect(new OAuthMailboxClient('GMAIL', config).sendRaw('at', raw)).resolves.toEqual({
      providerMessageId: 'gm1',
    });
    const [url, init] = calls()[0]!;
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(JSON.parse(String(init?.body))).toEqual({ raw: raw.toString('base64url') });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer at');
  });

  it('sends Microsoft MIME through sendMail (base64 text/plain) and returns no id', async () => {
    fetchMock.mockReturnValueOnce(respond(202, ''));
    const raw = Buffer.from('From: a\r\n\r\nbody');
    await expect(new OAuthMailboxClient('MICROSOFT', config).sendRaw('at', raw)).resolves.toEqual({
      providerMessageId: null,
    });
    const [url, init] = calls()[0]!;
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    expect(init?.body).toBe(raw.toString('base64'));
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [429, 'RATE_LIMITED'],
    [400, 'REJECTED'],
    [500, 'CONNECT_FAILED'],
  ])('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockReturnValueOnce(respond(status, { error: { message: 'detail' } }));
    await expect(
      new OAuthMailboxClient('GMAIL', config).sendRaw('at', Buffer.from('x'))
    ).rejects.toMatchObject({ code });
  });
});

describe('listDsnSince', () => {
  const since = new Date(Date.UTC(2026, 9, 19));
  const gmailRaw = (id: string, hour: number) =>
    respond(200, {
      id,
      internalDate: String(Date.UTC(2026, 9, 19, hour)),
      raw: Buffer.from(`R-${id}`).toString('base64url'),
    });
  const graphMessage = (id: string, hour: number, bounce: boolean) => ({
    id,
    subject: bounce ? 'Undeliverable: Hello' : 'Lunch?',
    from: {
      emailAddress: { address: bounce ? 'postmaster@contoso.example' : 'friend@contoso.example' },
    },
    receivedDateTime: new Date(Date.UTC(2026, 9, 19, hour)).toISOString(),
  });

  it('Gmail: searches bounce senders after the cursor and reads them oldest first', async () => {
    fetchMock
      // Gmail lists newest first.
      .mockReturnValueOnce(respond(200, { messages: [{ id: 'm2' }, { id: 'm1' }] }))
      .mockReturnValueOnce(gmailRaw('m1', 1))
      .mockReturnValueOnce(gmailRaw('m2', 2));
    const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50);
    expect(result).toEqual({
      messages: [
        { key: 'm1', raw: 'R-m1', receivedAt: new Date(Date.UTC(2026, 9, 19, 1)) },
        { key: 'm2', raw: 'R-m2', receivedAt: new Date(Date.UTC(2026, 9, 19, 2)) },
      ],
      resumeFrom: null,
    });
    const listUrl = new URL(calls()[0]![0]);
    expect(listUrl.searchParams.get('q')).toBe(
      `from:(mailer-daemon OR postmaster) after:${Math.floor(since.getTime() / 1000)}`
    );
    expect(listUrl.searchParams.get('maxResults')).toBe('100');
    expect(new URL(calls()[1]![0]).searchParams.get('format')).toBe('raw');
  });

  it('Gmail: pages through the ids and resumes from the last report read when over the limit', async () => {
    fetchMock
      .mockReturnValueOnce(
        respond(200, { messages: [{ id: 'm3' }, { id: 'm2' }], nextPageToken: 'p2' })
      )
      .mockReturnValueOnce(respond(200, { messages: [{ id: 'm1' }] }))
      .mockReturnValueOnce(gmailRaw('m1', 1))
      .mockReturnValueOnce(gmailRaw('m2', 2));
    const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 2);
    expect(new URL(calls()[1]![0]).searchParams.get('pageToken')).toBe('p2');
    expect(result.messages.map((m) => m.key)).toEqual(['m1', 'm2']);
    expect(result.resumeFrom).toEqual(new Date(Date.UTC(2026, 9, 19, 2)));
  });

  it('Microsoft: filters by receivedDateTime, keeps bounce-looking messages and fetches their MIME', async () => {
    fetchMock
      .mockReturnValueOnce(
        respond(200, { value: [graphMessage('a', 1, true), graphMessage('b', 2, false)] })
      )
      .mockReturnValueOnce(respond(200, 'MIME-A'));
    const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 50);
    expect(result).toEqual({
      messages: [{ key: 'a', raw: 'MIME-A', receivedAt: new Date(Date.UTC(2026, 9, 19, 1)) }],
      resumeFrom: null,
    });
    const listUrl = new URL(calls()[0]![0]);
    expect(listUrl.searchParams.get('$filter')).toBe(`receivedDateTime ge ${since.toISOString()}`);
    expect(listUrl.searchParams.get('$orderby')).toBe('receivedDateTime asc');
    expect(calls()[1]![0]).toBe('https://graph.microsoft.com/v1.0/me/messages/a/$value');
  });

  it('Microsoft: follows the next page so a bounce after a page of ordinary mail is not lost', async () => {
    const next = 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page2';
    fetchMock
      .mockReturnValueOnce(
        respond(200, { value: [graphMessage('n1', 1, false)], '@odata.nextLink': next })
      )
      .mockReturnValueOnce(respond(200, { value: [graphMessage('c', 3, true)] }))
      .mockReturnValueOnce(respond(200, 'MIME-C'));
    const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 50);
    expect(calls()[1]![0]).toBe(next);
    expect(result).toEqual({
      messages: [{ key: 'c', raw: 'MIME-C', receivedAt: new Date(Date.UTC(2026, 9, 19, 3)) }],
      resumeFrom: null,
    });
  });

  it('Microsoft: stops at the limit and resumes from the last message it examined', async () => {
    fetchMock
      .mockReturnValueOnce(
        respond(200, { value: [graphMessage('a', 1, true), graphMessage('c', 2, true)] })
      )
      .mockReturnValueOnce(respond(200, 'MIME-A'));
    const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 1);
    expect(result.messages.map((m) => m.key)).toEqual(['a']);
    expect(result.resumeFrom).toEqual(new Date(Date.UTC(2026, 9, 19, 1)));
  });

  it('Microsoft: never sends the token to a continuation link on another host', async () => {
    fetchMock.mockReturnValueOnce(
      respond(200, {
        value: [graphMessage('n1', 1, false)],
        '@odata.nextLink': 'https://graph.example.invalid/v1.0/me/messages?$skiptoken=x',
      })
    );
    const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 50);
    expect(calls()).toHaveLength(1);
    expect(result.resumeFrom).toEqual(new Date(Date.UTC(2026, 9, 19, 1)));
  });

  it('only ever calls the fixed provider hosts', async () => {
    fetchMock.mockImplementation(() => respond(200, { messages: [], value: [] }));
    await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 5);
    await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 5);
    for (const [url] of calls()) {
      expect(['gmail.googleapis.com', 'graph.microsoft.com']).toContain(hostOf(url));
    }
  });
});
