/**
 * Tests for src/proxy.ts
 * Covers: proxy function, parseSession, config
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.fn().mockImplementation((url: any) => ({
  type: 'redirect', url, cookies: { delete: vi.fn() },
}));
const mockNext = vi.fn().mockImplementation(() => ({
  type: 'next', cookies: { delete: vi.fn() },
}));

vi.mock('next/server', () => ({
  NextResponse: { redirect: (...a: any[]) => mockRedirect(...a), next: (...a: any[]) => mockNext(...a) },
}));

import { proxy, config } from '../proxy';

function mkReq(path: string, cookies: Record<string, string> = {}, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost:3000${path}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  return {
    nextUrl: url,
    cookies: {
      get: (n: string) => cookies[n] ? { value: cookies[n] } : undefined,
      getAll: () => Object.entries(cookies).map(([name,value]) => ({ name, value })),
    },
  } as any;
}

describe('src/proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console,'log').mockImplementation(()=>{});
    mockRedirect.mockImplementation((url: any) => ({
      type: 'redirect', url, cookies: { delete: vi.fn() },
    }));
    mockNext.mockImplementation(() => ({
      type: 'next', cookies: { delete: vi.fn() },
    }));
  });

  it('passes through without cookies', () => {
    proxy(mkReq('/dashboard'));
    expect(mockNext).toHaveBeenCalled();
  });

  it('redirects auth user from /login', () => {
    const exp = Math.floor(Date.now()/1000) + 3600;
    proxy(mkReq('/login', { session: JSON.stringify({ accessToken:'t', expiresAt: exp }) }));
    expect(mockRedirect).toHaveBeenCalled();
  });

  it('redirects auth user from /signup', () => {
    const exp = Math.floor(Date.now()/1000) + 3600;
    proxy(mkReq('/signup', { session: JSON.stringify({ accessToken:'t', expiresAt: exp }) }));
    expect(mockRedirect).toHaveBeenCalled();
  });

  it('does not redirect with logged_out param', () => {
    const exp = Math.floor(Date.now()/1000) + 3600;
    proxy(mkReq('/login', { session: JSON.stringify({ accessToken:'t', expiresAt: exp }) }, { logged_out:'1' }));
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('clears stale cookies', () => {
    const r = proxy(mkReq('/dashboard', { accessToken:'stale', session:'bad' }));
    expect(mockNext).toHaveBeenCalled();
    expect(r.cookies.delete).toBeDefined();
  });

  it('does not redirect for non-auth pages', () => {
    const exp = Math.floor(Date.now()/1000) + 3600;
    proxy(mkReq('/dashboard', { session: JSON.stringify({ accessToken:'t', expiresAt: exp }) }));
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('handles expired session', () => {
    const exp = Math.floor(Date.now()/1000) - 3600;
    proxy(mkReq('/login', { session: JSON.stringify({ accessToken:'t', expiresAt: exp }) }));
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('handles session without accessToken', () => {
    proxy(mkReq('/login', { session: JSON.stringify({ expiresAt: Math.floor(Date.now()/1000)+3600 }) }));
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('handles session without expiresAt', () => {
    proxy(mkReq('/login', { session: JSON.stringify({ accessToken:'t' }) }));
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('config matcher excludes assets', () => {
    expect(config.matcher[0]).toContain('api');
    expect(config.matcher[0]).toContain('_next/static');
  });
});
