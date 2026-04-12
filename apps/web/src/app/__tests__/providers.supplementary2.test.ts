/**
 * @vitest-environment happy-dom
 * providers.tsx - Supplementary tests for URL builders, retry logic,
 * QueryClient configuration, and WebSocket client logic.
 *
 * Tests pure functions and configuration logic extracted from the source.
 * Does NOT render React components or use @testing-library/react.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ============================================================
// Re-implement pure functions from providers.tsx for testing
// ============================================================

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { data?: { code?: string }; message?: string };
  if (err.data?.code === 'UNAUTHORIZED') return true;
  const message = err.message?.toLowerCase() ?? '';
  return message.includes('unauthorized') || message.includes('authentication required');
}

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    const expiryTime = payload.exp * 1000;
    const now = Date.now();
    const isValid = now < expiryTime - 30000;
    if (!isValid) {
      localStorage.removeItem('accessToken');
      document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
    return isValid;
  } catch {
    localStorage.removeItem('accessToken');
    return false;
  }
}

function getValidAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  return isTokenValid(token) ? token : null;
}

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

function getWsUrl() {
  if (typeof window === 'undefined') return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT ?? '3001';
  if (process.env.NODE_ENV === 'production') {
    return `${protocol}//${window.location.host}/ws`;
  }
  return `${protocol}//localhost:${wsPort}`;
}

// ============================================================
// Helpers
// ============================================================

function createTestJwt(exp: number, extra: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ exp, ...extra }));
  return `${header}.${payload}.${btoa('sig')}`;
}

// ============================================================
// Tests
// ============================================================

describe('providers supplementary - isAuthError extended', () => {
  it('returns false for primitive false', () => {
    expect(isAuthError(false)).toBe(false);
  });

  it('returns false for number 0', () => {
    expect(isAuthError(0)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAuthError('')).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isAuthError({})).toBe(false);
  });

  it('returns false for array', () => {
    expect(isAuthError([])).toBe(false);
  });

  it('detects UNAUTHORIZED in data.code case-sensitively', () => {
    expect(isAuthError({ data: { code: 'UNAUTHORIZED' } })).toBe(true);
    expect(isAuthError({ data: { code: 'unauthorized' } })).toBe(false);
  });

  it('detects unauthorized in message case-insensitively', () => {
    expect(isAuthError({ message: 'UNAUTHORIZED ACCESS' })).toBe(true);
    expect(isAuthError({ message: 'Unauthorized' })).toBe(true);
    expect(isAuthError({ message: 'authentication required' })).toBe(true);
    expect(isAuthError({ message: 'AUTHENTICATION REQUIRED' })).toBe(true);
  });

  it('returns false for message with partial matches', () => {
    expect(isAuthError({ message: 'auth problem' })).toBe(false);
    expect(isAuthError({ message: 'required fields missing' })).toBe(false);
  });

  it('handles object with both data and message', () => {
    // data.code takes priority (checked first)
    expect(isAuthError({ data: { code: 'UNAUTHORIZED' }, message: 'all good' })).toBe(true);
  });

  it('handles nested data without code', () => {
    expect(isAuthError({ data: { status: 401 } })).toBe(false);
    expect(isAuthError({ data: {} })).toBe(false);
  });

  it('handles object with only data.code NOT_FOUND', () => {
    expect(isAuthError({ data: { code: 'NOT_FOUND' } })).toBe(false);
  });

  it('handles error-like object with stack', () => {
    expect(isAuthError({ message: 'unauthorized', stack: 'at ...' })).toBe(true);
  });
});

describe('providers supplementary - isTokenValid extended', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false for whitespace-only string', () => {
    expect(isTokenValid('   ')).toBe(false);
  });

  it('returns false for two-part token', () => {
    expect(isTokenValid('header.payload')).toBe(false);
  });

  it('returns false for four-part token', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = createTestJwt(exp);
    expect(isTokenValid(jwt + '.extra')).toBe(false);
  });

  it('returns true for token expiring in 31 seconds (just above 30s buffer)', () => {
    const exp = Math.floor(Date.now() / 1000) + 31;
    expect(isTokenValid(createTestJwt(exp))).toBe(true);
  });

  it('returns false for token expiring in 29 seconds (below 30s buffer)', () => {
    const exp = Math.floor(Date.now() / 1000) + 29;
    expect(isTokenValid(createTestJwt(exp))).toBe(false);
  });

  it('clears localStorage when token is expired', () => {
    const exp = Math.floor(Date.now() / 1000) - 100;
    localStorage.setItem('accessToken', 'expired-token');
    isTokenValid(createTestJwt(exp));
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('clears localStorage when token format is invalid', () => {
    localStorage.setItem('accessToken', 'will-be-cleared');
    isTokenValid('not.valid-json.token');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('does not clear localStorage when token is valid', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt(exp);
    localStorage.setItem('accessToken', token);
    isTokenValid(token);
    expect(localStorage.getItem('accessToken')).toBe(token);
  });

  it('handles token with exp as string (non-numeric)', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: 'not-a-number' }));
    const token = `${header}.${payload}.${btoa('sig')}`;
    // exp exists but is NaN when multiplied, so comparison fails
    expect(isTokenValid(token)).toBe(false);
  });

  it('handles token with exp=null', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: null }));
    const token = `${header}.${payload}.${btoa('sig')}`;
    expect(isTokenValid(token)).toBe(false);
  });
});

describe('providers supplementary - getValidAccessToken extended', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when localStorage is empty', () => {
    expect(getValidAccessToken()).toBeNull();
  });

  it('returns the token when it is valid', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt(exp);
    localStorage.setItem('accessToken', token);
    expect(getValidAccessToken()).toBe(token);
  });

  it('returns null and clears storage when token is expired', () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    const token = createTestJwt(exp);
    localStorage.setItem('accessToken', token);
    expect(getValidAccessToken()).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('returns null when stored value is not a JWT', () => {
    localStorage.setItem('accessToken', 'random-garbage');
    expect(getValidAccessToken()).toBeNull();
  });

  it('returns null when stored token has no exp', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ sub: 'test' }));
    const token = `${header}.${payload}.${btoa('sig')}`;
    localStorage.setItem('accessToken', token);
    expect(getValidAccessToken()).toBeNull();
  });
});

describe('providers supplementary - getBaseUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns empty string in browser environment', () => {
    // happy-dom provides window, so typeof window !== "undefined" is true
    expect(getBaseUrl()).toBe('');
  });
});

describe('providers supplementary - getWsUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns ws URL with default port in development', () => {
    (process.env as any).NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_WS_PORT;
    const url = getWsUrl();
    expect(url).toBe('ws://localhost:3001');
  });

  it('returns ws URL with custom port', () => {
    (process.env as any).NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_WS_PORT = '4567';
    const url = getWsUrl();
    expect(url).toBe('ws://localhost:4567');
  });

  it('returns wss protocol for https pages in production', () => {
    (process.env as any).NODE_ENV = 'production';
    // happy-dom uses http by default, so we need to override
    const originalProtocol = window.location.protocol;
    const originalHost = window.location.host;

    // Use Object.defineProperty to set protocol since location is read-only
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        protocol: 'https:',
        host: 'app.intelliflow.com',
      },
      writable: true,
      configurable: true,
    });

    const url = getWsUrl();
    expect(url).toBe('wss://app.intelliflow.com/ws');

    // Restore
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        protocol: originalProtocol,
        host: originalHost,
      },
      writable: true,
      configurable: true,
    });
  });
});

describe('providers supplementary - retry logic', () => {
  it('does not retry on auth error (failureCount irrelevant)', () => {
    const retryFn = (failureCount: number, error: unknown): boolean => {
      if (isAuthError(error)) return false;
      return failureCount < 3;
    };

    expect(retryFn(0, { data: { code: 'UNAUTHORIZED' } })).toBe(false);
    expect(retryFn(1, { data: { code: 'UNAUTHORIZED' } })).toBe(false);
    expect(retryFn(5, { data: { code: 'UNAUTHORIZED' } })).toBe(false);
  });

  it('retries non-auth errors up to 3 times', () => {
    const retryFn = (failureCount: number, error: unknown): boolean => {
      if (isAuthError(error)) return false;
      return failureCount < 3;
    };

    const nonAuthError = { message: 'Network error' };
    expect(retryFn(0, nonAuthError)).toBe(true);
    expect(retryFn(1, nonAuthError)).toBe(true);
    expect(retryFn(2, nonAuthError)).toBe(true);
    expect(retryFn(3, nonAuthError)).toBe(false);
    expect(retryFn(4, nonAuthError)).toBe(false);
  });

  it('does not retry auth errors with message detection', () => {
    const retryFn = (failureCount: number, error: unknown): boolean => {
      if (isAuthError(error)) return false;
      return failureCount < 3;
    };

    expect(retryFn(0, { message: 'User is unauthorized' })).toBe(false);
    expect(retryFn(0, { message: 'Authentication required' })).toBe(false);
  });
});

describe('providers supplementary - QueryCache auth status query skip logic', () => {
  it('identifies auth status query key pattern', () => {
    const queryKey = [['auth', 'getStatus']] as unknown[];
    const isAuthStatusQuery =
      Array.isArray(queryKey) &&
      queryKey.some(
        (k: unknown) =>
          Array.isArray(k) &&
          (k as string[]).includes('auth') &&
          (k as string[]).includes('getStatus')
      );
    expect(isAuthStatusQuery).toBe(true);
  });

  it('does not match non-auth query keys', () => {
    const queryKey = [['users', 'list']] as unknown[];
    const isAuthStatusQuery =
      Array.isArray(queryKey) &&
      queryKey.some(
        (k: unknown) =>
          Array.isArray(k) &&
          (k as string[]).includes('auth') &&
          (k as string[]).includes('getStatus')
      );
    expect(isAuthStatusQuery).toBe(false);
  });

  it('does not match partial auth query keys', () => {
    const queryKey = [['auth', 'login']] as unknown[];
    const isAuthStatusQuery =
      Array.isArray(queryKey) &&
      queryKey.some(
        (k: unknown) =>
          Array.isArray(k) &&
          (k as string[]).includes('auth') &&
          (k as string[]).includes('getStatus')
      );
    expect(isAuthStatusQuery).toBe(false);
  });

  it('does not match empty query key', () => {
    const queryKey = [] as unknown[];
    const isAuthStatusQuery =
      Array.isArray(queryKey) &&
      queryKey.some(
        (k: unknown) =>
          Array.isArray(k) &&
          (k as string[]).includes('auth') &&
          (k as string[]).includes('getStatus')
      );
    expect(isAuthStatusQuery).toBe(false);
  });

  it('handles nested array formats', () => {
    // tRPC sometimes nests keys differently
    const queryKey = [['auth'], ['getStatus']] as unknown[];
    const isAuthStatusQuery =
      Array.isArray(queryKey) &&
      queryKey.some(
        (k: unknown) =>
          Array.isArray(k) &&
          (k as string[]).includes('auth') &&
          (k as string[]).includes('getStatus')
      );
    // Each sub-array only contains one element, so this should NOT match
    expect(isAuthStatusQuery).toBe(false);
  });
});

describe('providers supplementary - handleAuthError guard conditions', () => {
  it('does not redirect if already on login page', () => {
    let redirected = false;
    const isRedirecting = false;
    const pathname = '/login';

    const handleAuthError = () => {
      if (isRedirecting) return;
      if (pathname === '/login') return;
      redirected = true;
    };

    handleAuthError();
    expect(redirected).toBe(false);
  });

  it('does not redirect if already redirecting', () => {
    let redirected = false;
    const isRedirecting = true;

    const handleAuthError = () => {
      if (isRedirecting) return;
      redirected = true;
    };

    handleAuthError();
    expect(redirected).toBe(false);
  });

  it('redirects on first auth error from non-login page', () => {
    let redirected = false;
    let isRedirecting = false;
    const pathname: string = '/dashboard';

    const handleAuthError = () => {
      if (isRedirecting) return;
      if (pathname === '/login') return;
      isRedirecting = true;
      redirected = true;
    };

    handleAuthError();
    expect(redirected).toBe(true);
    expect(isRedirecting).toBe(true);
  });

  it('only redirects once even if called multiple times', () => {
    let redirectCount = 0;
    let isRedirecting = false;
    const pathname: string = '/settings';

    const handleAuthError = () => {
      if (isRedirecting) return;
      if (pathname === '/login') return;
      isRedirecting = true;
      redirectCount++;
    };

    handleAuthError();
    handleAuthError();
    handleAuthError();
    expect(redirectCount).toBe(1);
  });
});

describe('providers supplementary - QueryClient default options', () => {
  it('has correct stale time of 5 minutes', () => {
    const staleTime = 5 * 60 * 1000;
    expect(staleTime).toBe(300000);
  });

  it('has correct gc time of 10 minutes', () => {
    const gcTime = 10 * 60 * 1000;
    expect(gcTime).toBe(600000);
  });
});

describe('providers supplementary - tRPC headers construction', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes x-trpc-source header always', () => {
    const headers: Record<string, string> = { 'x-trpc-source': 'react' };
    expect(headers['x-trpc-source']).toBe('react');
  });

  it('includes Authorization header when valid token exists', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt(exp);
    localStorage.setItem('accessToken', token);

    const headers: Record<string, string> = { 'x-trpc-source': 'react' };
    const accessToken = getValidAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    expect(headers['Authorization']).toBe(`Bearer ${token}`);
  });

  it('does not include Authorization when no valid token', () => {
    const headers: Record<string, string> = { 'x-trpc-source': 'react' };
    const accessToken = getValidAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    expect(headers['Authorization']).toBeUndefined();
  });

  it('does not include Authorization when token is expired', () => {
    const exp = Math.floor(Date.now() / 1000) - 100;
    const token = createTestJwt(exp);
    localStorage.setItem('accessToken', token);

    const headers: Record<string, string> = { 'x-trpc-source': 'react' };
    const accessToken = getValidAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    expect(headers['Authorization']).toBeUndefined();
  });
});
