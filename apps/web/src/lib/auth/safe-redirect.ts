/**
 * Where to send someone after they sign in.
 *
 * The target comes from the `redirect` query parameter, so it is untrusted. The
 * same-site check is `safeNextPath` (paths on this site only); on top of it, the
 * sign-in pages themselves and over-long values give `null`, and the caller
 * falls back to its default.
 */

import { safeNextPath } from '@/lib/shared/safe-next-path';

const SIGN_IN_PATHS = ['/login', '/signup', '/logout'];
const MAX_LENGTH = 2048;

/** A same-site path with its query and hash, or `null` when the value can't be used. */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || value.length > MAX_LENGTH) return null;
  const path = safeNextPath(value, '');
  if (!path) return null;
  const pathname = path.split(/[?#]/, 1)[0];
  if (SIGN_IN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return path;
}

/** The sign-in page, carrying the current page so sign-in can return to it. */
export function loginPathFor(currentPath: string | null | undefined): string {
  const path = safeRedirectPath(currentPath);
  return path && path !== '/' ? `/login?redirect=${encodeURIComponent(path)}` : '/login';
}

const STORAGE_KEY = 'post_login_redirect';

/**
 * Keep the target across a sign-in that leaves the site (Google sign-in), where
 * the query parameter does not survive the round trip.
 */
export function rememberPostLoginRedirect(value: string | null | undefined): void {
  if (typeof globalThis.window === 'undefined') return;
  const path = safeRedirectPath(value);
  if (path) sessionStorage.setItem(STORAGE_KEY, path);
  else sessionStorage.removeItem(STORAGE_KEY);
}

/** The remembered target, checked again. Clear it once sign-in has used it. */
export function readPostLoginRedirect(): string | null {
  if (typeof globalThis.window === 'undefined') return null;
  return safeRedirectPath(sessionStorage.getItem(STORAGE_KEY));
}

export function clearPostLoginRedirect(): void {
  if (typeof globalThis.window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
