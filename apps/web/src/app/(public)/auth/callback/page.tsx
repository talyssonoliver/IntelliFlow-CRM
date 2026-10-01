'use client';

/**
 * SSO Callback Page
 *
 * IMPLEMENTS: PG-024 (SSO Callback)
 *
 * Thin wrapper page that renders the OAuthCallback component within
 * the (public) route group. Uses PKCE authorization code exchange
 * via trpc.auth.oauthCallback.
 *
 * Architecture:
 * - Suspense boundary wraps OAuthCallback (required by useSearchParams in App Router)
 * - AuthBackground provides consistent auth page visual shell
 * - useRedirectIfAuthenticated bounces already-authenticated users
 * - onSuccess uses window.location.href for hard navigation (prevents Back button replay)
 * - A `token_hash` param means a partner magic link: the already-authenticated bounce is
 *   skipped (an existing session must not win over the link) and the user lands on `next`
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthBackground } from '@/components/shared/auth-background';
import { OAuthCallback } from '@/components/shared/oauth-callback';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { safeNextPath } from '@/lib/shared/safe-next-path';

// ============================================
// Loading Fallback
// ============================================

function SSOCallbackFallback() {
  return (
    <div
      className="flex items-center justify-center min-h-[400px]"
      aria-live="polite"
      aria-label="Loading authentication"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex justify-center gap-1">
          <div
            className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="text-sm text-slate-400">Preparing authentication...</p>
      </div>
    </div>
  );
}

// ============================================
// Inner Content (uses hooks that need Suspense)
// ============================================

function SSOCallbackContent() {
  // Bounce already-authenticated users to home
  useRedirectIfAuthenticated('/');

  // Hard navigation on success — prevents Back button replaying callback with used PKCE code
  const handleSuccess = () => {
    globalThis.location.href = '/';
  };

  return <OAuthCallback onSuccess={handleSuccess} redirectUrl="/" />;
}

/**
 * Magic-link variant. Deliberately does NOT call useRedirectIfAuthenticated: that hook would
 * redirect a browser that already holds a (different) session before the link is processed.
 */
function MagicLinkCallbackContent({ next }: Readonly<{ next: string }>) {
  const handleSuccess = () => {
    globalThis.location.href = next;
  };

  return <OAuthCallback onSuccess={handleSuccess} redirectUrl={next} />;
}

function CallbackRouter() {
  const searchParams = useSearchParams();
  if (searchParams?.get('token_hash')) {
    return <MagicLinkCallbackContent next={safeNextPath(searchParams.get('next'))} />;
  }
  return <SSOCallbackContent />;
}

// ============================================
// Page Export
// ============================================

export default function SSOCallbackPage() {
  return (
    <AuthBackground>
      <Suspense fallback={<SSOCallbackFallback />}>
        <CallbackRouter />
      </Suspense>
    </AuthBackground>
  );
}
