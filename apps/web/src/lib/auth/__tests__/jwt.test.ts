import { describe, expect, it } from 'vitest';
import {
  decodeJwtPayload,
  getTokenExpiryMs,
  getTokenMaxAgeSeconds,
  isTokenUsable,
} from '../jwt';

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

  it('returns expiry metadata for usable tokens', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt(exp);
    expect(getTokenExpiryMs(token)).toBe(exp * 1000);
    expect(isTokenUsable(token)).toBe(true);
    expect(getTokenMaxAgeSeconds(token)).toBeGreaterThan(0);
  });
});
