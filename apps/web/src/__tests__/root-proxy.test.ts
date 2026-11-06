/**
 * @vitest-environment node
 */
/**
 * Tests for src/proxy.ts: the sign-in redirect, the report-only CSP and the
 * request id. Runs the real next/server request and response classes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy, config, CSP_REPORT_ONLY_HEADER, __resetCspCacheForTest } from '../proxy';

function tokenExpiringIn(seconds: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ exp: Math.floor(Date.now() / 1000) + seconds }),
    'signature',
  ].join('.');
}

function request(path: string, opts: { token?: string; requestId?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.token) headers.set('cookie', `accessToken=${opts.token}`);
  if (opts.requestId) headers.set('x-request-id', opts.requestId);
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

const savedEnv = { ...process.env };

beforeEach(() => {
  __resetCspCacheForTest();
});

afterEach(() => {
  process.env = { ...savedEnv };
  __resetCspCacheForTest();
});

describe('proxy: signed-out visits to app pages', () => {
  it('sends a deep link to sign-in and keeps the path and query to come back to', () => {
    const res = proxy(request('/deals/abc123?tab=notes'));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirect')).toBe('/deals/abc123?tab=notes');
  });

  it.each(['/dashboard', '/leads/new', '/settings/profile', '/analytics'])(
    'redirects %s',
    (path) => {
      expect(proxy(request(path)).status).toBe(307);
    }
  );

  it('treats an expired token as signed out and drops the cookie', () => {
    const res = proxy(request('/leads', { token: tokenExpiringIn(-60) }));

    expect(res.status).toBe(307);
    expect(res.headers.get('set-cookie')).toMatch(/accessToken=;/);
  });

  it('only matches whole path segments', () => {
    expect(proxy(request('/dealsroom')).status).toBe(200);
  });
});

describe('proxy: pages that load', () => {
  it('lets a signed-in visit through without touching the cookie', () => {
    const res = proxy(request('/deals/abc123', { token: tokenExpiringIn(3600) }));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it.each(['/', '/login', '/pricing', '/verify-email/callback'])(
    'lets the public page %s through when signed out',
    (path) => {
      expect(proxy(request(path)).status).toBe(200);
    }
  );

  it('drops an expired token cookie on a public page too', () => {
    const res = proxy(request('/login', { token: tokenExpiringIn(-60) }));

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/accessToken=;/);
  });
});

describe('proxy: headers', () => {
  it('sends the policy report-only, never as an enforced policy', () => {
    const res = proxy(request('/'));

    expect(res.headers.get(CSP_REPORT_ONLY_HEADER)).toContain("default-src 'self'");
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('puts the policy on redirects as well', () => {
    expect(proxy(request('/leads')).headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
  });

  it('builds the policy from the environment', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.invalid';
    __resetCspCacheForTest();

    expect(proxy(request('/')).headers.get(CSP_REPORT_ONLY_HEADER)).toContain(
      'https://api.example.invalid'
    );
  });

  it('keeps an incoming request id and passes it on', () => {
    const res = proxy(request('/', { requestId: 'req-from-edge' }));

    expect(res.headers.get('x-request-id')).toBe('req-from-edge');
    expect(res.headers.get('x-middleware-request-x-request-id')).toBe('req-from-edge');
  });

  it('creates a request id when there is none', () => {
    expect(proxy(request('/')).headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets no user or role headers', () => {
    const res = proxy(request('/deals', { token: tokenExpiringIn(3600) }));

    for (const name of ['x-user-id', 'x-user-email', 'x-user-role', 'x-nonce']) {
      expect(res.headers.get(name)).toBeNull();
      expect(res.headers.get(`x-middleware-request-${name}`)).toBeNull();
    }
  });
});

describe('config', () => {
  it('is exported as config so Next.js runs the proxy', () => {
    expect(config.matcher).toHaveLength(1);
  });

  it('skips API routes, Next.js assets and static files', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/deals/abc123')).toBe(true);
    expect(matcher.test('/api/trpc/auth.login')).toBe(false);
    expect(matcher.test('/_next/static/chunk.js')).toBe(false);
    expect(matcher.test('/brand/logo.svg')).toBe(false);
  });
});
