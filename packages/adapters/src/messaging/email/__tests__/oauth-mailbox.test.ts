import { createHash } from 'node:crypto';
import { EMAIL_LIMITS } from '@intelliflow/domain';
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

  it('keeps a throttled or failing token endpoint apart from bad credentials', async () => {
    fetchMock.mockReturnValueOnce(respond(429, { error: 'rate_limited' }));
    await expect(
      new OAuthMailboxClient('GMAIL', config).refresh('rt1', new Date())
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    fetchMock.mockReturnValueOnce(respond(503, { error: 'temporarily_unavailable' }));
    await expect(
      new OAuthMailboxClient('GMAIL', config).refresh('rt1', new Date())
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
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

  it('Gmail: pages through the ids and resumes at the first report it did not take when over the limit', async () => {
    fetchMock
      .mockReturnValueOnce(
        respond(200, { messages: [{ id: 'm3' }, { id: 'm2' }], nextPageToken: 'p2' })
      )
      .mockReturnValueOnce(respond(200, { messages: [{ id: 'm1' }] }))
      .mockReturnValueOnce(gmailRaw('m1', 1))
      .mockReturnValueOnce(gmailRaw('m2', 2))
      .mockReturnValueOnce(gmailRaw('m3', 3));
    const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 2);
    expect(new URL(calls()[1]![0]).searchParams.get('pageToken')).toBe('p2');
    expect(result.messages.map((m) => m.key)).toEqual(['m1', 'm2']);
    expect(result.resumeFrom).toEqual(new Date(Date.UTC(2026, 9, 19, 3)));
  });

  it('Gmail: never splits reports received in the same second, so a full batch of them cannot repeat forever', async () => {
    const at = (id: string, ms: number) =>
      respond(200, {
        id,
        internalDate: String(ms),
        raw: Buffer.from(`R-${id}`).toString('base64url'),
      });
    const second = Date.UTC(2026, 9, 19, 10);
    const times: Record<string, number> = {
      s0: second + 100,
      s1: second + 500,
      s2: second + 900,
      later: second + 1000,
    };
    fetchMock.mockImplementation((url: string) => {
      const id = /messages\/([^?]+)\?format=raw/.exec(url)?.[1];
      if (id) return at(id, times[id]!);
      // Newest first.
      return respond(200, {
        messages: [{ id: 'later' }, { id: 's2' }, { id: 's1' }, { id: 's0' }],
      });
    });
    const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 2);
    expect(result.messages.map((m) => m.key)).toEqual(['s0', 's1', 's2']);
    // Resumes at the first second it did not finish (Gmail's after: is by the second).
    expect(result.resumeFrom).toEqual(new Date(second + 1000));
  });

  it('Gmail: past the page cap, narrows the window so the oldest reports are read and none is skipped', async () => {
    // 2 days after the cursor; the first narrowed window ends 1 day after it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(since.getTime() + 2 * 86_400_000));
    try {
      const windowEnd = Math.floor((since.getTime() + 86_400_000) / 1000);
      fetchMock.mockImplementation((url: string) => {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (url.includes('format=raw')) return gmailRaw('old', 1);
        // The whole interval never ends within the page cap; the narrowed window does.
        return q.includes('before:')
          ? respond(200, { messages: [{ id: 'old' }] })
          : respond(200, { messages: [{ id: 'new' }], nextPageToken: 'more' });
      });
      const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50);
      const narrowed = calls().find(([url]) => url.includes('before%3A'));
      expect(new URL(narrowed![0]).searchParams.get('q')).toBe(
        `from:(mailer-daemon OR postmaster) after:${Math.floor(since.getTime() / 1000)} before:${windowEnd}`
      );
      expect(result.messages.map((m) => m.key)).toEqual(['old']);
      // Resumes just inside the window's end: everything before it was read.
      expect(result.resumeFrom).toEqual(new Date((windowEnd - 1) * 1000));
    } finally {
      vi.useRealTimers();
    }
  });

  it('Gmail: never moves past the cursor when even the narrowest window passes the page cap', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('format=raw')
        ? gmailRaw('new', 1)
        : respond(200, { messages: [{ id: 'new' }], nextPageToken: 'more' })
    );
    const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50);
    expect(result.resumeFrom).toEqual(since);
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

  it('Microsoft: stops at the limit and resumes at the first message it did not examine', async () => {
    fetchMock
      .mockReturnValueOnce(
        respond(200, { value: [graphMessage('a', 1, true), graphMessage('c', 2, true)] })
      )
      .mockReturnValueOnce(respond(200, 'MIME-A'));
    const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 1);
    expect(result.messages.map((m) => m.key)).toEqual(['a']);
    expect(result.resumeFrom).toEqual(new Date(Date.UTC(2026, 9, 19, 2)));
  });

  it('Microsoft: never splits reports sharing one receive time, so a full batch of them cannot repeat forever', async () => {
    const sameTime = Array.from({ length: 3 }, (_, i) => graphMessage(`s${i}`, 1, true));
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/$value')
        ? respond(200, 'MIME')
        : respond(200, { value: [...sameTime, graphMessage('later', 2, true)] })
    );
    const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 2);
    expect(result.messages.map((m) => m.key)).toEqual(['s0', 's1', 's2']);
    expect(result.resumeFrom).toEqual(new Date(Date.UTC(2026, 9, 19, 2)));
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

  describe('oversized reports (never held in memory, cursor still moves past them)', () => {
    const limit = EMAIL_LIMITS.bounceScanMaxMessageBytes;
    /** A body streamed in 64 KB chunks with no declared length; counts what was pulled. */
    const streamed = (totalBytes: number) => {
      const state = { pulled: 0, cancelled: false };
      const chunk = new Uint8Array(64 * 1024).fill(0x41);
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (state.pulled >= totalBytes) return controller.close();
          state.pulled += chunk.byteLength;
          controller.enqueue(chunk);
        },
        cancel() {
          state.cancelled = true;
        },
      });
      return { response: Promise.resolve(new Response(body, { status: 200 })), state };
    };

    it('Microsoft: skips a report whose declared length is over the limit and keeps the next one', async () => {
      fetchMock
        .mockReturnValueOnce(
          respond(200, { value: [graphMessage('big', 1, true), graphMessage('ok', 2, true)] })
        )
        .mockReturnValueOnce(
          respond(200, 'x'.repeat(limit + 1), { 'content-length': String(limit + 1) })
        )
        .mockReturnValueOnce(respond(200, 'MIME-OK'));
      const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince(
        'at',
        since,
        50
      );
      expect(result).toEqual({
        messages: [{ key: 'ok', raw: 'MIME-OK', receivedAt: new Date(Date.UTC(2026, 9, 19, 2)) }],
        resumeFrom: null,
      });
    });

    it('Microsoft: stops reading an undeclared body at the limit instead of downloading it all', async () => {
      const big = streamed(50 * 1024 * 1024);
      fetchMock
        .mockReturnValueOnce(respond(200, { value: [graphMessage('big', 1, true)] }))
        .mockReturnValueOnce(big.response);
      const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince(
        'at',
        since,
        50
      );
      expect(result).toEqual({ messages: [], resumeFrom: null });
      expect(big.state.cancelled).toBe(true);
      expect(big.state.pulled).toBeLessThanOrEqual(limit + 2 * 64 * 1024);
    });

    it('Microsoft: keeps a report of exactly the limit', async () => {
      fetchMock
        .mockReturnValueOnce(respond(200, { value: [graphMessage('edge', 1, true)] }))
        .mockReturnValueOnce(respond(200, 'x'.repeat(limit)));
      const result = await new OAuthMailboxClient('MICROSOFT', config).listDsnSince(
        'at',
        since,
        50
      );
      expect(result.messages.map((m) => m.raw.length)).toEqual([limit]);
    });

    it('Gmail: skips a report whose decoded MIME is over the limit and keeps the next one', async () => {
      fetchMock
        .mockReturnValueOnce(respond(200, { messages: [{ id: 'ok' }, { id: 'big' }] }))
        .mockReturnValueOnce(
          respond(200, {
            id: 'big',
            internalDate: String(Date.UTC(2026, 9, 19, 1)),
            raw: Buffer.alloc(limit + 1, 0x41).toString('base64url'),
          })
        )
        .mockReturnValueOnce(gmailRaw('ok', 2));
      const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50);
      expect(result).toEqual({
        messages: [{ key: 'ok', raw: 'R-ok', receivedAt: new Date(Date.UTC(2026, 9, 19, 2)) }],
        resumeFrom: null,
      });
    });

    it('Gmail: stops reading a huge response before decoding any of it', async () => {
      const big = streamed(50 * 1024 * 1024);
      fetchMock
        .mockReturnValueOnce(respond(200, { messages: [{ id: 'big' }] }))
        .mockReturnValueOnce(big.response);
      const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50);
      expect(result).toEqual({ messages: [], resumeFrom: null });
      expect(big.state.cancelled).toBe(true);
      expect(big.state.pulled).toBeLessThan(2 * limit);
    });

    it('Gmail: keeps a report of exactly the limit', async () => {
      fetchMock
        .mockReturnValueOnce(respond(200, { messages: [{ id: 'edge' }] }))
        .mockReturnValueOnce(
          respond(200, {
            id: 'edge',
            internalDate: String(Date.UTC(2026, 9, 19, 1)),
            raw: Buffer.alloc(limit, 0x41).toString('base64url'),
          })
        );
      const result = await new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50);
      expect(result.messages.map((m) => m.raw.length)).toEqual([limit]);
    });

    it('Gmail: a message whose JSON cannot be read is a refusal, not a crash', async () => {
      fetchMock
        .mockReturnValueOnce(respond(200, { messages: [{ id: 'bad' }] }))
        .mockReturnValueOnce(respond(200, '{not json'));
      await expect(
        new OAuthMailboxClient('GMAIL', config).listDsnSince('at', since, 50)
      ).rejects.toMatchObject({ code: 'REJECTED' });
    });

    it('a body that breaks off mid-stream is a connection failure', async () => {
      const broken = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error('reset'));
        },
      });
      fetchMock
        .mockReturnValueOnce(respond(200, { value: [graphMessage('a', 1, true)] }))
        .mockReturnValueOnce(Promise.resolve(new Response(broken, { status: 200 })));
      await expect(
        new OAuthMailboxClient('MICROSOFT', config).listDsnSince('at', since, 50)
      ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    });
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
