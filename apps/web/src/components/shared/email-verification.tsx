'use client';

/**
 * Email Verification Component
 *
 * Displays email verification status and handles verification flow.
 *
 * IMPLEMENTS: PG-023 (Email Verification page)
 *
 * Features:
 * - Token validation and verification
 * - Loading/Success/Error states
 * - Resend functionality with rate limiting
 * - Accessibility support
 * - Auto-redirect on success
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

// ============================================
// Helpers
// ============================================

type VerifyMutationFn = (args: {
  token_hash: string;
  type: 'email' | 'signup';
}) => Promise<{ email?: string | null }>;

async function runEmailVerification(
  hash: string,
  type: 'email' | 'signup',
  verifyMutation: VerifyMutationFn,
  callbacks: {
    setStatus: (s: import('./email-verification').VerificationStatus) => void;
    setMessage: (m: string) => void;
    setVerifiedEmail: (e: string | null) => void;
    onVerified?: () => void;
    onError?: (e: string) => void;
  }
): Promise<void> {
  const { setStatus, setMessage, setVerifiedEmail, onVerified, onError } = callbacks;
  if (!hash || hash.length < 6) {
    setStatus('invalid');
    setMessage('This verification link is invalid.');
    onError?.('Invalid verification link');
    return;
  }
  try {
    const result = await verifyMutation({ token_hash: hash, type });
    setStatus('success');
    setMessage('Your email has been verified successfully!');
    setVerifiedEmail(result.email || null);
    onVerified?.();
  } catch (err: unknown) {
    const trpcError = err as { data?: { code?: string }; message?: string };
    if (trpcError.data?.code === 'BAD_REQUEST') {
      setStatus('expired');
      setMessage('This verification link has expired or is invalid.');
    } else {
      setStatus('error');
      setMessage('Failed to verify email. Please try again.');
    }
    onError?.(trpcError.message || 'Verification failed');
  }
}

// ============================================
// Types
// ============================================

export type VerificationStatus =
  | 'loading'
  | 'success'
  | 'expired'
  | 'invalid'
  | 'already_verified'
  | 'error';

export interface EmailVerificationProps {
  /** Legacy prop — ignored when tokenHash is provided */
  token?: string;
  /** Supabase token_hash from callback URL */
  tokenHash?: string;
  /** Supabase type from callback URL */
  type?: 'email' | 'signup';
  email?: string;
  onVerified?: () => void;
  onError?: (error: string) => void;
  redirectUrl?: string;
  className?: string;
}

// ============================================
// Status Icon Component
// ============================================

interface StatusIconProps {
  status: VerificationStatus;
}

function StatusIcon({ status }: Readonly<StatusIconProps>) {
  const iconMap: Record<VerificationStatus, { icon: string; color: string }> = {
    loading: { icon: 'sync', color: 'text-[#137fec]' },
    success: { icon: 'verified', color: 'text-green-500' },
    expired: { icon: 'schedule', color: 'text-amber-500' },
    invalid: { icon: 'error', color: 'text-red-500' },
    already_verified: { icon: 'check_circle', color: 'text-green-500' },
    error: { icon: 'warning', color: 'text-red-500' },
  };

  const { icon, color } = iconMap[status];

  return (
    <div
      className={cn(
        'w-20 h-20 rounded-full flex items-center justify-center mb-6',
        status === 'loading' ? 'bg-[#137fec]/10' : '',
        status === 'success' || status === 'already_verified' ? 'bg-green-500/10' : '',
        status === 'expired' ? 'bg-amber-500/10' : '',
        status === 'invalid' || status === 'error' ? 'bg-red-500/10' : ''
      )}
    >
      <span
        className={cn(
          'material-symbols-outlined text-5xl',
          color,
          status === 'loading' && 'animate-spin'
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
  );
}

// ============================================
// Email Verification Component
// ============================================

const STATUS_TITLES: Record<VerificationStatus, string | null> = {
  loading: 'Verifying Email',
  success: 'Email Verified!',
  expired: 'Link Expired',
  invalid: 'Invalid Link',
  already_verified: 'Already Verified',
  error: 'Verification Failed',
};

export function EmailVerification({
  token,
  tokenHash,
  type = 'email',
  email,
  onVerified,
  onError,
  redirectUrl = '/dashboard',
  className,
}: Readonly<EmailVerificationProps>) {
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [showExpiryWarning] = useState(false);

  // tRPC mutations
  const verifyEmailMutation = trpc.auth.verifyEmail.useMutation();
  const resendMutation = trpc.auth.resendVerification.useMutation();

  // Verify token on mount via tRPC
  useEffect(() => {
    // Resolve the actual token hash — prefer tokenHash prop, fallback to legacy token
    const hash = tokenHash || token;
    runEmailVerification(hash || '', type, verifyEmailMutation.mutateAsync, {
      setStatus,
      setMessage,
      setVerifiedEmail,
      onVerified,
      onError,
    });
    // Run only once on mount — deps intentionally empty
  }, []);

  // Handle resend via tRPC
  const handleResend = useCallback(async () => {
    if (!email || isResending) return;

    setIsResending(true);
    setResendMessage(null);

    try {
      await resendMutation.mutateAsync({ email });
      setResendMessage('A new verification link has been sent to your email.');
    } catch (err: unknown) {
      const trpcError = err as { data?: { code?: string }; message?: string };
      const isTooManyRequests = trpcError.data?.code === 'TOO_MANY_REQUESTS';
      setResendMessage(
        isTooManyRequests
          ? 'Too many requests. Please try again in a few minutes.'
          : 'Failed to send verification email. Please try again.'
      );
    } finally {
      setIsResending(false);
    }
  }, [email, isResending, resendMutation]);

  // Get action content based on status
  const getActionContent = () => {
    switch (status) {
      case 'success':
        return (
          <Link
            href={redirectUrl}
            className={cn(
              'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
              'bg-[#137fec] text-white font-medium',
              'hover:bg-[#137fec]/90 transition-colors',
              'focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
            )}
            aria-label="Continue to dashboard"
          >
            Continue to Dashboard{' '}
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        );

      case 'already_verified':
        return (
          <Link
            href="/login"
            className={cn(
              'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
              'bg-[#137fec] text-white font-medium',
              'hover:bg-[#137fec]/90 transition-colors',
              'focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
            )}
            aria-label="Go to login page"
          >
            Sign In{' '}
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              login
            </span>
          </Link>
        );

      case 'expired':
        return (
          <div className="space-y-4">
            {email && (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className={cn(
                  'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
                  'bg-[#137fec] text-white font-medium',
                  'hover:bg-[#137fec]/90 transition-colors',
                  'focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                aria-label="Resend verification email"
              >
                {isResending ? (
                  <>
                    <span
                      className="material-symbols-outlined text-xl animate-spin"
                      aria-hidden="true"
                    >
                      sync
                    </span>{' '}
                    Sending...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-xl" aria-hidden="true">
                      mail
                    </span>{' '}
                    Resend Verification Email
                  </>
                )}
              </button>
            )}
            {resendMessage && (
              <output
                className={cn(
                  'text-sm',
                  resendMessage.includes('sent') ? 'text-green-400' : 'text-amber-400'
                )}
              >
                {resendMessage}
              </output>
            )}
          </div>
        );

      case 'invalid':
        return (
          <Link
            href="/signup"
            className={cn(
              'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
              'bg-slate-700 text-white font-medium',
              'hover:bg-slate-600 transition-colors',
              'focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
            )}
            aria-label="Go to sign up page"
          >
            Sign Up{' '}
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              person_add
            </span>
          </Link>
        );

      case 'error':
        return (
          <div className="space-y-3">
            <Link
              href="/signup"
              className={cn(
                'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
                'bg-slate-700 text-white font-medium',
                'hover:bg-slate-600 transition-colors',
                'focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
              )}
              aria-label="Try signing up again"
            >
              Try Again{' '}
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                refresh
              </span>
            </Link>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <main className={cn('text-center', className)} data-testid="email-verification">
      {/* Status Icon */}
      <div className="flex justify-center">
        <StatusIcon status={status} />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white mb-2">{STATUS_TITLES[status]}</h1>

      {/* Message */}
      <output className="text-slate-400 mb-8 max-w-md mx-auto block">{message}</output>

      {/* Verified Email (on success) */}
      {verifiedEmail && status === 'success' && (
        <p className="text-sm text-slate-300 mb-6">
          <span
            className="material-symbols-outlined text-green-500 text-sm align-middle mr-1"
            aria-hidden="true"
          >
            check_circle
          </span>{' '}
          {verifiedEmail}
        </p>
      )}

      {/* Show warning if token is expiring soon */}
      {showExpiryWarning && (status === 'expired' || status === 'loading') && (
        <div className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
          <span
            className="material-symbols-outlined text-amber-500 text-lg mt-0.5 flex-shrink-0"
            aria-hidden="true"
          >
            schedule
          </span>
          <p className="text-xs text-amber-300 text-left">
            This verification link will expire soon (within 1 hour). Please complete verification
            quickly or request a new link.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col items-center gap-4">{getActionContent()}</div>

      {/* Help Text */}
      {status !== 'loading' && (
        <p className="mt-8 text-sm text-slate-500">
          Need help?{' '}
          <Link href="/contact" className="text-[#137fec] hover:text-[#7cc4ff] transition-colors">
            Contact Support
          </Link>
        </p>
      )}
    </main>
  );
}
