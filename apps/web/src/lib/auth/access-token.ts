/**
 * The access token the tRPC client sends (app/providers.tsx). Kept out of providers.tsx so
 * it can be tested: providers' tests used to assert private copies of these functions (#1216).
 */
import { clearTokenCookie } from '@/lib/shared/session-cleanup';
import { isTokenUsable } from './jwt';

/** Tokens expiring within this window are treated as expired. */
export const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 30_000;

/**
 * True when `token` is a JWT that does not expire within the buffer. A token that is
 * present but expired, expiring or malformed is cleared from storage and from the cookie.
 */
export function isStoredTokenValid(token: string | null): boolean {
  if (!token) return false;
  if (isTokenUsable(token, ACCESS_TOKEN_EXPIRY_BUFFER_MS)) return true;

  console.log('[Auth] Token expired, expiring soon or malformed, clearing...');
  localStorage.removeItem('accessToken');
  clearTokenCookie();
  return false;
}

/** The stored access token when it is still valid, otherwise null (and it is cleared). */
export function getValidAccessToken(): string | null {
  if (typeof globalThis.window === 'undefined') return null;

  const token = localStorage.getItem('accessToken');
  return isStoredTokenValid(token) ? token : null;
}
