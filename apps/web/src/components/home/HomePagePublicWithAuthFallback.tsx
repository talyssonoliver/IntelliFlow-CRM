'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { PublicHomePage } from './PublicHomePage';
import { AuthenticatedHomePage } from './AuthenticatedHomePage';

/**
 * Client wrapper used when the server-side cookie check returned `null`
 * (no token). This is the normal case for real visitors — they see the
 * public marketing page.
 *
 * However, a login race can cause the server to return `null` even though
 * the client is actually authenticated (the cookie write hasn't propagated
 * to the server yet). In that case we swap to the authenticated home page
 * once client auth resolves, preventing the "public page shown to logged-in
 * user" flash.
 */
export function HomePagePublicWithAuthFallback() {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) {
    return <AuthenticatedHomePage />;
  }

  return <PublicHomePage />;
}
