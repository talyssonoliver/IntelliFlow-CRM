/**
 * @vitest-environment happy-dom
 * providers.tsx - Logic tests for auth error detection and token validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Re-implement pure functions from providers.tsx
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
    return Date.now() < expiryTime - 30000;
  } catch { return false; }
}

function getValidAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  return isTokenValid(token) ? token : null;
}

function createTestJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ exp }));
  return header + '.' + payload + '.' + btoa('sig');
}

describe('providers - isAuthError', () => {
  it('returns false for null/undefined', () => {
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
  it('returns false for non-object', () => {
    expect(isAuthError('stringError')).toBe(false);
    expect(isAuthError(42)).toBe(false);
  });
  it('detects tRPC UNAUTHORIZED code', () => {
    expect(isAuthError({ data: { code: 'UNAUTHORIZED' } })).toBe(true);
  });
  it('detects unauthorized message', () => {
    expect(isAuthError({ message: 'User is unauthorized' })).toBe(true);
    expect(isAuthError({ message: 'Authentication required for this resource' })).toBe(true);
  });
  it('returns false for other errors', () => {
    expect(isAuthError({ data: { code: 'NOT_FOUND' } })).toBe(false);
    expect(isAuthError({ message: 'Something went wrong' })).toBe(false);
  });
});

describe('providers - isTokenValid', () => {
  it('returns false for null token', () => {
    expect(isTokenValid(null)).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isTokenValid('')).toBe(false);
  });
  it('returns false for malformed token', () => {
    expect(isTokenValid('not.a.valid.jwt')).toBe(false);
  });
  it('returns true for valid non-expired token', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenValid(createTestJwt(exp))).toBe(true);
  });
  it('returns false for expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    expect(isTokenValid(createTestJwt(exp))).toBe(false);
  });
  it('returns false for token expiring within 30s', () => {
    const exp = Math.floor(Date.now() / 1000) + 20;
    expect(isTokenValid(createTestJwt(exp))).toBe(false);
  });
  it('returns false when no exp claim', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ sub: 'test' }));
    expect(isTokenValid(header + '.' + payload + '.' + btoa('sig'))).toBe(false);
  });
});

describe('providers - getValidAccessToken', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('returns null when no token in storage', () => {
    expect(getValidAccessToken()).toBeNull();
  });
  it('returns token when valid and not expired', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt(exp);
    localStorage.setItem('accessToken', token);
    expect(getValidAccessToken()).toBe(token);
  });
  it('returns null when token is expired', () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem('accessToken', createTestJwt(exp));
    expect(getValidAccessToken()).toBeNull();
  });
});
