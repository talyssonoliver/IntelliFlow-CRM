'use client';

/**
 * MFA Verification Component
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * A wrapper component for MFA verification that integrates with:
 * - Existing MfaChallenge component
 * - tRPC auth.verifyMfa endpoint
 * - URL params for standalone usage
 * - Success redirect logic
 *
 * Used by both standalone /mfa/verify page and inline MFA flow.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { MfaChallenge, type MfaMethod } from '@/components/auth/mfa-challenge';
import { trpc } from '@/lib/trpc';
import { sanitizeCode, isValidTotpCode, isValidBackupCode } from '@/lib/shared/code-validator';

// ============================================
// Types
// ============================================

export interface MfaVerificationProps {
  /**
   * Challenge ID from URL or direct prop
   */
  challengeId?: string;
  /**
   * User email for display
   */
  email?: string;
  /**
   * Pre-selected MFA method
   */
  method?: MfaMethod;
  /**
   * Available methods for this user
   */
  availableMethods?: MfaMethod[];
  /**
   * Called after successful verification
   */
  onSuccess: () => void;
  /**
   * Called when user cancels verification
   */
  onCancel?: () => void;
  /**
   * URL to redirect to after success
   */
  redirectUrl?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Masked phone number for SMS display
   */
  maskedPhone?: string;
  /**
   * Masked email for display
   */
  maskedEmail?: string;
}

interface ChallengeData {
  challengeId: string;
  method: MfaMethod;
  email?: string;
  expiresAt: string;
  availableMethods?: MfaMethod[];
  maskedPhone?: string;
  maskedEmail?: string;
}

// ============================================
// Component
// ============================================

export function MfaVerification({
  challengeId: propChallengeId,
  email,
  method: propMethod = 'totp',
  availableMethods = ['totp', 'sms', 'email', 'backup'],
  onSuccess,
  onCancel,
  redirectUrl,
  className,
  maskedPhone,
  maskedEmail,
}: MfaVerificationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get challenge ID from props or URL
  const challengeId = propChallengeId || searchParams.get('challenge') || undefined;
  const urlRedirect = searchParams.get('redirect') || redirectUrl;

  // State
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isInvalidChallenge, _setIsInvalidChallenge] = useState(false);
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(null);

  // tRPC mutations
  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation();

  // Check if we have a valid challenge
  useEffect(() => {
    // If we have a challengeId, we could fetch challenge data here
    // For now, we'll use props or default values
    if (challengeId) {
      // Simulate challenge validation
      // In production, this would call auth.getMfaChallenge
      setChallengeData({
        challengeId,
        method: propMethod,
        email,
        expiresAt: new Date(Date.now() + 300000).toISOString(), // 5 minutes
        availableMethods,
        maskedPhone,
        maskedEmail,
      });
    }
  }, [challengeId, propMethod, email, availableMethods, maskedPhone, maskedEmail]);

  // Check expiration
  useEffect(() => {
    if (challengeData?.expiresAt) {
      const expiresAt = new Date(challengeData.expiresAt);
      if (expiresAt < new Date()) {
        setIsExpired(true);
        setError('This verification link has expired. Please request a new one.');
      }
    }
  }, [challengeData]);

  /**
   * Handle code verification
   */
  const handleVerify = useCallback(
    async (code: string, method: MfaMethod): Promise<boolean> => {
      setError(null);

      // Validate code format
      const sanitized = sanitizeCode(code);

      if (method === 'backup') {
        if (!isValidBackupCode(code)) {
          setError('Invalid backup code format');
          return false;
        }
      } else {
        if (!isValidTotpCode(sanitized)) {
          setError('Please enter a valid 6-digit code');
          return false;
        }
      }

      try {
        const result = await verifyMfaMutation.mutateAsync({
          code: method === 'backup' ? code : sanitized,
          method,
          challengeId: challengeId || 'inline',
        });

        if (result.success) {
          // Call success callback
          onSuccess();

          // Redirect if URL provided
          if (urlRedirect) {
            router.push(urlRedirect);
          }

          return true;
        }

        setError('Verification failed. Please try again.');
        return false;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Verification failed';

        // Handle specific error types
        if (message.includes('expired')) {
          setIsExpired(true);
          setError('This verification code has expired. Please request a new one.');
        } else if (message.includes('invalid') || message.includes('incorrect')) {
          setError('Invalid verification code. Please check and try again.');
        } else if (message.includes('attempts')) {
          setError('Too many failed attempts. Please wait and try again.');
        } else {
          setError(message);
        }

        return false;
      }
    },
    [challengeId, onSuccess, router, urlRedirect, verifyMfaMutation]
  );

  /**
   * Handle resend code request
   */
  const handleResend = useCallback(
    async (_method: 'sms' | 'email'): Promise<boolean> => {
      try {
        // TODO: Call auth.resendMfaCode with _method when implemented
        // For now, simulate success
        return true;
      } catch {
        setError('Failed to resend code. Please try again.');
        return false;
      }
    },
    []
  );

  // Render expired state
  if (isExpired) {
    return (
      <div className={cn('text-center py-8', className)}>
        <span
          className="material-symbols-outlined text-6xl text-amber-500 mb-4"
          aria-hidden="true"
        >
          schedule
        </span>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Verification Expired
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          This verification link has expired or is no longer valid.
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900"
            aria-label="Return to login"
          >
            Return to Login
          </button>
        )}
      </div>
    );
  }

  // Render invalid challenge state
  if (isInvalidChallenge) {
    return (
      <div className={cn('text-center py-8', className)}>
        <span
          className="material-symbols-outlined text-6xl text-destructive mb-4"
          aria-hidden="true"
        >
          error
        </span>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Invalid Verification Link
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          This verification link is not valid or has already been used.
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900"
            aria-label="Return to login"
          >
            Return to Login
          </button>
        )}
      </div>
    );
  }

  // Get effective values from challenge data or props
  const effectiveEmail = challengeData?.email || email;
  const effectiveMethods = challengeData?.availableMethods || availableMethods;
  const effectiveMethod = challengeData?.method || propMethod;
  const effectiveMaskedPhone = challengeData?.maskedPhone || maskedPhone;
  const effectiveMaskedEmail = challengeData?.maskedEmail || maskedEmail;

  return (
    <div className={cn('w-full', className)} data-testid="mfa-verification">
      {/* Email display */}
      {effectiveEmail && (
        <div className="mb-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Verifying for
          </p>
          <p className="font-medium text-slate-900 dark:text-white">
            {effectiveEmail}
          </p>
        </div>
      )}

      {/* Loading indicator (for test) */}
      {verifyMfaMutation.isPending && (
        <div
          data-testid="loading-indicator"
          className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10"
          role="progressbar"
          aria-label="Verifying code"
        >
          <span className="material-symbols-outlined animate-spin text-3xl text-primary">
            progress_activity
          </span>
        </div>
      )}

      {/* MFA Challenge Component */}
      <MfaChallenge
        availableMethods={effectiveMethods}
        defaultMethod={effectiveMethod}
        onVerify={handleVerify}
        onResend={handleResend}
        onCancel={onCancel}
        error={error}
        isLoading={verifyMfaMutation.isPending}
        maskedPhone={effectiveMaskedPhone}
        maskedEmail={effectiveMaskedEmail}
      />
    </div>
  );
}
