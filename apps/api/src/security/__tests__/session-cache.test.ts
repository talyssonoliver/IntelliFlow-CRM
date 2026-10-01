/**
 * Session cache keyed by (user, requested tenant, session) with per-user eviction (ADR-071).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UserSessionCache,
  baseSessionCache,
  clearAllSessionCaches,
  invalidateUserSessions,
  resolvedSessionCache,
  resolvedSessionKey,
} from '../session-cache';

afterEach(() => {
  vi.useRealTimers();
  clearAllSessionCaches();
});

describe('resolvedSessionKey', () => {
  it('separates users, requested tenants and browser sessions', () => {
    const keys = new Set([
      resolvedSessionKey('u1', null, 's1'),
      resolvedSessionKey('u1', 'tenant-a', 's1'),
      resolvedSessionKey('u1', 'tenant-b', 's1'),
      resolvedSessionKey('u1', 'tenant-a', 's2'),
      resolvedSessionKey('u2', 'tenant-a', 's1'),
      resolvedSessionKey('u1', null, null),
    ]);
    expect(keys.size).toBe(6);
  });
});

describe('UserSessionCache', () => {
  it('returns what was set until the TTL passes', () => {
    vi.useFakeTimers();
    const cache = new UserSessionCache<string>(1000, 10);
    cache.set('u1', 'k', 'v');
    expect(cache.get('k')).toBe('v');
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('evicts every entry of one user and leaves the others', () => {
    const cache = new UserSessionCache<string>(1000, 10);
    cache.set('u1', 'u1|a', 'x');
    cache.set('u1', 'u1|b', 'y');
    cache.set('u2', 'u2|a', 'z');
    expect(cache.deleteUser('u1')).toBe(2);
    expect(cache.get('u1|a')).toBeNull();
    expect(cache.get('u1|b')).toBeNull();
    expect(cache.get('u2|a')).toBe('z');
    expect(cache.deleteUser('u1')).toBe(0);
  });

  it('drops the oldest entry at the size limit and keeps the per-user index consistent', () => {
    const cache = new UserSessionCache<string>(1000, 2);
    cache.set('u1', 'k1', 'a');
    cache.set('u2', 'k2', 'b');
    cache.set('u3', 'k3', 'c');
    expect(cache.get('k1')).toBeNull();
    expect(cache.size).toBe(2);
    // The evicted user has nothing left to delete.
    expect(cache.deleteUser('u1')).toBe(0);
    expect(cache.deleteUser('u2')).toBe(1);
  });
});

describe('invalidateUserSessions (membership revoke / claim)', () => {
  it('clears the home and every resolved entry of the user, on this instance', () => {
    baseSessionCache.set('u1', 'u1', { tenantId: 'home' });
    resolvedSessionCache.set('u1', resolvedSessionKey('u1', 'tenant-a', 's1'), { tenantId: 'a' });
    resolvedSessionCache.set('u1', resolvedSessionKey('u1', null, 's1'), { tenantId: 'home' });
    resolvedSessionCache.set('u2', resolvedSessionKey('u2', 'tenant-a', 's9'), { tenantId: 'a' });

    expect(invalidateUserSessions('u1')).toBe(3);

    expect(baseSessionCache.get('u1')).toBeNull();
    expect(resolvedSessionCache.get(resolvedSessionKey('u1', 'tenant-a', 's1'))).toBeNull();
    expect(resolvedSessionCache.get(resolvedSessionKey('u1', null, 's1'))).toBeNull();
    // Another user's session is untouched.
    expect(resolvedSessionCache.get(resolvedSessionKey('u2', 'tenant-a', 's9'))).toEqual({
      tenantId: 'a',
    });
  });
});
