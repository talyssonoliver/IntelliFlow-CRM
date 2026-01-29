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

/**
 * Protected routes requiring authentication
 */
const protectedPatterns = [
  '/dashboard',
  '/leads',
  '/contacts',
  '/accounts',
  '/opportunities',
  '/tasks',
  '/analytics',
  '/settings',
  '/admin',
];

/**
 * Check if path matches any pattern
 */
function matchesPattern(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => path === pattern || path.startsWith(`${pattern}/`));
}

/**
 * Next.js 16 Proxy function for authentication
 *
 * Handles:
 * 1. Route protection - redirects unauthenticated users to login
 * 2. Role-based access control - checks user permissions
 * 3. Session validation - verifies JWT with Supabase
 * 4. Redirect loops prevention - avoids infinite redirects
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip static assets and API routes
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api') ||
    path.includes('.') // Static files
  ) {
    return NextResponse.next();
  }

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.includes(path);

  // Check if route is protected
  const isProtectedRoute = matchesPattern(path, protectedPatterns);

  // Get session from cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  const session = await decrypt(sessionCookie);

  // Protected route without session -> redirect to login
  if (isProtectedRoute && !session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access
  if (isProtectedRoute && session) {
    const requiredRoles = PROTECTED_ROUTES[path];
    if (requiredRoles && !hasRole(session, requiredRoles)) {
      // User doesn't have required role -> redirect to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Authenticated user on public auth pages -> redirect to dashboard
  if (
    session &&
    (path === '/login' || path === '/signup') &&
    !request.nextUrl.searchParams.has('redirect')
  ) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Add user info to headers for server components
  const response = NextResponse.next();

  if (session) {
    response.headers.set('x-user-id', session.userId);
    response.headers.set('x-user-email', session.email);
    response.headers.set('x-user-role', session.role);
  }

  return response;
}

/**
 * Proxy configuration
 * Matcher excludes static files, images, and API routes
 */
export const config = {
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
