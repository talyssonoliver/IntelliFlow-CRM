/**
 * The access token the tRPC client sends. Replaces app/__tests__/providers.test.ts and
 * providers.supplementary2.test.ts, which asserted copies of these functions; the copies did
 * not clear the cookie the real code clears (#1216).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { clearTokenCookie } = vi.hoisted(() => ({ clearTokenCookie: vi.fn() }));
vi.mock('@/lib/shared/session-cleanup', () => ({ clearTokenCookie }));

import {
  ACCESS_TOKEN_EXPIRY_BUFFER_MS,
  getValidAccessToken,
  isStoredTokenValid,
} from '../access-token';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** A JWT-shaped string built at runtime; the signature is never checked here. */
const tokenExpiringIn = (ms: number) =>
  [
    encode({ alg: 'none' }),
    encode({ sub: 'u1', exp: Math.floor((Date.now() + ms) / 1000) }),
    's',
  ].join('.');

beforeEach(() => {
  clearTokenCookie.mockClear();
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('isStoredTokenValid', () => {
  it('accepts a token that expires after the buffer, and keeps it', () => {
    const token = tokenExpiringIn(ACCESS_TOKEN_EXPIRY_BUFFER_MS + 60_000);
    localStorage.setItem('accessToken', token);

    expect(isStoredTokenValid(token)).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe(token);
    expect(clearTokenCookie).not.toHaveBeenCalled();
  });

  it.each([
    // Absolute, not derived from the constant, so changing the 30s policy fails here.
    ['expires inside the 30s buffer', () => tokenExpiringIn(25_000)],
    ['has expired', () => tokenExpiringIn(-60_000)],
    ['is malformed', () => 'not-a-jwt'],
    ['has no exp', () => [encode({}), encode({ sub: 'u1' }), 's'].join('.')],
  ])('rejects a token that %s, and clears it from storage and the cookie', (_case, make) => {
    const token = make();
    localStorage.setItem('accessToken', token);

    expect(isStoredTokenValid(token)).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(clearTokenCookie).toHaveBeenCalledTimes(1);
  });

  it('treats no token as invalid without clearing anything', () => {
    expect(isStoredTokenValid(null)).toBe(false);
    expect(isStoredTokenValid('')).toBe(false);
    expect(clearTokenCookie).not.toHaveBeenCalled();
  });
});

describe('getValidAccessToken', () => {
  it('returns the stored token while it is valid', () => {
    const token = tokenExpiringIn(3_600_000);
    localStorage.setItem('accessToken', token);
    expect(getValidAccessToken()).toBe(token);
  });

  it('returns null, and clears it, once it has expired', () => {
    localStorage.setItem('accessToken', tokenExpiringIn(-1_000));
    expect(getValidAccessToken()).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(getValidAccessToken()).toBeNull();
  });

  it('returns null on the server, where there is no storage', () => {
    localStorage.setItem('accessToken', tokenExpiringIn(3_600_000));
    vi.stubGlobal('window', undefined);
    try {
      expect(getValidAccessToken()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
