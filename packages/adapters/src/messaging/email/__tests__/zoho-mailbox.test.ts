import { describe, it, expect, vi } from 'vitest';
import {
  ZOHO_MAILBOX_SCOPES,
  ZohoMailboxClient,
  zohoDataCentreByAccounts,
  zohoDataCentreByMailHost,
} from '../zoho-mailbox';
import { MailboxTransportError } from '../mailbox-errors';

const NOW = new Date('2026-11-15T10:00:00.000Z');
// Not real credentials: built at runtime so nothing secret-shaped sits in the source.
const SECRET = ['client', 'secret', 'for', 'tests'].join('-');
const ACCESS = ['access', 'for', 'tests'].join('-');
const REFRESH = ['refresh', 'for', 'tests'].join('-');
const CONFIG = {
  clientId: 'zoho-client-id',
  clientSecret: SECRET,
  redirectUri: 'https://app.example.invalid/email/oauth/callback',
};

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Call = [string, RequestInit];
const calls = (fetchImpl: ReturnType<typeof vi.fn>) => fetchImpl.mock.calls as unknown as Call[];
const client = (fetchImpl: ReturnType<typeof vi.fn>) =>
  new ZohoMailboxClient(CONFIG, fetchImpl as unknown as typeof fetch);

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.catch((e: unknown) => e);
  return error instanceof MailboxTransportError ? error.code : undefined;
}

describe('Zoho data centres', () => {
  it('knows only Zoho hosts, from an accounts server or a stored mail host', () => {
    expect(zohoDataCentreByAccounts('https://accounts.zoho.eu')?.mail).toBe('mail.zoho.eu');
    expect(zohoDataCentreByAccounts('accounts.zoho.com')?.location).toBe('us');
    expect(zohoDataCentreByMailHost('mail.zoho.in')?.accounts).toBe('accounts.zoho.in');
    expect(
      zohoDataCentreByAccounts('https://accounts.zoho.eu.attacker.example.invalid')
    ).toBeNull();
    expect(zohoDataCentreByAccounts('http://accounts.zoho.com')).toBeNull();
    expect(zohoDataCentreByMailHost('mail.example.invalid')).toBeNull();
    expect(zohoDataCentreByMailHost('not a host')).toBeNull();
  });
});

describe('ZohoMailboxClient', () => {
  it('asks for send and account read only, offline, with consent and PKCE', () => {
    const url = new URL(client(vi.fn()).authorizationUrl({ state: 's1', codeChallenge: 'c1' }));
    expect(url.origin).toBe('https://accounts.zoho.com');
    expect(url.pathname).toBe('/oauth/v2/auth');
    expect(url.searchParams.get('scope')).toBe(ZOHO_MAILBOX_SCOPES.join(','));
    // Nothing that reads mail: logging comes later, with its own consent.
    expect(url.searchParams.get('scope')).not.toContain('messages.READ');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge')).toBe('c1');
    expect(url.searchParams.get('state')).toBe('s1');
  });

  it("exchanges the code at the account's own data centre and returns its mail host", async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 })
    );

    const tokens = await client(fetchImpl).exchangeCode(
      'code-1',
      'verifier-1',
      NOW,
      'https://accounts.zoho.eu'
    );

    const [url, init] = calls(fetchImpl)[0]!;
    expect(url).toBe('https://accounts.zoho.eu/oauth/v2/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(tokens).toMatchObject({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      mailHost: 'mail.zoho.eu',
      expiresAt: new Date(NOW.getTime() + 3600_000),
    });
  });

  it('never sends the code or secret to an accounts server that is not Zoho', async () => {
    const fetchImpl = vi.fn();
    const result = client(fetchImpl).exchangeCode(
      'code-1',
      'v',
      NOW,
      'https://accounts.example.invalid'
    );

    expect(await codeOf(result)).toBe('AUTH_FAILED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads an error answered with 200, and needs a refresh token', async () => {
    const failing = vi.fn(async () => respond(200, { error: 'invalid_code' }));
    expect(await codeOf(client(failing).exchangeCode('c', 'v', NOW, null))).toBe('AUTH_FAILED');

    const noRefresh = vi.fn(async () => respond(200, { access_token: ACCESS }));
    expect(await codeOf(client(noRefresh).exchangeCode('c', 'v', NOW, null))).toBe('TOKEN_REVOKED');
  });

  it('refreshes at the stored data centre, keeps the refresh token, and spots a dead one', async () => {
    const fetchImpl = vi.fn(async () => respond(200, { access_token: ACCESS, expires_in: 3600 }));
    const refreshed = await client(fetchImpl).refresh(REFRESH, NOW, 'mail.zoho.in');
    expect(calls(fetchImpl)[0]![0]).toBe('https://accounts.zoho.in/oauth/v2/token');
    expect(refreshed.refreshToken).toBe(REFRESH);

    const dead = vi.fn(async () => respond(200, { error: 'invalid_code' }));
    expect(await codeOf(client(dead).refresh(REFRESH, NOW, 'mail.zoho.in'))).toBe('TOKEN_REVOKED');
    expect(await codeOf(client(vi.fn()).refresh(REFRESH, NOW, 'mail.example.invalid'))).toBe(
      'AUTH_FAILED'
    );
  });

  it('reads the account id and every address it may send as', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, {
        data: [
          {
            accountId: 1234567,
            primaryEmailAddress: 'Owner@Business.example.invalid',
            emailAddress: [
              { mailId: 'sales@business.example.invalid', isConfirmed: true },
              { mailId: 'pending@business.example.invalid', isConfirmed: false },
            ],
            sendMailDetails: [
              { fromAddress: 'team@business.example.invalid', validated: true, status: true },
              { fromAddress: 'unverified@other.example.invalid', validated: false },
            ],
          },
        ],
      })
    );

    const identity = await client(fetchImpl).identity(ACCESS, 'mail.zoho.com');

    const [url, init] = calls(fetchImpl)[0]!;
    expect(url).toBe('https://mail.zoho.com/api/accounts');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Zoho-oauthtoken ${ACCESS}`
    );
    expect(identity).toEqual({
      accountId: '1234567',
      address: 'owner@business.example.invalid',
      sendAs: [
        'owner@business.example.invalid',
        'sales@business.example.invalid',
        'team@business.example.invalid',
      ],
    });
  });

  it('refuses an account list without a usable account', async () => {
    const fetchImpl = vi.fn(async () => respond(200, { data: [] }));
    expect(await codeOf(client(fetchImpl).identity(ACCESS, 'mail.zoho.com'))).toBe('AUTH_FAILED');
  });

  it('sends as JSON fields to the account, with attachments uploaded first', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        respond(200, {
          data: { storeName: 'st-1', attachmentPath: '/p/1', attachmentName: 'a.pdf' },
        })
      )
      .mockResolvedValueOnce(respond(200, { data: { messageId: 98765 } }));

    const result = await client(fetchImpl).sendMessage(
      ACCESS,
      { mailHost: 'mail.zoho.eu', accountId: '42' },
      {
        from: 'owner@business.example.invalid',
        to: ['ada@example.invalid', 'bob@example.invalid'],
        cc: ['cy@example.invalid'],
        bcc: [],
        subject: 'Proposal',
        html: '<p>Hello</p>',
        attachments: [
          { filename: 'a.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
        ],
      }
    );

    const [uploadUrl] = calls(fetchImpl)[0]!;
    expect(uploadUrl).toBe(
      'https://mail.zoho.eu/api/accounts/42/messages/attachments?fileName=a.pdf'
    );
    const [sendUrl, sendInit] = calls(fetchImpl)[1]!;
    expect(sendUrl).toBe('https://mail.zoho.eu/api/accounts/42/messages');
    expect(JSON.parse(String(sendInit.body))).toEqual({
      fromAddress: 'owner@business.example.invalid',
      toAddress: 'ada@example.invalid,bob@example.invalid',
      ccAddress: 'cy@example.invalid',
      subject: 'Proposal',
      content: '<p>Hello</p>',
      mailFormat: 'html',
      attachments: [{ storeName: 'st-1', attachmentPath: '/p/1', attachmentName: 'a.pdf' }],
    });
    expect(result).toEqual({ providerMessageId: '98765' });
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [429, 'RATE_LIMITED'],
    [500, 'CONNECT_FAILED'],
    [400, 'REJECTED'],
  ])('maps a %i on send to %s, without provider text', async (status, expected) => {
    const fetchImpl = vi.fn(async () => respond(status, { data: { moreInfo: 'provider detail' } }));
    const error = await client(fetchImpl)
      .sendMessage(
        ACCESS,
        { mailHost: 'mail.zoho.com', accountId: '1' },
        {
          from: 'a@example.invalid',
          to: ['b@example.invalid'],
          subject: 's',
          html: 'h',
        }
      )
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: expected });
    expect(String((error as Error).message)).not.toContain('provider detail');
  });

  it('reads a dead token from the body, whatever the status (Zoho answers 404 for it)', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(404, { status: { code: 404 }, data: { errorCode: 'INVALID_OAUTHTOKEN' } })
    );
    expect(await codeOf(client(fetchImpl).identity(ACCESS, 'mail.zoho.com'))).toBe('AUTH_FAILED');
  });

  it('keeps a 19-digit account id and message id exact (past a JSON number)', async () => {
    const text =
      '{"data":[{"accountId":2560636000000008002,"primaryEmailAddress":"o@b.example.invalid"}]}';
    const identity = await client(vi.fn(async () => new Response(text, { status: 200 }))).identity(
      ACCESS,
      'mail.zoho.com'
    );
    expect(identity.accountId).toBe('2560636000000008002');

    const sent = await client(
      vi.fn(async () => new Response('{"data":{"messageId":1734567890123456789}}', { status: 200 }))
    ).sendMessage(
      ACCESS,
      { mailHost: 'mail.zoho.com', accountId: '1' },
      {
        from: 'o@b.example.invalid',
        to: ['a@example.invalid'],
        subject: 's',
        html: 'h',
      }
    );
    expect(sent.providerMessageId).toBe('1734567890123456789');
  });

  it.each([
    [
      'Cc only',
      { to: [], cc: ['cy@example.invalid', 'di@example.invalid'] },
      'cy@example.invalid',
      'di@example.invalid',
    ],
    ['Bcc only', { to: [], bcc: ['bo@example.invalid'] }, 'o@b.example.invalid', undefined],
  ])(
    'gives a %s send the To Zoho requires, showing no Bcc address',
    async (_label, fields, to, cc) => {
      const fetchImpl = vi.fn(async () => respond(200, { data: {} }));
      await client(fetchImpl).sendMessage(
        ACCESS,
        { mailHost: 'mail.zoho.com', accountId: '1' },
        {
          from: 'o@b.example.invalid',
          subject: 's',
          html: 'h',
          ...fields,
        }
      );
      const body = JSON.parse(String(calls(fetchImpl)[0]![1].body));
      expect(body.toAddress).toBe(to);
      expect(body.ccAddress).toBe(cc);
    }
  );

  it('never calls a stored mail host that is not Zoho', async () => {
    const fetchImpl = vi.fn();
    const send = client(fetchImpl).sendMessage(
      ACCESS,
      { mailHost: 'mail.example.invalid', accountId: '1' },
      { from: 'a@example.invalid', to: ['b@example.invalid'], subject: 's', html: 'h' }
    );
    expect(await codeOf(send)).toBe('AUTH_FAILED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a network failure to CONNECT_FAILED and revokes at the right data centre', async () => {
    const down = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    expect(await codeOf(client(down).identity(ACCESS, 'mail.zoho.com'))).toBe('CONNECT_FAILED');

    const fetchImpl = vi.fn(async () => respond(200, {}));
    await client(fetchImpl).revoke(REFRESH, 'mail.zoho.jp');
    expect(calls(fetchImpl)[0]![0]).toBe(
      `https://accounts.zoho.jp/oauth/v2/token/revoke?token=${REFRESH}`
    );
    await expect(client(down).revoke(REFRESH, 'mail.zoho.jp')).resolves.toBeUndefined();
  });
});
