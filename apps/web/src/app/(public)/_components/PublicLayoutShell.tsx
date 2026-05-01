'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PublicHeader } from '@/components/public/PublicHeader';
import { useAuth } from '@/lib/auth/AuthContext';
import { TourProvider, PublicTour } from '@/components/public/tour-components';
import { PublicFeedbackFab } from '@/components/public/feedback-widget-public';
import { FEATURES_TOUR_CONFIG } from '@/lib/public/tour-config';

/**
 * Thin client shell for the public route group.
 *
 * Handles the path-based rules (auth pages skip header/wrapper) via
 * `usePathname()`. The auth-based decision is seeded from the server
 * (via `isAuthenticated` prop from the cookie at SSR time) to avoid a
 * flash of PublicHeader for authed users on hard navigation, but is
 * ALSO re-evaluated client-side via `useAuth()` so that a race between
 * cookie write and post-login redirect cannot leave the public header
 * visible after hydration.
 *
 * PG-126: Mounts the public product tour (only on /features, where the
 * data-tour anchors live) and the PublicFeedbackFab on every
 * non-auth public route for unauthenticated visitors.
 */

const AUTH_PAGES_NO_CHROME = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/logout',
  '/verify-email',
  '/mfa',
  '/auth/callback',
  '/sso',
];

export function PublicLayoutShell({
  isAuthenticated: serverIsAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isAuthenticated: clientIsAuthenticated, isLoading: authLoading } = useAuth();
  const isAuthPage = AUTH_PAGES_NO_CHROME.some((page) => pathname?.startsWith(page));

  const effectiveAuthenticated = serverIsAuthenticated || (!authLoading && clientIsAuthenticated);
  const showPublicHeader = !isAuthPage && !effectiveAuthenticated;

  if (isAuthPage) {
    return <>{children}</>;
  }

  // PG-126: mount tour + feedback FAB only for unauthenticated visitors.
  const shouldMountPublicOverlays = !effectiveAuthenticated;
  const tourIsActiveRoute = pathname === '/features';

  const content = (
    <>
      {showPublicHeader && <PublicHeader />}
      <main className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">{children}</main>
      {shouldMountPublicOverlays && <PublicFeedbackFab />}
      {shouldMountPublicOverlays && tourIsActiveRoute && <PublicTour />}
    </>
  );

  if (shouldMountPublicOverlays && tourIsActiveRoute) {
    return <TourProvider config={FEATURES_TOUR_CONFIG}>{content}</TourProvider>;
  }

  return content;
}
