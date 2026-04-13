'use client';

/**
 * Email Verification Callback Page
 *
 * IMPLEMENTS: IFC-120 (AC-004)
 *
 * Receives token_hash and type from Supabase email verification redirect,
 * calls tRPC verifyEmail to complete the verification.
 *
 * URL: /verify-email/callback?token_hash=...&type=email
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { AuthBackground, AuthCard, EmailVerification } from '@/components/shared';

// ============================================
// Loading Fallback
// ============================================

function VerifyCallbackLoading() {
  return (
    <AuthBackground>
      <AuthCard badge="INTELLIFLOW" badgeIcon="mark_email_read" title="">
        <output
          className="flex flex-col items-center justify-center py-8 space-y-4 block"
        >
          <div
            className="w-8 h-8 border-2 border-slate-600 border-t-[#137fec] rounded-full animate-spin"
            aria-hidden="true"
          />
          <p className="text-sm text-slate-400">Verifying your email...</p>
        </output>
      </AuthCard>
    </AuthBackground>
  );
}

// ============================================
// Inner Content (uses useSearchParams)
// ============================================

function VerifyCallbackContent() {
  useRedirectIfAuthenticated('/dashboard');

  const searchParams = useSearchParams();
  const tokenHash = searchParams.get('token_hash') || '';
  const type = searchParams.get('type') || 'email';

  return (
    <AuthBackground>
      <AuthCard
        badge="INTELLIFLOW"
        badgeIcon="mark_email_read"
        title=""
        securityBadge="256-bit SSL encrypted verification"
      >
        <EmailVerification
          tokenHash={tokenHash}
          type={type as 'email' | 'signup'}
          redirectUrl="/dashboard"
        />
      </AuthCard>
    </AuthBackground>
  );
}

// ============================================
// Page Export
// ============================================

export default function VerifyEmailCallbackPage() {
  return (
    <Suspense fallback={<VerifyCallbackLoading />}>
      <VerifyCallbackContent />
    </Suspense>
  );
}
