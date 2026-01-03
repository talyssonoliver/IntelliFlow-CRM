'use client';

/**
 * Standalone MFA Verification Page
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * Standalone page for MFA verification, typically accessed via:
 * - Email verification links
 * - SMS verification links
 * - Direct navigation after login challenge
 *
 * URL: /auth/mfa/verify?challenge={id}&redirect={url}
 *
 * Features:
 * - Reads challenge ID and redirect URL from query params
 * - Uses AuthBackground for consistent styling
 * - Integrates with MfaVerification component
 * - Handles success/error/expired states
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { AuthBackground } from '@/components/shared/auth-background';
import { MfaVerification } from '@/components/shared/mfa-verification';

// ============================================
// Loading Fallback
// ============================================

function MfaVerifyLoading() {
  return (
    <div className="text-center py-12">
      <span
        className="material-symbols-outlined text-5xl text-[#7cc4ff] animate-spin"
        aria-hidden="true"
      >
        progress_activity
      </span>
      <p className="mt-4 text-slate-300">Loading verification...</p>
    </div>
  );
}

// ============================================
// Main Content (wrapped in Suspense for useSearchParams)
// ============================================

function MfaVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get params from URL
  const challengeId = searchParams.get('challenge');
  const redirectUrl = searchParams.get('redirect') || '/dashboard';
  const method = (searchParams.get('method') || 'totp') as 'totp' | 'sms' | 'email' | 'backup';
  const email = searchParams.get('email') || undefined;

  /**
   * Handle successful verification
   */
  const handleSuccess = () => {
    // Redirect will be handled by MfaVerification component
    // This callback is for any additional logic
  };

  /**
   * Handle cancel/back
   */
  const handleCancel = () => {
    router.push('/login');
  };

  return (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
        {/* Card gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]" />

        <div className="relative p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#137fec]/20 mb-4">
              <span
                className="material-symbols-outlined text-3xl text-[#7cc4ff]"
                aria-hidden="true"
              >
                verified_user
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">Verify Your Identity</h1>
            <p className="mt-2 text-sm text-slate-300">
              Enter your verification code to continue
            </p>
          </div>

          {/* MFA Verification Component */}
          <MfaVerification
            challengeId={challengeId || undefined}
            email={email}
            method={method}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            redirectUrl={redirectUrl}
          />
        </div>

        {/* Security footer */}
        <div className="bg-white/[0.03] border-t border-white/10 px-8 py-4">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <span
              className="material-symbols-outlined text-base text-[#7cc4ff]"
              aria-hidden="true"
            >
              lock
            </span>
            <span>Secure 2-factor authentication</span>
          </div>
        </div>
      </Card>

      {/* Trust indicators */}
      <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <span
            className="material-symbols-outlined text-sm text-[#7cc4ff]"
            aria-hidden="true"
          >
            schedule
          </span>
          Expires in 5 min
        </div>
        <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
        <div className="flex items-center gap-1">
          <span
            className="material-symbols-outlined text-sm text-[#7cc4ff]"
            aria-hidden="true"
          >
            shield
          </span>
          Protected
        </div>
      </div>
    </div>
  );
}

// ============================================
// Page Component
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
