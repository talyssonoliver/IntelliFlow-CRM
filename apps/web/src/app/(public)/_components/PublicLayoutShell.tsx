'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AuroraSiteHeader } from '@/components/aurora-site/AuroraSiteHeader';
import '@/components/aurora-site/aurora-site.css';
import { useAuth } from '@/lib/auth/AuthContext';
import { TourProvider, PublicTour } from '@/components/public/tour-components';
import { PublicFeedbackFab } from '@/components/public/feedback-widget-public';
import { FEATURES_TOUR_CONFIG } from '@/lib/public/tour-config';
import { FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH } from '@/lib/auth/auth-paths';
import { isHomePath } from '@/lib/auth/home-paths';

/**
 * Thin client shell for the public route group.
 *
 * Handles the path-based rules (auth pages skip header/wrapper) via
 * `usePathname()`. The auth-based decision is made client-side via
 * `useAuth()`. The signed-in home also seeds it from the cookie on the server
 * (`isAuthenticated`). Public pages are prerendered and pass `false`;
 * `data-auth-pending` lets CSS hide their chrome from a signed-in visitor
 * until the session resolves (lib/auth/session-hint).
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
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  '/logout',
  '/verify-email',
  '/mfa',
  '/auth/callback',
  '/sso',
  // PG-203: the public booking page is a firm's own page — no Aurora marketing chrome or feedback FAB.
  '/book/',
  // PG-203 DSAR: a firm's data request pages, same reason.
  '/dsar/',
];

const APP_MAIN_CLASS = 'min-h-screen bg-[#f6f7f8] dark:bg-[#101922]';

/**
 * One element tree for both states. A prerendered page starts signed-out and may
 * resolve to signed-in; different ancestors would remount the page and clear
 * whatever the visitor had typed. Signed in, the app shell replaces the public
 * header and footer, but every public page's styles are scoped under .aurora-site,
 * so the inner element keeps that scope.
 */
function PublicPageFrame({
  publicChrome,
  authPending,
  footer,
  overlays,
  children,
}: Readonly<{
  publicChrome: boolean;
  authPending: boolean;
  footer?: React.ReactNode;
  overlays: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <div
      className={publicChrome ? 'aurora-site' : 'contents'}
      data-auth-pending={publicChrome && authPending ? '' : undefined}
    >
      {publicChrome && <AuroraSiteHeader />}
      <main
        id={publicChrome ? 'aurora-site-main' : undefined}
        className={publicChrome ? 'as-main' : APP_MAIN_CLASS}
        tabIndex={publicChrome ? -1 : undefined}
      >
        <div
          className={publicChrome ? 'contents' : 'aurora-site as-in-app'}
          data-testid={publicChrome ? undefined : 'public-page-scope'}
        >
          {children}
        </div>
      </main>
      {publicChrome && footer}
      {overlays}
    </div>
  );
}

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
  if (isHomePath(pathname) && !effectiveAuthenticated) {
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

  // `/` signed in is the app itself: no site chrome and no .aurora-site scope.
  // Signed out it returned above, so reaching here on the home path means signed in.
  const content = isHomePath(pathname) ? (
    <>
      <main className={APP_MAIN_CLASS}>{children}</main>
      {overlays}
    </>
  ) : (
    <PublicPageFrame
      publicChrome={showPublicHeader}
      authPending={authLoading}
      footer={footer}
      overlays={overlays}
    >
      {children}
    </PublicPageFrame>
  );

  if (shouldMountPublicOverlays && tourIsActiveRoute) {
    return <TourProvider config={FEATURES_TOUR_CONFIG}>{content}</TourProvider>;
  }

  return content;
}
