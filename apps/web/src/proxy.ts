/**
 * Next.js 16 Proxy for Route Protection
 *
 * In Next.js 16, middleware has been renamed to proxy.
 * This proxy provides lightweight server-side route hints.
 *
 * NOTE: The proxy checks for accessToken cookie. The cookie is synced from
 * localStorage by the client. For users without the cookie, client-side
 * auth (useRequireAuth) handles redirects.
 *
 * IMPLEMENTS: Route protection for authenticated pages
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth pages where authenticated users shouldn't stay
const authPages = ['/login', '/signup'];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const accessToken = request.cookies.get('accessToken')?.value;
  const sessionCookie = request.cookies.get('session')?.value;
  const session = parseSession(sessionCookie);
  const hasValidSession = !!session;

  // Debug: Log all cookies received
  const allCookies = request.cookies.getAll();
  console.log(
    `[Proxy] Path: ${path}, Cookies:`,
    allCookies.map((c) => c.name).join(', ') || 'none'
  );
  console.log(
    `[Proxy] Has accessToken: ${!!accessToken}, hasSession: ${!!sessionCookie}, hasValidSession: ${hasValidSession}`
  );

  // If user has a valid session and is on login/signup, redirect to dashboard
  // But not if they just logged out (has logged_out param)
  if (hasValidSession && !request.nextUrl.searchParams.has('logged_out')) {
    if (authPages.some((page) => path === page || path.startsWith(page + '/'))) {
      console.log(`[Proxy] Authenticated user on auth page, redirecting to dashboard`);
      return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }
  }

  // If we have a stale accessToken but invalid/expired session, clear cookies to avoid redirect loops
  if (accessToken && !hasValidSession) {
    const res = NextResponse.next();
    res.cookies.delete('accessToken');
    res.cookies.delete('session');
    return res;
  }

  // For all other cases, let the request through
  // Client-side auth (useRequireAuth) will handle protected route redirects
  return NextResponse.next();
}

// Routes Proxy should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.svg$).*)'],
};

function parseSession(raw?: string) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { accessToken?: string; expiresAt?: number };
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (Date.now() > parsed.expiresAt * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}
