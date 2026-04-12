'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PublicHeader } from '@/components/public/PublicHeader';
import { useAuth } from '@/lib/auth/AuthContext';

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

  // Merge server + client auth: if the server saw a token, trust it. Otherwise,
  // trust the client once it has resolved (i.e. no longer loading). This
  // corrects the post-login race where the cookie was written just before the
  // redirect and the server's `cookies()` read missed it.
  const effectiveAuthenticated =
    serverIsAuthenticated || (!authLoading && clientIsAuthenticated);

  const showPublicHeader = !isAuthPage && !effectiveAuthenticated;

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      {showPublicHeader && <PublicHeader />}
      <main className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">{children}</main>
    </>
  );
}
