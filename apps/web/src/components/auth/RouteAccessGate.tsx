'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { isProtectedAppRoute } from '@/lib/auth/route-protection';

/** Next's segment for the 404 route (next/dist/shared/lib/segment NOT_FOUND_SEGMENT_KEY). */
const NOT_FOUND_SEGMENT = '/_not-found';

export function RouteAccessGate({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? '/';
  // The 404 page holds no protected data and production pre-renders it once under
  // '/_not-found' (unprotected). Gating it by the address bar (/settings/typo) rendered the auth
  // placeholder in the browser instead, a hydration mismatch (React #418). Judge the 404 by the
  // route actually rendered.
  const renderingNotFound = useSelectedLayoutSegments()[0] === NOT_FOUND_SEGMENT;
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
