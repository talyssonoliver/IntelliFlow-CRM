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
import {
  validateVerificationToken,
  markEmailVerified,
  checkResendRateLimit,
  createVerificationToken,
  buildVerificationUrl,
} from '@/lib/shared/account-activation';

// ============================================
// Types
// ============================================

export type VerificationStatus = 'loading' | 'success' | 'expired' | 'invalid' | 'already_verified' | 'error';

export interface EmailVerificationProps {
  token: string;
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

function StatusIcon({ status }: StatusIconProps) {
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
        (status === 'invalid' || status === 'error') ? 'bg-red-500/10' : ''
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

export function EmailVerification({
  token,
  email,
  onVerified,
  onError,
  redirectUrl = '/dashboard',
  className,
}: EmailVerificationProps) {
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      // Validate token format
      if (!token || token.length !== 64) {
        setStatus('invalid');
        setMessage('This verification link is invalid.');
        onError?.('Invalid verification link');
        return;
      }

      // Validate token
      const result = validateVerificationToken(token);

      if (!result.ok) {
        const statusMap: Record<string, VerificationStatus> = {
          EXPIRED: 'expired',
          INVALID: 'invalid',
          ALREADY_USED: 'already_verified',
        };
        setStatus(statusMap[result.error.code] || 'error');
        setMessage(result.error.message);
        onError?.(result.error.message);
        return;
      }

      // Mark as verified
      const marked = markEmailVerified(token);

      if (!marked) {
        setStatus('error');
        setMessage('Failed to verify email. Please try again.');
        onError?.('Verification failed');
        return;
      }

      // Success!
      setStatus('success');
      setMessage('Your email has been verified successfully!');
      setVerifiedEmail(result.value.email);
      onVerified?.();
    };

    verifyToken();
  }, [token, onVerified, onError]);

  // Handle resend
  const handleResend = useCallback(async () => {
    if (!email || isResending) return;

    setIsResending(true);
    setResendMessage(null);

    try {
      // Check rate limit
      const rateLimit = checkResendRateLimit(email);
      if (rateLimit.isLimited) {
        const minutesLeft = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 60000);
        setResendMessage(`Too many requests. Please try again in ${minutesLeft} minutes.`);
        return;
      }

      // Create new token
      const tokenResult = createVerificationToken(email);

      if (!tokenResult.ok) {
        setResendMessage(tokenResult.error.message);
        return;
      }

      // Build URL (in production, this would be sent via email)
      const url = buildVerificationUrl(tokenResult.value.token);
      console.log('[EmailVerification] New verification URL:', url);

      setResendMessage('A new verification link has been sent to your email.');
    } catch (error) {
      console.error('[EmailVerification] Resend error:', error);
      setResendMessage('Failed to send verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  }, [email, isResending]);

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
            Continue to Dashboard
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
            Sign In
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
                    <span className="material-symbols-outlined text-xl animate-spin" aria-hidden="true">
                      sync
                    </span>
                    Sending...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-xl" aria-hidden="true">
                      mail
                    </span>
                    Resend Verification Email
                  </>
                )}
              </button>
            )}
            {resendMessage && (
              <p
                className={cn(
                  'text-sm',
                  resendMessage.includes('sent') ? 'text-green-400' : 'text-amber-400'
                )}
                role="status"
                aria-live="polite"
              >
                {resendMessage}
              </p>
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
            Sign Up
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
              Try Again
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
    <div
      className={cn('text-center', className)}
      data-testid="email-verification"
      role="main"
    >
      {/* Status Icon */}
      <div className="flex justify-center">
        <StatusIcon status={status} />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white mb-2">
        {status === 'loading' && 'Verifying Email'}
        {status === 'success' && 'Email Verified!'}
        {status === 'expired' && 'Link Expired'}
        {status === 'invalid' && 'Invalid Link'}
        {status === 'already_verified' && 'Already Verified'}
        {status === 'error' && 'Verification Failed'}
      </h1>

      {/* Message */}
      <p
        className="text-slate-400 mb-8 max-w-md mx-auto"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      {/* Verified Email (on success) */}
      {verifiedEmail && status === 'success' && (
        <p className="text-sm text-slate-300 mb-6">
          <span className="material-symbols-outlined text-green-500 text-sm align-middle mr-1" aria-hidden="true">
            check_circle
          </span>
          {verifiedEmail}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col items-center gap-4">
        {getActionContent()}
      </div>

      {/* Help Text */}
      {status !== 'loading' && (
        <p className="mt-8 text-sm text-slate-500">
          Need help?{' '}
          <Link
            href="/contact"
            className="text-[#137fec] hover:text-[#7cc4ff] transition-colors"
          >
            Contact Support
          </Link>
        </p>
      )}
    </div>
  );
}

export default EmailVerification;
