'use client';

/**
 * Reset Password Page
 *
 * Allows users to set a new password using a valid reset token.
 *
 * IMPLEMENTS: PG-020 (Reset Password page)
 *
 * Features:
 * - Token validation on page load
 * - Password strength indicator
 * - Confirm password validation
 * - Success state with auto-redirect
 * - Invalid/expired token handling
 * - Accessibility support
 */

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { AuthBackground, AuthCard } from '@/components/shared';
import {
  PasswordResetForm,
  ResetSuccess,
  TokenInvalid,
} from '@/components/shared/password-reset';
import { validateResetToken } from '@/lib/shared/reset-token';

// ============================================
// Types
// ============================================

type PageState =
  | 'validating'
  | 'invalid'
  | 'expired'
  | 'used'
  | 'form'
  | 'success';

interface PageParams {
  params: Promise<{ token: string }>;
}

// ============================================
// Component
// ============================================

export default function ResetPasswordPage({ params }: PageParams) {
  // Redirect if already authenticated
  useRedirectIfAuthenticated('/dashboard');

  // Page state
  const [state, setState] = useState<PageState>('validating');
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null);
  const [token, setToken] = useState<string>('');

  // Unwrap params using React.use()
  const resolvedParams = use(params);

  // Validate token on mount
  useEffect(() => {
    const tokenValue = resolvedParams.token;
    setToken(tokenValue);

    if (!tokenValue || tokenValue.length < 32) {
      setState('invalid');
      return;
    }

    const result = validateResetToken(tokenValue);

    if (!result.ok) {
      switch (result.error.code) {
        case 'EXPIRED':
          setState('expired');
          break;
        case 'ALREADY_USED':
          setState('used');
          break;
        default:
          setState('invalid');
      }
      return;
    }

    // Token is valid
    setTokenEmail(result.value.email);
    setTokenExpiresAt(result.value.expiresAt);
    setState('form');
  }, [resolvedParams.token]);

  // Handle successful password reset
  const handleSuccess = useCallback(() => {
    setState('success');
  }, []);

  // Get page title based on state
  const getPageTitle = () => {
    switch (state) {
      case 'validating':
        return 'Validating...';
      case 'invalid':
      case 'expired':
      case 'used':
        return 'Reset Link Problem';
      case 'form':
        return 'Create new password';
      case 'success':
        return 'Password Reset';
      default:
        return 'Reset Password';
    }
  };

  // Get page description based on state
  const getPageDescription = () => {
    switch (state) {
      case 'validating':
        return 'Please wait while we verify your reset link.';
      case 'form':
        return 'Your new password must be different from previously used passwords.';
      default:
        return undefined;
    }
  };

  return (
    <AuthBackground>
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <AuthCard
          badge="INTELLIFLOW"
          badgeIcon="lock_reset"
          title={getPageTitle()}
          description={getPageDescription()}
          footer={
            state !== 'success' ? (
              <p className="text-center text-sm text-slate-400">
                Remember your password?{' '}
                <Link
                  href="/login"
                  className="text-[#137fec] hover:text-[#137fec]/80 font-medium transition-colors"
                >
                  Back to sign in
                </Link>
              </p>
            ) : undefined
          }
        >
          {/* Validating State */}
          {state === 'validating' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="w-8 h-8 border-2 border-slate-600 border-t-[#137fec] rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Verifying reset link...</p>
            </div>
          )}

          {/* Invalid/Expired/Used States */}
          {(state === 'invalid' || state === 'expired' || state === 'used') && (
            <TokenInvalid
              reason={state as 'invalid' | 'expired' | 'used'}
            />
          )}

          {/* Form State */}
          {state === 'form' && tokenEmail && tokenExpiresAt && (
            <PasswordResetForm
              token={token}
              email={tokenEmail}
              expiresAt={tokenExpiresAt}
              onSuccess={handleSuccess}
            />
          )}

          {/* Success State */}
          {state === 'success' && <ResetSuccess />}
        </AuthCard>

        {/* Security Note */}
        {state === 'form' && (
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
        )}

        {/* Help Link */}
        <div className="mt-4 text-center">
          <Link
            href="/support"
            className={cn(
              'text-sm text-slate-400 hover:text-white transition-colors',
              'inline-flex items-center gap-1'
            )}
          >
            <span
              className="material-symbols-outlined text-sm"
              aria-hidden="true"
            >
              help
            </span>
            Need help?
          </Link>
        </div>
      </div>
    </AuthBackground>
  );
}
