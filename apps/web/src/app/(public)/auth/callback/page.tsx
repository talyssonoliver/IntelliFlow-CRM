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
 */

import { Suspense } from 'react';
import { AuthBackground } from '@/components/shared/auth-background';
import { OAuthCallback } from '@/components/shared/oauth-callback';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';

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
  // Bounce already-authenticated users to dashboard
  useRedirectIfAuthenticated('/dashboard');

  // Hard navigation on success — prevents Back button replaying callback with used PKCE code
  const handleSuccess = () => {
    globalThis.location.href = '/dashboard';
  };

  return <OAuthCallback onSuccess={handleSuccess} redirectUrl="/dashboard" />;
}

// ============================================
// Page Export
// ============================================

export default function SSOCallbackPage() {
  return (
    <AuthBackground>
      <Suspense fallback={<SSOCallbackFallback />}>
        <SSOCallbackContent />
      </Suspense>
    </AuthBackground>
  );
}
