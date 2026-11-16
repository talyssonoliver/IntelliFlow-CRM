/**
 * @vitest-environment happy-dom
 *
 * The last confirmed auth status (MVP-007): it is only handed back for the same token subject,
 * while that token is usable, and anything doubtful returns null so the provider waits for
 * auth.getStatus as before.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AUTH_STATUS_CACHE_KEY,
  clearCachedAuthStatus,
  readCachedAuthStatus,
  sameTokenSubject,
  writeCachedAuthStatus,
} from '../auth-status-snapshot';

/** A token-shaped string built at runtime: only its payload is read, nothing verifies it here. */
function tokenFor(payload: Record<string, unknown>): string {
  const part = (o: unknown) =>
    btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return [part({ alg: 'none' }), part(payload), 'sig'].join('.');
}
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const user = { id: 'u1', email: 'owner@example.invalid', name: 'Owner', role: 'ADMIN' };

describe('auth status snapshot', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('hands the status back for the same subject while the token is usable', () => {
    const tok = tokenFor({ sub: 'user-1', exp: inAnHour() });
    writeCachedAuthStatus(tok, null, user, true);
    expect(readCachedAuthStatus(tok, null)).toEqual({
      sub: 'user-1',
      tenant: null,
      user,
      emailVerified: true,
    });
  });

  it('accepts a newer token for the same subject (a refresh)', () => {
    writeCachedAuthStatus(tokenFor({ sub: 'user-1', exp: inAnHour() }), null, user, null);
    const refreshed = tokenFor({ sub: 'user-1', exp: inAnHour() + 60 });
    expect(readCachedAuthStatus(refreshed, null)?.user).toEqual(user);
  });

  it('returns null for another subject, an expired token, or no token', () => {
    writeCachedAuthStatus(tokenFor({ sub: 'user-1', exp: inAnHour() }), null, user, true);
    expect(readCachedAuthStatus(tokenFor({ sub: 'user-2', exp: inAnHour() }), null)).toBeNull();
    expect(readCachedAuthStatus(tokenFor({ sub: 'user-1', exp: 1 }), null)).toBeNull();
    expect(readCachedAuthStatus(null, null)).toBeNull();
    expect(readCachedAuthStatus(tokenFor({ exp: inAnHour() }), null)).toBeNull();
  });

  it('returns null for unreadable or incomplete data, and reads a non-boolean emailVerified as null', () => {
    const tok = tokenFor({ sub: 'user-1', exp: inAnHour() });
    localStorage.setItem(AUTH_STATUS_CACHE_KEY, '{ not json');
    expect(readCachedAuthStatus(tok, null)).toBeNull();
    localStorage.setItem(AUTH_STATUS_CACHE_KEY, JSON.stringify({ sub: 'user-1' }));
    expect(readCachedAuthStatus(tok, null)).toBeNull();
    localStorage.setItem(AUTH_STATUS_CACHE_KEY, JSON.stringify(42));
    expect(readCachedAuthStatus(tok, null)).toBeNull();
    localStorage.setItem(
      AUTH_STATUS_CACHE_KEY,
      JSON.stringify({ sub: 'user-1', user, emailVerified: 'yes' })
    );
    expect(readCachedAuthStatus(tok, null)?.emailVerified).toBeNull();
  });

  it('stores nothing without a usable token or a subject', () => {
    writeCachedAuthStatus(null, null, user, true);
    writeCachedAuthStatus(tokenFor({ sub: 'user-1', exp: 1 }), null, user, true);
    writeCachedAuthStatus(tokenFor({ exp: inAnHour() }), null, user, true);
    expect(localStorage.getItem(AUTH_STATUS_CACHE_KEY)).toBeNull();
  });

  it('hands a status back only in the workspace it was confirmed in (ADR-071 roles differ per workspace)', () => {
    const tok = tokenFor({ sub: 'user-1', exp: inAnHour() });
    writeCachedAuthStatus(tok, 'tenant_client_1', user, true);
    expect(readCachedAuthStatus(tok, 'tenant_client_1')?.tenant).toBe('tenant_client_1');
    expect(readCachedAuthStatus(tok, null)).toBeNull();
    expect(readCachedAuthStatus(tok, 'tenant_client_2')).toBeNull();
    writeCachedAuthStatus(tok, null, user, true);
    expect(readCachedAuthStatus(tok, 'tenant_client_1')).toBeNull();
  });

  it('tells whether two tokens belong to the same subject', () => {
    const a = tokenFor({ sub: 'user-1', exp: inAnHour() });
    expect(sameTokenSubject(a, tokenFor({ sub: 'user-1', exp: inAnHour() + 60 }))).toBe(true);
    expect(sameTokenSubject(a, tokenFor({ sub: 'user-2', exp: inAnHour() }))).toBe(false);
    expect(sameTokenSubject(a, null)).toBe(false);
    expect(sameTokenSubject(null, a)).toBe(false);
    expect(sameTokenSubject(tokenFor({ exp: inAnHour() }), tokenFor({ exp: inAnHour() }))).toBe(
      false
    );
  });

  it('clears the stored status', () => {
    const tok = tokenFor({ sub: 'user-1', exp: inAnHour() });
    writeCachedAuthStatus(tok, null, user, true);
    clearCachedAuthStatus();
    expect(readCachedAuthStatus(tok, null)).toBeNull();
  });

  it('survives storage that refuses to write or remove', () => {
    const tok = tokenFor({ sub: 'user-1', exp: inAnHour() });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeCachedAuthStatus(tok, null, user, true)).not.toThrow();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => clearCachedAuthStatus()).not.toThrow();
  });
});
