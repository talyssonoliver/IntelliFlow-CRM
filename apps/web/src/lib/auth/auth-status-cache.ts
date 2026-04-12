/**
 * Client-side auth-status cache
 *
 * Stores the last resolved auth status keyed by the access token's JWT subject
 * (sub claim), decoded client-side WITHOUT signature verification.  The cache
 * is write-once-per-token: once a status is stored for a given `sub`, it is
 * returned immediately on the next call rather than re-invoking the tRPC
 * endpoint.
 *
 * Invalidation is explicit (clearAuthStatusCache) and is called by AuthContext
 * on logout and token rotation so stale entries are never served.
 *
 * This is purely a performance helper — the server still verifies the token on
 * every network call. The cache only prevents redundant network calls within
 * the same browser session when the React Query staleTime has not been set.
 *
 * Note: `staleTime: Infinity` is already set on the statusQuery, so this
 * module is not on the critical path for normal operation. It exists to
 * provide an explicit API for future use (e.g. optimistic pre-population from
 * SSR-provided initial data) and as documentation of the caching strategy.
 */

export interface CachedAuthStatus {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    avatar?: string | null;
  };
  expiresAt?: Date;
  cachedAt: number;
}

// TTL matches the server-side USER_SESSION_CACHE TTL (60 s)
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, CachedAuthStatus>();

/**
 * Decode the JWT subject (sub claim) from a raw token string without
 * verifying the signature. Returns null if the token is malformed.
 */
function getTokenSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Retrieve a cached auth status for the given access token.
 * Returns null on cache miss or if the entry has expired.
 */
export function getCachedAuthStatus(accessToken: string): CachedAuthStatus | null {
  const sub = getTokenSub(accessToken);
  if (!sub) return null;

  const entry = cache.get(sub);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(sub);
    return null;
  }

  return entry;
}

/**
 * Store an auth status result keyed by the token's sub claim.
 * No-ops if the token cannot be decoded.
 */
export function setCachedAuthStatus(accessToken: string, status: Omit<CachedAuthStatus, 'cachedAt'>): void {
  const sub = getTokenSub(accessToken);
  if (!sub) return;
  cache.set(sub, { ...status, cachedAt: Date.now() });
}

/**
 * Remove all cached entries — call on logout or token rotation.
 */
export function clearAuthStatusCache(): void {
  cache.clear();
}
