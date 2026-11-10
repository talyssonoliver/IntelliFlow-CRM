/**
 * TeamsAdapter against a stubbed fetch. Until now no test imported this adapter: the Teams half
 * of tests/integration/connectors/messaging.test.ts called fetch itself and asserted its own
 * mocked JSON (#1216).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TeamsAdapter,
  TeamsAuthenticationError,
  TeamsInvalidRequestError,
  TeamsNotFoundError,
  TeamsRateLimitError,
  type TeamsConfig,
  type TeamsOAuthTokens,
} from '../client';

const mockFetch = vi.fn();

// Fixture values assembled at runtime so no credential-shaped literal sits in source.
const config: TeamsConfig = {
  clientId: 'client-' + 'a'.repeat(8),
  clientSecret: 'secret-' + 'b'.repeat(8),
  tenantId: 'tenant-1',
};
const tokens: TeamsOAuthTokens = {
  accessToken: 'access-' + 'c'.repeat(8),
  expiresAt: new Date(Date.now() + 3_600_000),
  scope: [],
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

let adapter: TeamsAdapter;

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  adapter = new TeamsAdapter(config);
});

afterEach(() => vi.unstubAllGlobals());

describe('TeamsAdapter authentication', () => {
  it('gets an app token with the client-credentials grant for Graph', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'at', expires_in: 3600, token_type: 'Bearer' })
    );

    const result = await adapter.getAccessToken();

    expect(result.isSuccess && result.value.accessToken).toBe('at');
    const [url, init] = mockFetch.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token');
    expect(init.body.get('grant_type')).toBe('client_credentials');
    expect(init.body.get('scope')).toBe('https://graph.microsoft.com/.default');
    expect(init.body.get('client_id')).toBe(config.clientId);
  });

  it('reports a refused token request as an authentication error', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(401, { error_description: 'AADSTS7000215: bad secret' })
    );
    const result = await adapter.getAccessToken();
    expect(result.isFailure).toBe(true);
    if (result.isFailure) {
      expect(result.error).toBeInstanceOf(TeamsAuthenticationError);
      expect(result.error.message).toContain('AADSTS7000215');
    }
  });
});

describe('TeamsAdapter channel messages', () => {
  it('posts to the team channel with the bearer token and maps the created message', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(201, {
        id: 'msg-1',
        createdDateTime: '2026-11-08T12:00:00Z',
        body: { contentType: 'html', content: '<b>Deal won</b>' },
        importance: 'high',
      })
    );

    const result = await adapter.sendChannelMessage(tokens, 'team-1', 'chan-1', {
      body: '<b>Deal won</b>',
      isHtml: true,
      subject: 'Sales',
      importance: 'high',
    } as never);

    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) {
      expect(result.value.id).toBe('msg-1');
      expect(result.value.body).toEqual({ contentType: 'html', content: '<b>Deal won</b>' });
      expect(result.value.importance).toBe('high');
    }
    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://graph.microsoft.com/v1.0/teams/team-1/channels/chan-1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${tokens.accessToken}`);
    expect(JSON.parse(init.body)).toEqual({
      body: { contentType: 'html', content: '<b>Deal won</b>' },
      importance: 'high',
      subject: 'Sales',
    });
  });

  it.each([
    [401, {}, TeamsAuthenticationError],
    [404, {}, TeamsNotFoundError],
    [429, { 'Retry-After': '30' }, TeamsRateLimitError],
    [400, {}, TeamsInvalidRequestError],
  ] as const)('maps Graph status %i to its error', async (status, headers, ErrorClass) => {
    mockFetch.mockResolvedValueOnce(jsonResponse(status, { error: { message: 'nope' } }, headers));
    const result = await adapter.sendChannelMessage(tokens, 'team-1', 'chan-1', {
      body: 'hi',
    } as never);
    expect(result.isFailure).toBe(true);
    if (result.isFailure) expect(result.error).toBeInstanceOf(ErrorClass);
  });
});
