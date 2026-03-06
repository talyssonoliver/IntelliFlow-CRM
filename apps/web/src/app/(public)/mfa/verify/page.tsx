'use client';

/**
 * MFA Verify Page — Standalone public page for MFA code verification
 *
 * IMPLEMENTS: PG-022
 *
 * Entry point for MFA challenges triggered during login, deep-linked
 * from SMS/email, or when a session requires MFA re-verification.
 *
 * Uses the shared MfaVerification component for tRPC integration
 * and the MfaChallenge component for the 6-digit OTP input UI.
 */

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { AuthBackground } from '@/components/shared/auth-background';
import { AuthCard } from '@/components/shared/auth-card';
import { MfaVerification } from '@/components/shared/mfa-verification';
import { isValidRedirectUrl } from '@/lib/shared/logout-redirect';
import { MFA_METHODS, type MfaMethod } from '@intelliflow/domain';
import { MfaVerifyLoading } from './mfa-verify-loading';

// ============================================
// Constants
// ============================================

const DEFAULT_REDIRECT = '/dashboard';
const DEFAULT_METHOD = 'totp';

// ============================================
// Inner Content (uses useSearchParams)
// ============================================

function MfaVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth guard — redirect authenticated users
  useRedirectIfAuthenticated('/dashboard');

  // Extract URL params
  const challengeId = searchParams.get('challenge') || undefined;
  const redirectParam = searchParams.get('redirect');
  const methodParam = searchParams.get('method');
  const email = searchParams.get('email') || undefined;

  // Validate redirect URL — reject external URLs
  const validatedRedirectUrl =
    redirectParam && isValidRedirectUrl(redirectParam) ? redirectParam : DEFAULT_REDIRECT;

  // Validate method against MFA_METHODS enum
  const validatedMethod: MfaMethod =
    methodParam && (MFA_METHODS as readonly string[]).includes(methodParam)
      ? (methodParam as MfaMethod)
      : DEFAULT_METHOD;

  // Handlers
  const handleSuccess = useCallback(() => {
    // Intentional no-op: MfaVerification component handles navigation internally
    // via router.push(redirectUrl) after successful code verification.
  }, []);

  const handleCancel = useCallback(() => {
    router.push('/login');
  }, [router]);

  return (
    <div className="relative z-10 w-full max-w-md mx-auto px-4">
      <AuthCard
        badge="INTELLIFLOW"
        badgeIcon="security"
        title="Two-Factor Authentication"
        description="Enter your verification code to continue"
        securityBadge="Secure 2-factor authentication"
      >
        <MfaVerification
          challengeId={challengeId}
          method={validatedMethod}
          email={email}
          redirectUrl={validatedRedirectUrl}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </AuthCard>

      {/* Post-card security note */}
      <p className="mt-6 text-center text-xs text-slate-500">
        <span className="material-symbols-outlined text-xs align-middle mr-1" aria-hidden="true">
          schedule
        </span>
        Verification codes expire after 5 minutes
      </p>

      {/* Help link — back to sign in */}
      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="text-sm text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            arrow_back
          </span>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

// ============================================
// Page (default export)
// ============================================

export default function MfaVerifyPage() {
  return (
    <AuthBackground>
      <Suspense fallback={<MfaVerifyLoading />}>
        <MfaVerifyContent />
      </Suspense>
    </AuthBackground>
  );
}
