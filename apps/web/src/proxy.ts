/**
 * Next.js 16 proxy (the renamed middleware), run on every page request.
 *
 * It lives in `src/` beside `src/app`, and exports `config`, so Next.js builds
 * it; at `apps/web/proxy.ts` with a `proxyConfig` export it was never run.
 *
 * It does three things:
 * 1. A signed-out visit to an app page goes to `/login?redirect=<path>`, so the
 *    page is not rendered first and the visitor comes back to it after signing
 *    in. "Signed in" here means a usable `accessToken` cookie; it is a redirect
 *    hint, not access control. The API checks every call, and roles come from
 *    the database there.
 * 2. Every response carries the report-only Content Security Policy from
 *    `lib/security/csp`.
 * 3. A request id is kept or created and passed on (ADR-053).
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isTokenUsable } from '@/lib/auth/jwt';
import { matchesRoutePrefix, PROTECTED_ROUTE_PREFIXES } from '@/lib/auth/route-protection';
import { buildReportOnlyCsp, cspEnvFromProcess } from '@/lib/security/csp';

export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';

// The environment is fixed for the life of the process, so the policy is built once.
let cachedCsp: string | undefined;
function reportOnlyCsp(): string {
  cachedCsp ??= buildReportOnlyCsp(cspEnvFromProcess());
  return cachedCsp;
}

/** Test-only: rebuild the policy after changing the environment. */
export function __resetCspCacheForTest(): void {
  cachedCsp = undefined;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const accessToken = request.cookies.get('accessToken')?.value ?? null;
  const signedIn = isTokenUsable(accessToken);
  const staleToken = accessToken !== null && !signedIn;

  let response: NextResponse;
  if (!signedIn && matchesRoutePrefix(pathname, PROTECTED_ROUTE_PREFIXES)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    response = NextResponse.redirect(loginUrl);
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // An expired token cookie only causes redirects and stale reads; drop it.
  if (staleToken) response.cookies.delete('accessToken');
  response.headers.set('x-request-id', requestId);
  response.headers.set(CSP_REPORT_ONLY_HEADER, reportOnlyCsp());
  return response;
}

/**
 * Every path except API routes, Next.js assets and static files.
 */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
