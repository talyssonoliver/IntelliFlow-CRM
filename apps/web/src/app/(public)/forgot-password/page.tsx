'use client';

/**
 * Forgot Password Page
 *
 * Allows users to request a password reset link.
 *
 * IMPLEMENTS: PG-019 (Forgot Password page)
 *
 * Features:
 * - Email input with validation
 * - Rate limiting protection
 * - Success confirmation with resend
 * - Accessibility support
 * - Link back to login
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { AuthBackground, AuthCard } from '@/components/shared';
import { ForgotPasswordForm, ResetEmailSent } from '@/components/shared/reset-email';
import { trpc } from '@/lib/trpc';

// ============================================
// Types
// ============================================

type PageState = 'form' | 'sent';

// ============================================
// Constants
// ============================================

const RESEND_COOLDOWN_SECONDS = 60;

// ============================================
// Component
// ============================================

export default function ForgotPasswordPage() {
  // Redirect if already authenticated
  useRedirectIfAuthenticated('/dashboard');

  // Page state
  const [state, setState] = useState<PageState>('form');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // tRPC mutation for requesting password reset
  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation();

  // Handle password reset request
  const handleSubmit = useCallback(
    async (submittedEmail: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await requestResetMutation.mutateAsync({ email: submittedEmail });

        // Update state — server always returns success to prevent email enumeration
        setEmail(submittedEmail);
        setState('sent');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } catch (err: unknown) {
        // Handle rate limiting
        const trpcError = err as { data?: { code?: string }; message?: string };
        if (trpcError.data?.code === 'TOO_MANY_REQUESTS') {
          setError('Too many requests. Please try again in a few minutes.');
        } else {
          setError('An error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [requestResetMutation]
  );

  // Handle resend request
  const handleResend = useCallback(async () => {
    if (!email || resendCooldown > 0) return;

    setIsResending(true);
    setError(null);

    try {
      await requestResetMutation.mutateAsync({ email });

      // Reset cooldown
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      const trpcError = err as { data?: { code?: string }; message?: string };
      if (trpcError.data?.code === 'TOO_MANY_REQUESTS') {
        setError('Too many requests. Please try again in a few minutes.');
      } else {
        setError('Failed to resend. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  }, [email, resendCooldown, requestResetMutation]);

  // Handle change email (go back to form)
  const handleChangeEmail = useCallback(() => {
    setState('form');
    setError(null);
  }, []);

  return (
    <AuthBackground>
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <AuthCard
          badge="INTELLIFLOW"
          badgeIcon="lock_reset"
          title={state === 'form' ? 'Forgot your password?' : 'Check your email'}
          description={
            state === 'form' ? "No worries, we'll send you reset instructions." : undefined
          }
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
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <span
                  className="material-symbols-outlined text-red-400 flex-shrink-0"
                  aria-hidden="true"
                >
                  error
                </span>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          )}

          {/* Form State */}
          {state === 'form' && (
            <ForgotPasswordForm
              onSubmit={handleSubmit}
              isLoading={isLoading}
              initialEmail={email}
            />
          )}

          {/* Sent State */}
          {state === 'sent' && (
            <ResetEmailSent
              email={email}
              onResend={handleResend}
              onChangeEmail={handleChangeEmail}
              isResending={isResending}
              resendCooldown={resendCooldown}
            />
          )}
        </AuthCard>

        {/* Security Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            <span
              className="material-symbols-outlined text-sm align-middle mr-1"
              aria-hidden="true"
            >
              security
            </span>
            Your password reset link is valid for 1 hour and can only be used once.
          </p>
        </div>

        {/* Help Link */}
        <div className="mt-4 text-center">
          <Link
            href="/support"
            className={cn(
              'text-sm text-slate-400 hover:text-white transition-colors',
              'inline-flex items-center gap-1'
            )}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              help
            </span>
            Need help?
          </Link>
        </div>
      </div>
    </AuthBackground>
  );
}
