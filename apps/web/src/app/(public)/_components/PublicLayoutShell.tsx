'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AuroraSiteHeader } from '@/components/aurora-site/AuroraSiteHeader';
import '@/components/aurora-site/aurora-site.css';
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
 * Aurora: logged-out visitors get the Aurora header and footer. On `/` the
 * landing page brings its own header and footer, so the shell adds nothing.
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
  footer,
  children,
}: {
  isAuthenticated: boolean;
  /** The public footer, rendered on the server; shown to logged-out visitors. */
  footer?: React.ReactNode;
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

  // The Aurora landing page carries its own header, footer and motion.
  if (pathname === '/' && !effectiveAuthenticated) {
    return <>{children}</>;
  }

  // PG-126: mount tour + feedback FAB only for unauthenticated visitors.
  // Do not mount while auth is still resolving — treat authLoading=true as
  // 'unknown' so the overlay never flashes for authenticated users whose
  // client-side session hasn't finished hydrating yet.
  const shouldMountPublicOverlays = !authLoading && !effectiveAuthenticated;
  const tourIsActiveRoute = pathname === '/features';

  const overlays = (
    <>
      {shouldMountPublicOverlays && <PublicFeedbackFab />}
      {shouldMountPublicOverlays && tourIsActiveRoute && <PublicTour />}
    </>
  );

  const content = showPublicHeader ? (
    <div className="aurora-site">
      <AuroraSiteHeader />
      <main id="aurora-site-main" className="as-main" tabIndex={-1}>
        {children}
      </main>
      {footer}
      {overlays}
    </div>
  ) : (
    <>
      <main className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">{children}</main>
      {overlays}
    </>
  );

  if (shouldMountPublicOverlays && tourIsActiveRoute) {
    return <TourProvider config={FEATURES_TOUR_CONFIG}>{content}</TourProvider>;
  }

  return content;
}
