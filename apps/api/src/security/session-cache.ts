/**
 * In-process user-session cache (ADR-071).
 *
 * Two layers share one TTL (60 s) and one eviction path:
 *  - `baseSessionCache`: the HOME session (`users` row), keyed by userId. This is the cache
 *    that existed before ADR-071 and keeps the per-request user lookup off the database.
 *  - `resolvedSessionCache`: the session AFTER active-tenant resolution, keyed by
 *    (userId, requested tenant, session id). The requested tenant is the `x-active-tenant`
 *    header, so two requests for different tenants (or two browser sessions of one user)
 *    never share an entry.
 *
 * Revoking a membership, removing a member, or claiming a login grant calls
 * `invalidateUserSessions(userId)`, which drops every entry of that user on THIS instance.
 * Other instances age out within the TTL, so 60 seconds bounds how long a revoked membership
 * can keep working there. That bound is part of the ADR-071 contract. PINNED (staff) sessions
 * are the sensitive ones, so they are cached for only a few seconds: `removeMember` and the end
 * of a pinned session take effect on every instance within `PINNED_SESSION_CACHE_TTL_MS`.
 */

export const SESSION_CACHE_TTL_MS = 60_000;
/** TTL of a resolved PINNED (staff) session: the revocation bound on instances that did not evict. */
export const PINNED_SESSION_CACHE_TTL_MS = 5_000;

/** How long a resolved session may be served from the cache. */
export function resolvedSessionTtlMs(pinned: boolean): number {
  return pinned ? PINNED_SESSION_CACHE_TTL_MS : SESSION_CACHE_TTL_MS;
}
export const SESSION_CACHE_MAX_ENTRIES = 1_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  userId: string;
}

export class UserSessionCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly keysByUser = new Map<string, Set<string>>();

  constructor(
    private readonly ttlMs: number = SESSION_CACHE_TTL_MS,
    private readonly maxEntries: number = SESSION_CACHE_MAX_ENTRIES
  ) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.remove(key);
      return null;
    }
    return entry.value;
  }

  set(userId: string, key: string, value: T, ttlMs: number = this.ttlMs): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.remove(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs, userId });
    let keys = this.keysByUser.get(userId);
    if (!keys) {
      keys = new Set();
      this.keysByUser.set(userId, keys);
    }
    keys.add(key);
  }

  /** Drop every entry of one user. Returns how many were removed. */
  deleteUser(userId: string): number {
    const keys = this.keysByUser.get(userId);
    if (!keys) return 0;
    const count = keys.size;
    for (const key of keys) this.entries.delete(key);
    this.keysByUser.delete(userId);
    return count;
  }

  clear(): void {
    this.entries.clear();
    this.keysByUser.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry) return;
    const keys = this.keysByUser.get(entry.userId);
    if (!keys) return;
    keys.delete(key);
    if (keys.size === 0) this.keysByUser.delete(entry.userId);
  }
}

// Typed loosely on purpose: the entries are `UserSession` objects owned by context.ts, and
// importing that type here would make partner modules pull the whole context graph.
export const baseSessionCache = new UserSessionCache<unknown>();
export const resolvedSessionCache = new UserSessionCache<unknown>();

/** Cache key for a resolved session: (user, requested tenant header, session id). */
export function resolvedSessionKey(
  userId: string,
  requestedTenantId: string | null,
  sessionId: string | null
): string {
  return `${userId}|${requestedTenantId ?? ''}|${sessionId ?? ''}`;
}

/**
 * Evict every cached session of a user on this instance. Call after a membership is revoked,
 * a role changes, a member is removed, or a login grant is claimed. Best effort across
 * instances (see the file header).
 */
export function invalidateUserSessions(userId: string): number {
  return baseSessionCache.deleteUser(userId) + resolvedSessionCache.deleteUser(userId);
}

/** Test helper. */
export function clearAllSessionCaches(): void {
  baseSessionCache.clear();
  resolvedSessionCache.clear();
}
