'use client';

/**
 * Email Verification Page
 *
 * IMPLEMENTS: PG-023 (Email Verification)
 *
 * Standalone page for email verification, accessed via:
 * - Welcome email verification links
 * - Resent verification emails
 *
 * URL: /auth/verify-email/{token}
 *
 * Features:
 * - Reads token from URL path
 * - Uses AuthBackground for consistent styling
 * - Integrates with EmailVerification component
 * - Handles success/error/expired states
 * - Auto-redirects on success
 */

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { AuthBackground } from '@/components/shared/auth-background';
import { EmailVerification } from '@/components/shared/email-verification';

// ============================================
// Loading Fallback
// ============================================

function EmailVerifyLoading() {
  return (
    <div className="text-center py-12">
      <span
        className="material-symbols-outlined text-5xl text-[#7cc4ff] animate-spin"
        aria-hidden="true"
      >
        progress_activity
      </span>
      <p className="mt-4 text-slate-300">Verifying your email...</p>
    </div>
  );
}

// ============================================
// Main Content
// ============================================

function EmailVerifyContent() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();

  // Get token from URL path
  const token = params.token || '';
  const email = searchParams.get('email') || undefined;
  const redirectUrl = searchParams.get('redirect') || '/dashboard';

  /**
   * Handle successful verification
   */
  const handleVerified = () => {
    // Success callback - could trigger analytics, etc.
    console.log('[EmailVerification] Email verified successfully');
  };

  /**
   * Handle verification error
   */
  const handleError = (error: string) => {
    console.error('[EmailVerification] Error:', error);
  };

  return (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
        {/* Card gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]" />

        <div className="relative p-8 space-y-6">
          {/* Email Verification Component */}
          <EmailVerification
            token={token}
            email={email}
            onVerified={handleVerified}
            onError={handleError}
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
              verified_user
            </span>
            <span>Secure email verification</span>
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
          Link valid for 24 hours
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

export default function EmailVerifyPage() {
  return (
    <AuthBackground>
      <Suspense fallback={<EmailVerifyLoading />}>
        <EmailVerifyContent />
      </Suspense>
    </AuthBackground>
  );
}
