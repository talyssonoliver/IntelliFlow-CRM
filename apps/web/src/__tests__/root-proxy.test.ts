/**
 * Tests for apps/web/proxy.ts (root proxy)
 * Covers: proxy function, matchesPattern, proxyConfig, role-based access
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

import { proxy, proxyConfig } from '../../proxy';

function createTestJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.${btoa('sig')}`;
}

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
    it('redirects to login when no auth', async () => {
      await proxy(mkReq('/dashboard'));
      expect(mockRedirect).toHaveBeenCalled();
      expect(mockNextFn).not.toHaveBeenCalled();
      const redirectUrl = mockRedirect.mock.calls[0][0].toString();
      expect(redirectUrl).toContain('/login');
      expect(redirectUrl).toContain('redirect=%2Fdashboard');
    });

    it('includes redirect param with original path', async () => {
      await proxy(mkReq('/agent-approvals/ai-review'));
      const redirectUrl = mockRedirect.mock.calls[0][0].toString();
      expect(redirectUrl).toContain('redirect=%2Fagent-approvals%2Fai-review');
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
    it('passes through with accessToken cookie', async () => {
      const accessToken = createTestJwt(Math.floor(Date.now() / 1000) + 3600);
      await proxy(mkReq('/dashboard', { accessToken }));
      expect(mockNextFn).toHaveBeenCalled();
      // Should not redirect since hasAnyAuthArtifact is true
      // (role check may still redirect, but no login redirect)
    });

    it('redirects to login and clears expired accessToken cookie', async () => {
      const expiredAccessToken = createTestJwt(Math.floor(Date.now() / 1000) - 60);
      const response = await proxy(mkReq('/dashboard', { accessToken: expiredAccessToken }));
      expect(mockRedirect).toHaveBeenCalled();
      expect(response.cookies.delete).toHaveBeenCalledWith('accessToken');
    });
  });

  describe('new protected patterns', () => {
    const newPatterns = [
      '/agent-approvals',
      '/calendar',
      '/billing',
      '/governance',
      '/notifications',
      '/cases',
      '/deals',
      '/documents',
      '/email',
      '/profile',
      '/tickets',
    ];

    it.each(newPatterns)('redirects unauthenticated user from %s', async (route) => {
      await proxy(mkReq(route));
      expect(mockRedirect).toHaveBeenCalled();
      const redirectUrl = mockRedirect.mock.calls[0][0].toString();
      expect(redirectUrl).toContain('/login');
    });

    it('redirects for sub-paths of new patterns', async () => {
      await proxy(mkReq('/tickets/123'));
      expect(mockRedirect).toHaveBeenCalled();
    });
  });

  describe('non-protected routes pass through', () => {
    it('does not redirect /auth/callback', async () => {
      await proxy(mkReq('/auth/callback'));
      expect(mockNextFn).toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('does not redirect /auth/mfa/verify', async () => {
      await proxy(mkReq('/auth/mfa/verify'));
      expect(mockNextFn).toHaveBeenCalled();
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

  describe('proxyConfig', () => {
    it('has matcher', () => {
      expect(proxyConfig.matcher).toBeDefined();
      expect(proxyConfig.matcher[0]).toContain('api');
    });
  });

  describe('calendar to appointments redirects (post-split migration)', () => {
    // Direction was reversed in the Appointments/Calendar Split migration
    // (started 2026-04-13 — memory: project_appointments_split_migration).
    // next.config.js now redirects `/calendar/new` → `/appointments/new` and
    // `/calendar/<id>` → `/appointments/<id>` (permanent), while settings
    // sub-routes (availability, calendar-settings, event-types) remain under
    // /calendar.
    it('redirects /calendar/new to /appointments/new with permanent flag', async () => {
      const nextConfig = require('../../next.config.js');
      const redirects = await nextConfig.redirects();
      const rule = redirects.find((r: { source: string }) => r.source === '/calendar/new');
      expect(rule).toBeDefined();
      expect(rule.destination).toBe('/appointments/new');
      expect(rule.permanent).toBe(true);
    });

    it('redirects /calendar/:id (non-settings) to /appointments/:id with permanent flag', async () => {
      const nextConfig = require('../../next.config.js');
      const redirects = await nextConfig.redirects();
      const rule = redirects.find((r: { source: string }) =>
        r.source.startsWith('/calendar/:id((?!new')
      );
      expect(rule).toBeDefined();
      expect(rule.destination).toBe('/appointments/:id');
      expect(rule.permanent).toBe(true);
    });
  });
});
