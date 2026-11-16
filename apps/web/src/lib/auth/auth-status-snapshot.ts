/**
 * The last confirmed auth status, kept so a reload can start signed in (MVP-007).
 *
 * Every layout and page query waits for `isAuthenticated`, and the provider only set it once
 * `auth.getStatus` answered: one full API round trip (1.5 s on a cold API, measured 16/11) before
 * any data request could start. When getStatus confirms a user, the provider stores that user here,
 * tied to the access token's subject. On the next load, if the stored access token is still usable
 * and belongs to the same subject, the provider starts from this user at once, so the data queries
 * run alongside getStatus instead of after it. getStatus still answers and has the last word: a
 * different user, a revoked session or an error replaces this state as before.
 *
 * Nothing here is trusted by the server. Every API call is authorised by its own token; this only
 * decides when the browser starts asking.
 */
import { decodeJwtPayload, isTokenUsable } from './jwt';

// v2: entries also record the active workspace (v1 entries are ignored).
export const AUTH_STATUS_CACHE_KEY = 'auth.lastStatus.v2';

export interface CachedAuthStatus<U> {
  /** The access token subject the status was confirmed for. */
  sub: string;
  /**
   * The active workspace it was confirmed in (`x-active-tenant`), or null for the home workspace.
   * getStatus's role is the role in that workspace (ADR-071), so a status from another workspace
   * is never handed back.
   */
  tenant: string | null;
  user: U;
  emailVerified: boolean | null;
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * Stores a status getStatus just confirmed for this token in this workspace. No-op without a usable
 * token or subject.
 */
export function writeCachedAuthStatus<U>(
  token: string | null,
  tenant: string | null,
  user: U,
  emailVerified: boolean | null
): void {
  const store = storage();
  if (!store || !isTokenUsable(token)) return;
  const sub = decodeJwtPayload(token)?.sub;
  if (!sub) return;
  try {
    store.setItem(AUTH_STATUS_CACHE_KEY, JSON.stringify({ sub, tenant, user, emailVerified }));
  } catch {
    /* storage full or blocked: the next load simply waits for getStatus */
  }
}

/**
 * The stored status, only if this token is usable now, belongs to the subject it was confirmed for,
 * and the active workspace is the one it was confirmed in. Anything else (no token, an expired one,
 * another user, another workspace, unreadable data) returns null, and the provider waits for
 * getStatus as before.
 */
export function readCachedAuthStatus<U>(
  token: string | null,
  tenant: string | null
): CachedAuthStatus<U> | null {
  const store = storage();
  if (!store || !isTokenUsable(token)) return null;
  const sub = decodeJwtPayload(token)?.sub;
  if (!sub) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(store.getItem(AUTH_STATUS_CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const entry = parsed as Partial<CachedAuthStatus<U>>;
  if (entry.sub !== sub || !entry.user || typeof entry.user !== 'object') return null;
  if ((entry.tenant ?? null) !== tenant) return null;
  return {
    sub,
    tenant,
    user: entry.user,
    emailVerified: typeof entry.emailVerified === 'boolean' ? entry.emailVerified : null,
  };
}

/**
 * Whether two tokens belong to the same subject. A getStatus answer is only stored when the token
 * the request was sent with and the token stored now are the same user's; otherwise a sign-in as
 * someone else while the request was in flight could pair one user's status with another's token.
 */
export function sameTokenSubject(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const subA = decodeJwtPayload(a)?.sub;
  return Boolean(subA) && subA === decodeJwtPayload(b)?.sub;
}

/** Forgets the stored status (sign-out, or getStatus saying nobody is signed in). */
export function clearCachedAuthStatus(): void {
  try {
    storage()?.removeItem(AUTH_STATUS_CACHE_KEY);
  } catch {
    /* nothing stored, or storage blocked */
  }
}
