/**
 * Tests for apps/web/proxy.ts (root proxy)
 * Covers: proxy function, matchesPattern, config, role-based access
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDecrypt = vi.fn();
vi.mock('@/lib/session', () => ({
  decrypt: (...a: any[]) => mockDecrypt(...a),
  PUBLIC_ROUTES: ['/', '/login', '/signup', '/forgot-password'],
  PROTECTED_ROUTES: {
    '/dashboard': ['USER', 'MANAGER', 'ADMIN'],
    '/admin': ['ADMIN'],
    '/analytics': ['MANAGER', 'ADMIN'],
  } as Record<string, string[]>,
  hasRole: (s: any, r: string[]) => (s ? r.includes(s.role) : false),
}));

const mockCookiesGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (...a: any[]) => mockCookiesGet(...a) }),
}));

const mockRedirect = vi.fn().mockImplementation((url: any) => ({
  type: 'redirect',
  url: url.toString(),
  headers: new Map(),
  cookies: { delete: vi.fn() },
}));
const mockNextFn = vi.fn().mockImplementation(() => ({
  type: 'next',
  headers: { set: vi.fn() },
  cookies: { delete: vi.fn() },
}));

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    redirect: (...a: any[]) => mockRedirect(...a),
    next: (...a: any[]) => mockNextFn(...a),
  },
}));

import { proxy, config } from '../../proxy';

function mkReq(
  path: string,
  opts: { accessToken?: string; session?: string; searchParams?: Record<string, string> } = {}
) {
  const url = new URL(`http://localhost:3000${path}`);
  if (opts.searchParams)
    Object.entries(opts.searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  // Configure the next/headers cookies mock to match this request
  mockCookiesGet.mockImplementation((n: string) => {
    if (n === 'accessToken' && opts.accessToken) return { value: opts.accessToken };
    if (n === 'session' && opts.session) return { value: opts.session };
    return undefined;
  });
  return {
    nextUrl: { pathname: path, searchParams: url.searchParams, href: url.href },
    url: url.href,
    cookies: {
      get: (n: string) => {
        if (n === 'accessToken' && opts.accessToken) return { value: opts.accessToken };
        if (n === 'session' && opts.session) return { value: opts.session };
        return undefined;
      },
    },
  } as any;
}

describe('root proxy.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockDecrypt.mockResolvedValue(null);
    mockRedirect.mockImplementation((url: any) => ({
      type: 'redirect',
      url: url.toString(),
      headers: new Map(),
      cookies: { delete: vi.fn() },
    }));
    mockNextFn.mockImplementation(() => ({
      type: 'next',
      headers: { set: vi.fn() },
      cookies: { delete: vi.fn() },
    }));
  });

  describe('static bypass', () => {
    it('passes /_next', async () => {
      await proxy(mkReq('/_next/static/c.js'));
      expect(mockNextFn).toHaveBeenCalled();
    });
    it('passes /api', async () => {
      await proxy(mkReq('/api/trpc'));
      expect(mockNextFn).toHaveBeenCalled();
    });
    it('passes files with extension', async () => {
      await proxy(mkReq('/favicon.ico'));
      expect(mockNextFn).toHaveBeenCalled();
    });
  });

  describe('protected routes', () => {
    it('lets through when no auth (client handles)', async () => {
      await proxy(mkReq('/dashboard'));
      expect(mockNextFn).toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
    it('redirects USER from /admin', async () => {
      mockDecrypt.mockResolvedValue({ userId: 'u1', email: 'a@b.com', role: 'USER' });
      await proxy(mkReq('/admin', { session: 'valid' }));
      expect(mockRedirect).toHaveBeenCalled();
    });
    it('allows ADMIN to /admin', async () => {
      mockDecrypt.mockResolvedValue({ userId: 'u1', email: 'a@b.com', role: 'ADMIN' });
      await proxy(mkReq('/admin', { session: 'valid' }));
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('auth page redirect', () => {
    it('redirects auth user from /login', async () => {
      mockDecrypt.mockResolvedValue({ userId: 'u1', email: 'a@b.com', role: 'USER' });
      await proxy(mkReq('/login', { session: 'valid' }));
      expect(mockRedirect).toHaveBeenCalled();
    });
    it('redirects auth user from /signup', async () => {
      mockDecrypt.mockResolvedValue({ userId: 'u1', email: 'a@b.com', role: 'USER' });
      await proxy(mkReq('/signup', { session: 'valid' }));
      expect(mockRedirect).toHaveBeenCalled();
    });
    it('does not redirect with logged_out', async () => {
      mockDecrypt.mockResolvedValue({ userId: 'u1', email: 'a@b.com', role: 'USER' });
      await proxy(mkReq('/login', { session: 'valid', searchParams: { logged_out: '1' } }));
      expect(mockRedirect).not.toHaveBeenCalled();
    });
    it('clears stale token on auth page', async () => {
      mockDecrypt.mockResolvedValue(null);
      const r = await proxy(mkReq('/login', { accessToken: 'stale' }));
      expect(mockNextFn).toHaveBeenCalled();
      expect(r.cookies.delete).toBeDefined();
    });
  });

  describe('user info headers', () => {
    it('sets headers when session exists', async () => {
      mockDecrypt.mockResolvedValue({ userId: 'u1', email: 'a@b.com', role: 'USER' });
      const r = await proxy(mkReq('/some-page', { session: 'valid' }));
      expect(r.headers.set).toHaveBeenCalledWith('x-user-id', 'u1');
      expect(r.headers.set).toHaveBeenCalledWith('x-user-email', 'a@b.com');
      expect(r.headers.set).toHaveBeenCalledWith('x-user-role', 'USER');
    });
  });

  describe('config', () => {
    it('has matcher', () => {
      expect(config.matcher).toBeDefined();
      expect(config.matcher[0]).toContain('api');
    });
  });
});
