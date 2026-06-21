'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth/AuthContext';
import { PublicHomePage } from './PublicHomePage';

// Load the authenticated home (PinnedItemsSheet, ActivityFeed, @tanstack/react-virtual,
// InsightCard…) ONLY on the client when the login-race fallback actually fires.
// A static import here forced that entire heavy subtree into the public homepage's
// compile graph for every logged-out visitor (a PERF-05 static-import-defeats-lazy
// trap). It's a transient post-login fallback, so ssr:false is correct.
const AuthenticatedHomePage = dynamic(
  () => import('./AuthenticatedHomePage').then((m) => ({ default: m.AuthenticatedHomePage })),
  { ssr: false }
);

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
