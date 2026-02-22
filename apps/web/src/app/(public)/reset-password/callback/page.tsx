'use client';

/**
 * Reset Password Callback Page
 *
 * IMPLEMENTS: IFC-120 (AC-002)
 *
 * Receives the access_token from Supabase password reset redirect,
 * passes it to ResetPasswordClient for the actual password change.
 *
 * URL: /reset-password/callback?access_token=...&type=recovery
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { AuthBackground, AuthCard } from '@/components/shared';
import { PasswordResetForm, ResetSuccess } from '@/components/shared/password-reset';
import { useState, useCallback, useEffect } from 'react';


// ============================================
// Loading Fallback
// ============================================

function ResetCallbackLoading() {
  return (
    <AuthBackground>
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <AuthCard badge="INTELLIFLOW" badgeIcon="lock_reset" title="Validating...">
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-[#137fec] rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Verifying reset link...</p>
          </div>
        </AuthCard>
      </div>
    </AuthBackground>
  );
}

// ============================================
// Inner Content (uses useSearchParams)
// ============================================

function ResetCallbackContent() {
  useRedirectIfAuthenticated('/dashboard');

  const searchParams = useSearchParams();
  const accessToken = searchParams.get('access_token');
  const [state, setState] = useState<'form' | 'success' | 'invalid'>(() =>
    accessToken ? 'form' : 'invalid'
  );

  // Clear tokens from URL for security (R-002 mitigation)
  useEffect(() => {
    if (accessToken && typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/reset-password/callback');
    }
  }, [accessToken]);

  const handleSuccess = useCallback(() => {
    setState('success');
  }, []);

  if (state === 'invalid') {
    return (
      <AuthBackground>
        <div className="relative z-10 w-full max-w-md mx-auto px-4">
          <AuthCard
            badge="INTELLIFLOW"
            badgeIcon="lock_reset"
            title="Invalid Reset Link"
            footer={
              <p className="text-center text-sm text-slate-400">
                Remember your password?{' '}
                <Link
                  href="/login"
                  className="text-[#137fec] hover:text-[#137fec]/80 font-medium transition-colors"
                >
                  Back to sign in
                </Link>
              </p>
            }
          >
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-3xl text-red-400" aria-hidden="true">
                  error
                </span>
              </div>
              <p className="text-slate-300 text-sm">
                This password reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-medium hover:bg-[#137fec]/90 transition-colors"
              >
                Request a new link
              </Link>
            </div>
          </AuthCard>
        </div>
      </AuthBackground>
    );
  }

  if (state === 'success') {
    return (
      <AuthBackground>
        <div className="relative z-10 w-full max-w-md mx-auto px-4">
          <AuthCard badge="INTELLIFLOW" badgeIcon="lock_reset" title="Password Reset">
            <ResetSuccess />
          </AuthCard>
        </div>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground>
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <AuthCard
          badge="INTELLIFLOW"
          badgeIcon="lock_reset"
          title="Create new password"
          description="Your new password must be different from previously used passwords."
          footer={
            <p className="text-center text-sm text-slate-400">
              Remember your password?{' '}
              <Link
                href="/login"
                className="text-[#137fec] hover:text-[#137fec]/80 font-medium transition-colors"
              >
                Back to sign in
              </Link>
            </p>
          }
        >
          <PasswordResetForm
            token={accessToken!}
            onSuccess={handleSuccess}
          />
        </AuthCard>

        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            <span
              className="material-symbols-outlined text-sm align-middle mr-1"
              aria-hidden="true"
            >
              security
            </span>
            This link can only be used once and expires in 1 hour.
          </p>
        </div>
      </div>
    </AuthBackground>
  );
}

// ============================================
// Page Export
// ============================================

export default function ResetPasswordCallbackPage() {
  return (
    <Suspense fallback={<ResetCallbackLoading />}>
      <ResetCallbackContent />
    </Suspense>
  );
}
