'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { isProtectedAppRoute } from '@/lib/auth/route-protection';

/**
 * The 404 route's segment. Measured in the production build (21/11): the root layout sees
 * '_not-found'; Next's internal key is '/_not-found', accepted too in case a version reports it.
 */
const NOT_FOUND_SEGMENTS: ReadonlySet<string> = new Set(['_not-found', '/_not-found']);

export function RouteAccessGate({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? '/';
  // The 404 page holds no protected data and production pre-renders it once under
  // '/_not-found' (unprotected). Gating it by the address bar (/settings/typo) rendered the auth
  // placeholder in the browser instead, a hydration mismatch (React #418). Judge the 404 by the
  // route actually rendered.
  const renderingNotFound = NOT_FOUND_SEGMENTS.has(useSelectedLayoutSegments()[0] ?? '');
  if (renderingNotFound || !isProtectedAppRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<AccessGateFallback />}>
      <ProtectedRouteContent>{children}</ProtectedRouteContent>
    </Suspense>
  );
}

function ProtectedRouteContent({ children }: Readonly<{ children: ReactNode }>) {
  const { isLoading, isAuthenticated } = useRequireAuth();

  if (isLoading || !isAuthenticated) {
    return <AccessGateFallback />;
  }

  return <>{children}</>;
}

function AccessGateFallback() {
  return <div className="min-h-[calc(100vh-4rem)] bg-background" aria-busy="true" />;
}
