import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, getTokenExpiryMs, getTokenMaxAgeSeconds, isTokenUsable } from '../jwt';

function createTestJwt(exp: number, extra: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp, ...extra }));
  return `${header}.${payload}.${btoa('sig')}`;
}

describe('jwt helpers', () => {
  it('decodes a valid JWT payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(decodeJwtPayload(createTestJwt(exp, { sub: 'user-123' }))).toEqual({
      exp,
      sub: 'user-123',
    });
  });

  it('returns null for malformed JWT payloads', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(getTokenExpiryMs('not-a-jwt')).toBeNull();
  });

  it('treats expired tokens as unusable', () => {
    const expiredToken = createTestJwt(Math.floor(Date.now() / 1000) - 60);
    expect(isTokenUsable(expiredToken)).toBe(false);
    expect(getTokenMaxAgeSeconds(expiredToken)).toBe(0);
  });

  // Moved from AuthContext.test.ts / AuthContext.supplementary2.test.ts, which asserted copies
  // of these helpers instead of the real ones (#1216).
  describe('edge cases', () => {
    const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url'); // no padding, - and _
    const tokenWith = (payload: unknown) =>
      `${base64Url({ alg: 'HS256' })}.${base64Url(payload)}.sig`;

    it('decodes base64url payloads without padding and with - or _ characters', () => {
      // '>>>' and '???' encode to '-' and '_' in base64url.
      const payload = { sub: '>>>???', exp: 2_000_000_000, n: 'x' };
      const token = tokenWith(payload);
      expect(token.split('.')[1]).toMatch(/[-_]/);
      expect(token.split('.')[1]).not.toContain('=');
      expect(decodeJwtPayload(token)).toEqual(payload);
    });

    it('returns null when the token does not have exactly three parts', () => {
      expect(decodeJwtPayload('a.b')).toBeNull();
      expect(decodeJwtPayload('a.b.c.d')).toBeNull();
      expect(decodeJwtPayload('')).toBeNull();
    });

    it('returns null when the payload is not JSON', () => {
      expect(decodeJwtPayload(`h.${Buffer.from('not json').toString('base64url')}.s`)).toBeNull();
    });

    it('has no expiry when exp is missing or not a finite number', () => {
      for (const payload of [{ sub: 'u' }, { exp: '2000000000' }, { exp: null }, { exp: {} }]) {
        const token = tokenWith(payload);
        expect(getTokenExpiryMs(token)).toBeNull();
        expect(isTokenUsable(token)).toBe(false);
        expect(getTokenMaxAgeSeconds(token)).toBeNull();
      }
    });

    it('treats no token, and a token inside the expiry buffer, as unusable', () => {
      expect(isTokenUsable(null)).toBe(false);
      expect(isTokenUsable('')).toBe(false);
      const soon = tokenWith({ exp: Math.floor(Date.now() / 1000) + 10 });
      expect(isTokenUsable(soon)).toBe(false); // default 30s buffer
      expect(isTokenUsable(soon, 0)).toBe(true);
      expect(getTokenMaxAgeSeconds(soon)).toBe(0);
    });
  });

  it('returns expiry metadata for usable tokens', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt(exp);
    expect(getTokenExpiryMs(token)).toBe(exp * 1000);
    expect(isTokenUsable(token)).toBe(true);
    expect(getTokenMaxAgeSeconds(token)).toBeGreaterThan(0);
  });
});
