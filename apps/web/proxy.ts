/**
 * Next.js 16 Proxy for Authentication
 *
 * Implements route protection following FLOW-001 (Login + MFA) specifications
 * Uses Supabase Auth for session management
 *
 * Next.js 16 Migration:
 * - Renamed from middleware.ts to proxy.ts
 * - Exported function renamed from middleware() to proxy()
 * - Runs in Node.js runtime (not Edge)
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 * @module apps/web/proxy
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decrypt, PUBLIC_ROUTES, PROTECTED_ROUTES, hasRole } from '@/lib/session';
import { isTokenUsable } from '@/lib/auth/jwt';
import { PROTECTED_ROUTE_PREFIXES, matchesRoutePrefix } from './src/lib/auth/route-protection';

/**
 * Build the per-request CSP. `'strict-dynamic'` lets the nonce-trusted
 * Next.js runtime chunks load further scripts; `'nonce-…'` allows the
 * inline RSC flight payload (`self.__next_f.push(…)`), the streaming
 * runtime helpers (`$RC`, `$RT`, `$RB`, `$RV`), and the Suspense boundary
 * swap scripts that React emits during streaming SSR — none of which can
 * execute under a strict `script-src 'self'`.
 *
 * `connect-src` includes the Railway public domain so client-side tRPC
 * HTTP fetches and the WebSocket subscription channel can reach the
 * deployed API. Tighten to specific hostnames if you want to pin.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://*.up.railway.app wss://*.up.railway.app",
    "frame-src 'self' https://js.stripe.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function applyCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * Protected routes requiring authentication
 */
/**
 * Next.js 16 Proxy function for authentication
 *
 * Handles:
 * 1. Route protection - redirects unauthenticated users to login
 * 2. Role-based access control - checks user permissions
 * 3. Session validation - verifies JWT with Supabase
 * 4. Redirect loops prevention - avoids infinite redirects
 *
 * NOTE: This proxy checks for accessToken cookie (set by OAuth callback).
 * The client-side auth (useRequireAuth hook) handles the actual validation.
 * This proxy provides a lightweight server-side redirect hint only.
 */
async function handleAuthPageRoute(
  hasValidSession: boolean,
  hasStaleAccessToken: boolean,
  hasStaleSession: boolean,
  request: NextRequest
): Promise<NextResponse | null> {
  if (hasValidSession && !request.nextUrl.searchParams.has('logged_out')) {
    console.log('[Proxy] Authenticated user on auth page, redirecting to home');
    return clearStaleAuthCookies(
      NextResponse.redirect(new URL('/', request.url)),
      hasStaleAccessToken,
      hasStaleSession
    );
  }
  if (hasStaleAccessToken || hasStaleSession) {
    console.log('[Proxy] Stale access token without session on auth page, clearing cookies');
    return clearStaleAuthCookies(NextResponse.next(), hasStaleAccessToken, hasStaleSession);
  }
  return null;
}

function clearStaleAuthCookies(
  response: NextResponse,
  hasStaleAccessToken: boolean,
  hasStaleSession: boolean
): NextResponse {
  if (hasStaleAccessToken) response.cookies.delete('accessToken');
  if (hasStaleSession) response.cookies.delete('session');
  return response;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip static assets and API routes (matcher also excludes these; kept as
  // a defensive guard). No CSP needed — those responses don't render HTML.
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api') ||
    path.includes('.') // Static files
  ) {
    return NextResponse.next();
  }

  // Per-request CSP nonce. `crypto.randomUUID()` is a Node-runtime global
  // (proxy.ts runs in Node, not Edge). Next.js reads the nonce from the
  // `x-nonce` request header and stamps it onto every inline <script> it
  // emits during streaming SSR.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.includes(path);

  // Check if route is protected
  const isProtectedRoute = matchesRoutePrefix(path, PROTECTED_ROUTE_PREFIXES);

  // Get accessToken from cookie (set by OAuth callback via syncTokenToCookie)
  // This is a lightweight check - full validation happens client-side
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value;

  // Also try to get full session if available
  const sessionCookie = cookieStore.get('session')?.value;
  const session = sessionCookie ? await decrypt(sessionCookie) : null;

  const hasValidSession = !!session;
  const hasUsableAccessToken = isTokenUsable(accessToken ?? null);
  const hasStaleAccessToken = Boolean(accessToken && !hasUsableAccessToken);
  const hasStaleSession = Boolean(sessionCookie && !hasValidSession);
  const hasAnyAuthArtifact = hasUsableAccessToken || hasValidSession;

  console.log(
    `[Proxy] Path: ${path}, hasAccessToken: ${hasUsableAccessToken}, hasSession: ${!!session}, hasValidSession: ${hasValidSession}`
  );

  // Protected route without auth -> redirect to login immediately
  // This eliminates the 200-800ms content flash that occurred when deferring to client-side useRequireAuth
  if (isProtectedRoute && !hasAnyAuthArtifact) {
    console.log(`[Proxy] Protected route without auth, redirecting to login: ${path}`);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return applyCsp(
      clearStaleAuthCookies(NextResponse.redirect(loginUrl), hasStaleAccessToken, hasStaleSession),
      csp
    );
  }

  // Check role-based access (only if we have a full session)
  if (isProtectedRoute && session) {
    const requiredRoles = PROTECTED_ROUTES[path];
    if (requiredRoles && !hasRole(session, requiredRoles)) {
      // User doesn't have required role -> redirect to home
      return applyCsp(NextResponse.redirect(new URL('/', request.url)), csp);
    }
  }

  // Authenticated user on auth pages (login/signup) -> redirect to home
  // Only if we have a valid session; stale tokens should not redirect
  // If token exists but session is missing/invalid, clear cookies to break loops
  if (path === '/login' || path === '/signup') {
    const authPageResult = await handleAuthPageRoute(
      hasValidSession,
      hasStaleAccessToken,
      hasStaleSession,
      request
    );
    if (authPageResult) return applyCsp(authPageResult, csp);
  }

  // Forward the nonce to the downstream render so Next.js can stamp it
  // onto every inline <script> it emits during streaming SSR.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // Add user info to headers for server components (if session available)
  const response = clearStaleAuthCookies(
    NextResponse.next({ request: { headers: requestHeaders } }),
    hasStaleAccessToken,
    hasStaleSession
  );

  if (session) {
    response.headers.set('x-user-id', session.userId);
    response.headers.set('x-user-email', session.email);
    response.headers.set('x-user-role', session.role);
  }

  return applyCsp(response, csp);
}

/**
 * Proxy configuration
 * Matcher excludes static files, images, and API routes
 */
export const proxyConfig = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Public assets (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
