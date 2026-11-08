/**
 * OutlookAdapter against a stubbed fetch. Until now no test imported this adapter: the Outlook
 * half of tests/integration/connectors/email.test.ts called fetch itself and asserted its own
 * mocked JSON, and built an authorization URL without `state` or `response_mode` (#1216).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OutlookAdapter,
  OutlookAuthenticationError,
  OutlookInvalidRequestError,
  OutlookNotFoundError,
  OutlookRateLimitError,
  type OutlookConfig,
  type OutlookOAuthTokens,
} from '../client';

const mockFetch = vi.fn();

// Fixture values assembled at runtime so no credential-shaped literal sits in source.
const config: OutlookConfig = {
  clientId: 'client-' + 'a'.repeat(8),
  clientSecret: 'secret-' + 'b'.repeat(8),
  tenantId: 'tenant-1',
  redirectUri: 'https://app.example.invalid/oauth/outlook/callback',
};
const tokens: OutlookOAuthTokens = {
  accessToken: 'access-' + 'c'.repeat(8),
  refreshToken: 'refresh-' + 'd'.repeat(8),
  expiresAt: new Date(Date.now() + 3_600_000),
  scope: ['Mail.Send'],
  tokenType: 'Bearer',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  };
}

let adapter: OutlookAdapter;

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  adapter = new OutlookAdapter(config);
});

afterEach(() => vi.unstubAllGlobals());

describe('OutlookAdapter OAuth', () => {
  it('builds the authorization URL with the caller state, query response mode and default scopes', () => {
    const url = new URL(adapter.getAuthorizationUrl('csrf-state-1'));

    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/authorize'
    );
    expect(url.searchParams.get('state')).toBe('csrf-state-1');
    expect(url.searchParams.get('response_mode')).toBe('query');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(config.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('scope')).toContain('offline_access');
  });

  it('exchanges a code for tokens at the tenant token endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'Mail.Send offline_access',
        token_type: 'Bearer',
      })
    );

    const result = await adapter.exchangeCodeForTokens('auth-code');

    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) {
      expect(result.value.accessToken).toBe('at');
      expect(result.value.refreshToken).toBe('rt');
      expect(result.value.scope).toEqual(['Mail.Send', 'offline_access']);
    }
    const [url, init] = mockFetch.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token');
    expect(init.body.get('grant_type')).toBe('authorization_code');
    expect(init.body.get('code')).toBe('auth-code');
  });

  it('reports a rejected code as an authentication error with Microsoft’s description', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(400, { error_description: 'AADSTS70008: expired' })
    );
    const result = await adapter.exchangeCodeForTokens('old-code');
    expect(result.isFailure).toBe(true);
    if (result.isFailure) {
      expect(result.error).toBeInstanceOf(OutlookAuthenticationError);
      expect(result.error.message).toContain('AADSTS70008');
    }
  });

  it('keeps the old refresh token when Microsoft does not return a new one', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'at2',
        expires_in: 3600,
        scope: 'Mail.Send',
        token_type: 'Bearer',
      })
    );
    const result = await adapter.refreshAccessToken('rt-old');
    expect(result.isSuccess && result.value.refreshToken).toBe('rt-old');
    const [, init] = mockFetch.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(init.body.get('grant_type')).toBe('refresh_token');
  });

  it('treats tokens expiring within five minutes as invalid', () => {
    expect(
      adapter.validateTokens({ ...tokens, expiresAt: new Date(Date.now() + 10 * 60_000) })
    ).toBe(true);
    expect(
      adapter.validateTokens({ ...tokens, expiresAt: new Date(Date.now() + 2 * 60_000) })
    ).toBe(false);
  });
});

describe('OutlookAdapter sending', () => {
  it('sends through Graph sendMail with the bearer token and the composed message', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(202, null));

    const result = await adapter.sendMessage(tokens, {
      to: ['ana@example.invalid'],
      cc: ['ops@example.invalid'],
      subject: 'Hello',
      body: '<p>Hi</p>',
      isHtml: true,
    } as never);

    expect(result.isSuccess).toBe(true);
    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${tokens.accessToken}`);
    expect(JSON.parse(init.body)).toEqual({
      message: {
        subject: 'Hello',
        body: { contentType: 'html', content: '<p>Hi</p>' },
        toRecipients: [{ emailAddress: { address: 'ana@example.invalid' } }],
        ccRecipients: [{ emailAddress: { address: 'ops@example.invalid' } }],
        importance: 'normal',
      },
      saveToSentItems: true,
    });
  });

  it.each([
    [401, {}, OutlookAuthenticationError],
    [404, {}, OutlookNotFoundError],
    [429, { 'Retry-After': '30' }, OutlookRateLimitError],
    [400, {}, OutlookInvalidRequestError],
  ] as const)('maps Graph status %i to its error', async (status, headers, ErrorClass) => {
    mockFetch.mockResolvedValueOnce(jsonResponse(status, { error: { message: 'nope' } }, headers));
    const result = await adapter.sendMessage(tokens, {
      to: ['ana@example.invalid'],
      subject: 's',
      body: 'b',
    } as never);
    expect(result.isFailure).toBe(true);
    if (result.isFailure) expect(result.error).toBeInstanceOf(ErrorClass);
  });
});
