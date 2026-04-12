'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { isProtectedAppRoute } from '@/lib/auth/route-protection';

export function RouteAccessGate({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? '/';
  if (!isProtectedAppRoute(pathname)) {
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
