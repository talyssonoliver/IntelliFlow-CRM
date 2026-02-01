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

  // Get access token from cookie
  const accessToken = request.cookies.get('accessToken')?.value;

  // Debug: Log all cookies received
  const allCookies = request.cookies.getAll();
  console.log(`[Proxy] Path: ${path}, Cookies:`, allCookies.map(c => c.name).join(', ') || 'none');
  console.log(`[Proxy] Has accessToken cookie: ${!!accessToken}`);

  // If user has auth cookie and is on login/signup, redirect to dashboard
  // But not if they just logged out (has logged_out param)
  if (accessToken && !request.nextUrl.searchParams.has('logged_out')) {
    if (authPages.some(page => path === page || path.startsWith(page + '/'))) {
      console.log(`[Proxy] User has auth cookie, redirecting ${path} to dashboard`);
      return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }
  }

  // For all other cases, let the request through
  // Client-side auth (useRequireAuth) will handle protected route redirects
  return NextResponse.next();
}

// Routes Proxy should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.svg$).*)'],
};
