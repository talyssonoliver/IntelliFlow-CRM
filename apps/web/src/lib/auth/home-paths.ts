/**
 * The home page `/` has two renderings.
 *
 * Signed out, `/` is the Aurora landing page. It is prerendered (`app/(landing)`), so a visit,
 * a crawler or an uptime probe is served from the CDN without running a function.
 *
 * Signed in, the proxy rewrites `/` to {@link SIGNED_IN_HOME_PATH}, which renders the portal home
 * per request (`app/(public)/signed-in-home`). The browser keeps showing `/`.
 *
 * Code that asks "is this the home page?" from a pathname must accept both, because a rewritten
 * request can report either path.
 */
export const SIGNED_IN_HOME_PATH = '/signed-in-home';

export function isHomePath(pathname: string | null | undefined): boolean {
  return pathname === '/' || pathname === SIGNED_IN_HOME_PATH;
}
