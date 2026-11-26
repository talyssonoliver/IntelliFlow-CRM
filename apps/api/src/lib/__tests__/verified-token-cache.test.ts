import { describe, it, expect } from 'vitest';
import {
  VerifiedTokenCache,
  VERIFIED_TOKEN_TTL_MS,
  jwtExpiryMs,
  jwtSubject,
} from '../verified-token-cache';

const user = (id: string) => ({ id, email: `${id}@example.invalid` }) as any;

/** A JWT-shaped string whose payload carries `exp` (seconds). The signature is irrelevant here. */
function tokenWithExp(expSeconds: number | null | string, tag = 'a', sub: string = tag): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = expSeconds === null ? { sub } : { sub, exp: expSeconds };
  return `${enc({ alg: 'ES256' })}.${enc(payload)}.sig-${tag}`;
}

function clockedCache(maxEntries?: number) {
  let now = 1_800_000_000_000;
  const cache = new VerifiedTokenCache(VERIFIED_TOKEN_TTL_MS, maxEntries, () => now);
  return { cache, tick: (ms: number) => (now += ms), nowSeconds: () => Math.floor(now / 1000) };
}

describe('VerifiedTokenCache', () => {
  it('serves a confirmed user for less than 60 s and not after', () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600);
    cache.set(token, user('u1'));
    expect(cache.get(token)?.id).toBe('u1');
    tick(59_999);
    expect(cache.get(token)?.id).toBe('u1');
    tick(1);
    expect(cache.get(token)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('never exceeds 60 s even when constructed with a longer TTL', () => {
    let now = 1_800_000_000_000;
    const cache = new VerifiedTokenCache(10 * 60_000, 10, () => now);
    const token = tokenWithExp(Math.floor(now / 1000) + 3600);
    cache.set(token, user('u1'));
    now += 60_001;
    expect(cache.get(token)).toBeNull();
  });

  it('never outlives the token itself', () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 10);
    cache.set(token, user('u1'));
    tick(9_000);
    expect(cache.get(token)?.id).toBe('u1');
    tick(1_500);
    expect(cache.get(token)).toBeNull();
  });

  it('does not store an already expired token', () => {
    const { cache, nowSeconds } = clockedCache();
    cache.set(tokenWithExp(nowSeconds() - 1), user('u1'));
    expect(cache.size).toBe(0);
  });

  it('does not store a user without an id', () => {
    const { cache } = clockedCache();
    cache.set(tokenWithExp(null), {} as any);
    expect(cache.size).toBe(0);
  });

  it('holds only a hash: the token text is nowhere in the cache', () => {
    const { cache, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600, 'secret-marker');
    cache.set(token, user('u1'));
    const dump = JSON.stringify([...(cache as any).entries.keys()]);
    expect(dump).not.toContain('secret-marker');
    expect(dump).not.toContain(token);
    expect(dump).toMatch(/^\["[0-9a-f]{64}"\]$/);
  });

  it('one token does not unlock another', () => {
    const { cache, nowSeconds } = clockedCache();
    cache.set(tokenWithExp(nowSeconds() + 3600, 'a'), user('u1'));
    expect(cache.get(tokenWithExp(nowSeconds() + 3600, 'b'))).toBeNull();
  });

  it('deleteUser drops every token of that user and no one else', () => {
    const { cache, nowSeconds } = clockedCache();
    const exp = nowSeconds() + 3600;
    cache.set(tokenWithExp(exp, 'a'), user('u1'));
    cache.set(tokenWithExp(exp, 'b'), user('u1'));
    cache.set(tokenWithExp(exp, 'c'), user('u2'));
    expect(cache.deleteUser('u1')).toBe(2);
    expect(cache.get(tokenWithExp(exp, 'a'))).toBeNull();
    expect(cache.get(tokenWithExp(exp, 'b'))).toBeNull();
    expect(cache.get(tokenWithExp(exp, 'c'))?.id).toBe('u2');
    expect(cache.deleteUser('nobody')).toBe(0);
  });

  it("deleteToken (sign-out) drops that token and the same user's other tokens", () => {
    const { cache, nowSeconds } = clockedCache();
    const exp = nowSeconds() + 3600;
    cache.set(tokenWithExp(exp, 'a'), user('u1'));
    cache.set(tokenWithExp(exp, 'b'), user('u1'));
    cache.set(tokenWithExp(exp, 'c'), user('u2'));
    expect(cache.deleteToken(tokenWithExp(exp, 'a'))).toBe(2);
    expect(cache.get(tokenWithExp(exp, 'b'))).toBeNull();
    expect(cache.get(tokenWithExp(exp, 'c'))?.id).toBe('u2');
    expect(cache.deleteToken('not-cached')).toBe(0);
  });

  it('is bounded: the oldest entry goes first', () => {
    const { cache, nowSeconds } = clockedCache(3);
    const exp = nowSeconds() + 3600;
    for (const t of ['a', 'b', 'c', 'd']) cache.set(tokenWithExp(exp, t), user(`u-${t}`));
    expect(cache.size).toBe(3);
    expect(cache.get(tokenWithExp(exp, 'a'))).toBeNull();
    expect(cache.get(tokenWithExp(exp, 'd'))?.id).toBe('u-d');
  });

  it('reads exp from a token, and null from garbage', () => {
    expect(jwtExpiryMs(tokenWithExp(123))).toBe(123_000);
    expect(jwtExpiryMs(tokenWithExp(null))).toBeNull();
    expect(jwtExpiryMs('not-a-jwt')).toBeNull();
    expect(jwtExpiryMs('a.%%%.c')).toBeNull();
  });

  it('treats a missing, string or non-finite exp as no exp: only the 60 s ceiling applies', () => {
    const { cache, tick } = clockedCache();
    cache.set(tokenWithExp(null, 'none'), user('u1'));
    cache.set(tokenWithExp('soon', 'str'), user('u2'));
    expect(cache.get(tokenWithExp(null, 'none'))?.id).toBe('u1');
    expect(cache.get(tokenWithExp('soon', 'str'))?.id).toBe('u2');
    tick(60_000);
    expect(cache.get(tokenWithExp(null, 'none'))).toBeNull();
    expect(jwtExpiryMs(tokenWithExp(Number.NaN as unknown as number))).toBeNull();
  });

  it('reads the subject of a token, and null from garbage', () => {
    expect(jwtSubject(tokenWithExp(1, 'a', 'user-9'))).toBe('user-9');
    expect(jwtSubject('nope')).toBeNull();
  });

  it("deleteToken of a token that is NOT cached still drops the same user's other tokens", () => {
    // The password-reset link token is never verified by this API, so it is never cached.
    const { cache, nowSeconds } = clockedCache();
    const exp = nowSeconds() + 3600;
    cache.set(tokenWithExp(exp, 'session-a', 'user-1'), user('user-1'));
    cache.set(tokenWithExp(exp, 'session-b', 'user-2'), user('user-2'));
    const resetToken = tokenWithExp(exp, 'recovery', 'user-1');
    expect(cache.get(resetToken)).toBeNull();

    expect(cache.deleteToken(resetToken)).toBe(1);
    expect(cache.get(tokenWithExp(exp, 'session-a', 'user-1'))).toBeNull();
    expect(cache.get(tokenWithExp(exp, 'session-b', 'user-2'))?.id).toBe('user-2');
  });

  it('refuses a result whose check began before an invalidation of that user', () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600, 'a', 'user-1');
    const checkStartedAt = (cache as any).now();
    tick(5);
    cache.deleteUser('user-1'); // sign-out lands while the check is in flight
    tick(5);
    cache.set(token, user('user-1'), checkStartedAt);
    expect(cache.size).toBe(0);
    expect(cache.get(token)).toBeNull();

    // A check that began after the invalidation is stored.
    tick(5);
    cache.set(token, user('user-1'), (cache as any).now());
    expect(cache.get(token)?.id).toBe('user-1');
  });

  it("an invalidation of one user does not block another user's result", () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const startedAt = (cache as any).now();
    tick(5);
    cache.deleteUser('user-1');
    cache.set(tokenWithExp(nowSeconds() + 3600, 'b', 'user-2'), user('user-2'), startedAt);
    expect(cache.get(tokenWithExp(nowSeconds() + 3600, 'b', 'user-2'))?.id).toBe('user-2');
  });

  it('hands out copies: editing a returned user changes nothing for the next caller', () => {
    const { cache, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600);
    const original = { id: 'u1', user_metadata: { role: 'USER' } } as any;
    cache.set(token, original);
    original.user_metadata.role = 'ADMIN'; // the caller edits its own object after storing
    const first = cache.get(token) as any;
    expect(first.user_metadata.role).toBe('USER');
    first.user_metadata.role = 'ADMIN'; // and one reader edits what it was given
    expect((cache.get(token) as any).user_metadata.role).toBe('USER');
  });

  it('counts the 60 s from when the check started, so a slow answer cannot extend the window', () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600, 'slow', 'user-1');
    const checkStartedAt = (cache as any).now();
    tick(30_000); // Supabase takes 30 s to answer
    cache.set(token, user('user-1'), checkStartedAt);
    tick(29_999);
    expect(cache.get(token)?.id).toBe('user-1'); // 59.999 s after the check began
    tick(1);
    expect(cache.get(token)).toBeNull(); // 60 s after the check began, not 90
  });

  it('does not store an answer that took 60 s or more to arrive', () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600, 'slower', 'user-1');
    const checkStartedAt = (cache as any).now();
    tick(60_000);
    cache.set(token, user('user-1'), checkStartedAt);
    expect(cache.size).toBe(0);
  });

  it('a check that started in the future of the cache clock is not given extra time', () => {
    const { cache, tick, nowSeconds } = clockedCache();
    const token = tokenWithExp(nowSeconds() + 3600, 'skew', 'user-1');
    cache.set(token, user('user-1'), (cache as any).now() + 30_000);
    tick(60_000);
    expect(cache.get(token)).toBeNull();
  });
});
